import streamDeck, {
	action,
	DialAction,
	DialDownEvent,
	DialRotateEvent,
	DialUpEvent,
	DidReceiveSettingsEvent,
	KeyAction,
	KeyDownEvent,
	KeyUpEvent,
	SingletonAction,
	TouchTapEvent,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";

import { CAPTURE_TIMEOUT_MS, ConnectionManager, DEFAULT_HOST, DEFAULT_PORT } from "../connection-manager";

const logger = streamDeck.logger.createScope("FXCommandAction");
const MAX_STATES = 5;
const DELAY_MS = 500;
const ROTATION_MAX = 255;
const ROTATION_PERSIST_MS = 400;
const INIT_REFRESH_MS = 300;
const PERCENT_LAYOUT = "$B1";
const DEFAULT_LAYOUT = "$A1";
const PERCENT_PATTERN = /^(100(?:\.0+)?|\d{1,2}(?:\.\d+)?)\s*%$/;

/** Delay helper. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildLabelTitle(template: string, value: string): string {
	return template.replace(/\\n/g, "\n").replace(/\{value\}/g, value);
}

/** Per-state command pair. */
type CommandAction = {
	commandPressed: string;
	commandReleased: string;
	commandPressedResponse: boolean;
	commandReleasedResponse: boolean;
};

/** Settings shape persisted per action instance. */
type FXCommandSettings = {
	currentState: number;
	desiredStates: number;
	commandPressed0: string;
	commandReleased0: string;
	commandPressed0Response: boolean;
	commandReleased0Response: boolean;
	commandPressed1: string;
	commandReleased1: string;
	commandPressed1Response: boolean;
	commandReleased1Response: boolean;
	commandPressed2: string;
	commandReleased2: string;
	commandPressed2Response: boolean;
	commandReleased2Response: boolean;
	commandPressed3: string;
	commandReleased3: string;
	commandPressed3Response: boolean;
	commandReleased3Response: boolean;
	commandPressed4: string;
	commandReleased4: string;
	commandPressed4Response: boolean;
	commandReleased4Response: boolean;
	rotationValue: number;
	commandRotateLeft: string;
	commandRotateRight: string;
	commandRotateLeftResponse: boolean;
	commandRotateRightResponse: boolean;
	commandTouch: string;
	commandTouchResponse: boolean;
	responseLabel: string;
	commandInit: string;
	commandInitRunOnNoResponse: boolean;
	responseTimeoutMs: number;
	/** Property Inspector only: hides the response controls. Absent on configs predating it. */
	responsesEnabled: boolean;
	/** Advanced Settings: gates the console IP/port overrides below. */
	customServerEnabled: boolean;
	/** Only consulted when customServerEnabled. Blank/0 falls back to the default. */
	serverIp?: string;
	serverPort?: number;
};

function defaultSettings(): FXCommandSettings {
	return {
		currentState: 0,
		desiredStates: 1,
		commandPressed0: "",
		commandReleased0: "",
		commandPressed0Response: false,
		commandReleased0Response: false,
		commandPressed1: "",
		commandReleased1: "",
		commandPressed1Response: false,
		commandReleased1Response: false,
		commandPressed2: "",
		commandReleased2: "",
		commandPressed2Response: false,
		commandReleased2Response: false,
		commandPressed3: "",
		commandReleased3: "",
		commandPressed3Response: false,
		commandReleased3Response: false,
		commandPressed4: "",
		commandReleased4: "",
		commandPressed4Response: false,
		commandReleased4Response: false,
		commandTouch: "",
		commandTouchResponse: false,
		rotationValue: 0,
		commandRotateLeft: "",
		commandRotateRight: "",
		commandRotateLeftResponse: false,
		commandRotateRightResponse: false,
		responseLabel: "",
		commandInit: "",
		commandInitRunOnNoResponse: false,
		responseTimeoutMs: CAPTURE_TIMEOUT_MS,
		responsesEnabled: false,
		customServerEnabled: false,
		serverIp: ""
	};
}

/** Extract the command pair for a given state index from flat settings. */
function getCommandAction(settings: FXCommandSettings, stateIndex: number): CommandAction {
	const pressed = settings[`commandPressed${stateIndex}` as keyof FXCommandSettings] as string;
	const released = settings[`commandReleased${stateIndex}` as keyof FXCommandSettings] as string;
	const pressedResponse = settings[`commandPressed${stateIndex}Response` as keyof FXCommandSettings] as boolean;
	const releasedResponse = settings[`commandReleased${stateIndex}Response` as keyof FXCommandSettings] as boolean;
	return {
		commandPressed: pressed || "",
		commandReleased: released || "",
		commandPressedResponse: settings.responsesEnabled && !!pressedResponse,
		commandReleasedResponse: settings.responsesEnabled && !!releasedResponse
	};
}

@action({ UUID: "tf.josh.fxcommands" })
export class FXCommandAction extends SingletonAction<FXCommandSettings> {
	private connectionManagers = new Map<string, ConnectionManager>();
	private states = new Map<string, number>();
	private rotations = new Map<string, number>();
	private layouts = new Map<string, string>();
	private rotationPersists = new Map<string, { timer: ReturnType<typeof setTimeout>; flush: () => void }>();
	private initRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private responseSeq = new Map<string, number>();

	/**
	 * Get or create the connection for this action's configured (or default) host/port.
	 * The overrides are ignored unless the toggle is on, so switching it off restores
	 * the local default without having to clear the fields.
	 */
	private getConnectionManager(settings: FXCommandSettings): ConnectionManager {
		const custom = settings.customServerEnabled;
		const host = (custom ? settings.serverIp?.trim() : "") || DEFAULT_HOST;
		const port = (custom ? settings.serverPort : 0) || DEFAULT_PORT;
		const key = `${host}:${port}`;

		let manager = this.connectionManagers.get(key);
		if (!manager) {
			manager = new ConnectionManager(host, port);
			this.connectionManagers.set(key, manager);
		}
		return manager;
	}

	/**
	 * Run the init command once a burst of dial movement settles, so a fast spin
	 * costs one refresh rather than one command (and one capture window) per detent.
	 */
	private scheduleInitRefresh(
		action: KeyAction<FXCommandSettings> | DialAction<FXCommandSettings>,
		settings: FXCommandSettings
	): void {
		const existing = this.initRefreshTimers.get(action.id);
		if (existing) clearTimeout(existing);

		const timer = setTimeout(() => {
			this.initRefreshTimers.delete(action.id);
			void this.runInitCommand(action, settings);
		}, INIT_REFRESH_MS);

		this.initRefreshTimers.set(action.id, timer);
	}

	/**
	 * Persist the rotation value once a burst of dial movement settles.
	 *
	 * A dial emits a stream of rotate events, and calling setSettings on each one
	 * both writes the profile to disk repeatedly and pushes didReceiveSettings to
	 * an open Property Inspector, which would reload its fields mid-edit.
	 */
	private schedulePersistRotation(action: DialAction<FXCommandSettings>): void {
		const existing = this.rotationPersists.get(action.id);
		if (existing) clearTimeout(existing.timer);

		const flush = (): void => {
			this.rotationPersists.delete(action.id);
			// Re-read rather than writing a snapshot captured when the timer was set.
			// setSettings replaces the whole object, so persisting a stale copy would
			// revert anything edited in the Property Inspector during the debounce.
			void (async () => {
				const current = await action.getSettings();
				await action.setSettings({ ...current, rotationValue: this.rotations.get(action.id) ?? 0 });
			})();
		};

		this.rotationPersists.set(action.id, { timer: setTimeout(flush, ROTATION_PERSIST_MS), flush });
	}

	override async onWillAppear(ev: WillAppearEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		const currentState = settings.currentState ?? 0;
		this.states.set(ev.action.id, currentState);
		this.rotations.set(ev.action.id, settings.rotationValue ?? 0);

		await ev.action.setSettings(settings);

		if (ev.action.isKey()) {
			await ev.action.setState(currentState);
			if (settings.responsesEnabled && settings.responseLabel) {
				await ev.action.setTitle(buildLabelTitle(settings.responseLabel, ""));
			} else {
				await ev.action.setTitle(undefined);
			}
		}

		// Pre-connect so the first key press sends immediately
		await this.getConnectionManager(settings).connect();

		// Page switches clear any previously displayed value, so re-run the init
		// command every time the button appears to restore it.
		await this.runInitCommand(ev.action, settings);
	}

	/**
	 * Send a command string, supporting delayed sequences.
	 * Use ;; for a default 500ms delay, or {ms} for a custom delay.
	 * Single ; is passed through to FiveM as a native chained command.
	 * Any other {name} is substituted from `vars`, e.g. {ticks}.
	 *
	 * Examples:
	 *   "e sit;;me relaxes"              500ms delay between commands
	 *   "me sits;{500ms};me stands up"   500ms delay with explicit syntax
	 *   "e sit;{1500ms};me looks;{2000ms};e c"
	 */
	private async sendCommand(
		connectionManager: ConnectionManager,
		command: string,
		expectResponse: boolean,
		timeoutMs: number,
		vars: Record<string, string | number> = {}
	): Promise<{ success: boolean; response: string | null }> {
		const substitute = (text: string): string =>
			text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));

		// Split into tokens: commands and delay markers
		// ;; becomes a 500ms delay, {NNNms} becomes an NNN ms delay
		const tokens: Array<{ type: "cmd"; value: string } | { type: "delay"; ms: number }> = [];
		let remaining = command;

		while (remaining.length > 0) {
			const match = remaining.match(/;?;;|;?\{(\d+)ms\};?/i);
			if (!match) {
				tokens.push({ type: "cmd", value: substitute(remaining.trim()) });
				break;
			}
			const before = remaining.slice(0, match.index).trim();
			if (before) tokens.push({ type: "cmd", value: substitute(before) });
			const ms = match[1] ? parseInt(match[1]) : DELAY_MS;
			tokens.push({ type: "delay", ms });
			remaining = remaining.slice(match.index! + match[0].length);
		}

		let success = true;
		let response: string | null = null;
		for (const token of tokens) {
			if (token.type === "delay") {
				await sleep(token.ms);
			} else if (token.value) {
				if (expectResponse) {
					const result = await connectionManager.sendWithToken(token.value, timeoutMs);
					if (!result.sent) success = false;
					if (result.response) response = result.response;
				} else {
					const sent = await connectionManager.send(token.value);
					if (!sent) success = false;
				}
			}
		}
		return { success, response };
	}

	/**
	 * Show a captured console response on the action: dial feedback value, or key title.
	 * For key actions, `responseLabel` may contain a {value} placeholder to show the
	 * response alongside static text (e.g. "Vol: {value}"); otherwise the title is
	 * replaced with the raw response.
	 */
	private async showResponse(
		action: KeyAction<FXCommandSettings> | DialAction<FXCommandSettings>,
		response: string | null,
		responseLabel: string
	): Promise<void> {
		if (!response) return;
		if (action.isDial()) {
			const match = response.match(PERCENT_PATTERN);
			if (match) {
				const percent = Math.min(100, Math.max(0, parseFloat(match[1])));
				await this.setDialLayout(action, PERCENT_LAYOUT);
				await action.setFeedback({ value: response, indicator: percent });
			} else {
				await this.setDialLayout(action, DEFAULT_LAYOUT);
				await action.setFeedback({ value: response });
			}
		} else {
			const title = buildLabelTitle(responseLabel || "{value}", response);
			await action.setTitle(title);
		}
	}

	private async setDialLayout(action: DialAction<FXCommandSettings>, layout: string): Promise<void> {
		if (this.layouts.get(action.id) === layout) return;
		this.layouts.set(action.id, layout);
		await action.setFeedbackLayout(layout);
	}

	/**
	 * Run the init/refresh command and display its response.
	 */
	private async runInitCommand(
		action: KeyAction<FXCommandSettings> | DialAction<FXCommandSettings>,
		settings: FXCommandSettings
	): Promise<void> {
		if (!settings.commandInit || !settings.responsesEnabled) return;
		const { response } = await this.sendCommand(
			this.getConnectionManager(settings),
			settings.commandInit,
			true,
			settings.responseTimeoutMs
		);
		await this.showResponse(action, response, settings.responseLabel);
	}

	private async handlePress(
		action: KeyAction<FXCommandSettings> | DialAction<FXCommandSettings>,
		rawSettings: FXCommandSettings
	): Promise<void> {
		const settings = { ...defaultSettings(), ...rawSettings };
		const currentState = this.states.get(action.id) ?? 0;
		const cmd = getCommandAction(settings, currentState);

		if (cmd.commandPressed) {
			logger.debug(`Press [${currentState}]: ${cmd.commandPressed}`);
			const { success, response } = await this.sendCommand(
				this.getConnectionManager(settings),
				cmd.commandPressed,
				cmd.commandPressedResponse,
				settings.responseTimeoutMs
			);
			if (!success) await action.showAlert();
			if (cmd.commandPressedResponse) {
				await this.showResponse(action, response, settings.responseLabel);
			} else if (settings.commandInitRunOnNoResponse) {
				await this.runInitCommand(action, settings);
			}
		}
	}

	private async handleRelease(
		action: KeyAction<FXCommandSettings> | DialAction<FXCommandSettings>,
		rawSettings: FXCommandSettings
	): Promise<void> {
		const settings = { ...defaultSettings(), ...rawSettings };
		const currentState = this.states.get(action.id) ?? 0;
		const cmd = getCommandAction(settings, currentState);

		if (cmd.commandReleased) {
			logger.debug(`Release [${currentState}]: ${cmd.commandReleased}`);
			const { success, response } = await this.sendCommand(
				this.getConnectionManager(settings),
				cmd.commandReleased,
				cmd.commandReleasedResponse,
				settings.responseTimeoutMs
			);
			if (!success) await action.showAlert();
			if (cmd.commandReleasedResponse) {
				await this.showResponse(action, response, settings.responseLabel);
			} else if (settings.commandInitRunOnNoResponse) {
				await this.runInitCommand(action, settings);
			}
		}

		// Advance to next state
		const desiredStates = Math.min(Math.max(settings.desiredStates || 1, 1), MAX_STATES);
		const nextState = (currentState + 1) % desiredStates;
		this.states.set(action.id, nextState);

		settings.currentState = nextState;
		await action.setSettings(settings);
		if (action.isKey()) {
			await action.setState(nextState);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<FXCommandSettings>): Promise<void> {
		await this.handlePress(ev.action, ev.payload.settings);
	}

	override async onKeyUp(ev: KeyUpEvent<FXCommandSettings>): Promise<void> {
		await this.handleRelease(ev.action, ev.payload.settings);
	}

	override async onDialDown(ev: DialDownEvent<FXCommandSettings>): Promise<void> {
		await this.handlePress(ev.action, ev.payload.settings);
	}

	override async onDialUp(ev: DialUpEvent<FXCommandSettings>): Promise<void> {
		await this.handleRelease(ev.action, ev.payload.settings);
	}

	override async onDialRotate(ev: DialRotateEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		const ticks = ev.payload.ticks;
		if (!ticks) return;

		const current = this.rotations.get(ev.action.id) ?? settings.rotationValue ?? 0;
		const rotationAbsolute = Math.min(ROTATION_MAX, Math.max(0, current + ticks));
		const rotationPercent = Math.round((rotationAbsolute / ROTATION_MAX) * 100);
		this.rotations.set(ev.action.id, rotationAbsolute);

		const template = ticks < 0 ? settings.commandRotateLeft : settings.commandRotateRight;
		const expectResponse =
			settings.responsesEnabled &&
			(ticks < 0 ? settings.commandRotateLeftResponse : settings.commandRotateRightResponse);
		if (template) {
			logger.debug(`DialRotate [${ticks}]: ${template}`);

			// Rotate events arrive in bursts and each send is awaited, so several can be
			// in flight at once. Stamp this one and drop its response if a newer rotate
			// has started, otherwise a slow reply can overwrite a fresher value.
			const seq = (this.responseSeq.get(ev.action.id) ?? 0) + 1;
			this.responseSeq.set(ev.action.id, seq);

			const { success, response } = await this.sendCommand(
				this.getConnectionManager(settings),
				template,
				expectResponse,
				settings.responseTimeoutMs,
				{ ticks, rotationPercent, rotationAbsolute }
			);
			if (!success) await ev.action.showAlert();

			const isLatest = this.responseSeq.get(ev.action.id) === seq;
			if (expectResponse) {
				if (isLatest) await this.showResponse(ev.action, response, settings.responseLabel);
			} else if (settings.commandInitRunOnNoResponse) {
				// Coalesce the refresh: a fast spin should cost one init command, not one per detent.
				this.scheduleInitRefresh(ev.action, settings);
			}
		}

		this.schedulePersistRotation(ev.action);
	}

	override async onTouchTap(ev: TouchTapEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };

		if (settings.commandTouch) {
			logger.debug(`TouchTap: ${settings.commandTouch}`);
			const expectResponse = settings.responsesEnabled && settings.commandTouchResponse;
			const { success, response } = await this.sendCommand(
				this.getConnectionManager(settings),
				settings.commandTouch,
				expectResponse,
				settings.responseTimeoutMs
			);
			if (!success) await ev.action.showAlert();
			if (expectResponse) {
				await this.showResponse(ev.action, response, settings.responseLabel);
			} else if (settings.commandInitRunOnNoResponse) {
				await this.runInitCommand(ev.action, settings);
			}
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };

		// Reducing the state count can leave currentState pointing past the end, at a
		// stage no longer shown in the Property Inspector. Left alone the button would
		// keep firing that hidden stage's command, so clamp back into range.
		const desiredStates = Math.min(Math.max(settings.desiredStates || 1, 1), MAX_STATES);
		const currentState = Math.min(settings.currentState ?? 0, desiredStates - 1);

		this.states.set(ev.action.id, currentState);
		this.rotations.set(ev.action.id, settings.rotationValue ?? 0);

		if (currentState !== settings.currentState) {
			await ev.action.setSettings({ ...settings, currentState });
			if (ev.action.isKey()) await ev.action.setState(currentState);
		}
	}

	override async onWillDisappear(ev: WillDisappearEvent<FXCommandSettings>): Promise<void> {
		// Flush any rotation still waiting on the debounce so it survives a page switch.
		const pending = this.rotationPersists.get(ev.action.id);
		if (pending) {
			clearTimeout(pending.timer);
			pending.flush();
		}

		const pendingInit = this.initRefreshTimers.get(ev.action.id);
		if (pendingInit) {
			clearTimeout(pendingInit);
			this.initRefreshTimers.delete(ev.action.id);
		}

		this.states.delete(ev.action.id);
		this.rotations.delete(ev.action.id);
		this.layouts.delete(ev.action.id);
		this.responseSeq.delete(ev.action.id);
	}
}
