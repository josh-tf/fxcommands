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

import { CAPTURE_TIMEOUT_MS, ConnectionManager } from "../connection-manager";

const logger = streamDeck.logger.createScope("FXCommandAction");
const MAX_STATES = 5;
const DELAY_MS = 500;
const ROTATION_MAX = 255;
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
		responseTimeoutMs: CAPTURE_TIMEOUT_MS
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
		commandPressedResponse: !!pressedResponse,
		commandReleasedResponse: !!releasedResponse
	};
}

@action({ UUID: "tf.josh.fxcommands" })
export class FXCommandAction extends SingletonAction<FXCommandSettings> {
	private connectionManager = new ConnectionManager();
	private states = new Map<string, number>();
	private rotations = new Map<string, number>();
	private layouts = new Map<string, string>();

	override async onWillAppear(ev: WillAppearEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		const currentState = settings.currentState ?? 0;
		this.states.set(ev.action.id, currentState);
		this.rotations.set(ev.action.id, settings.rotationValue ?? 0);
		this.connectionManager.setDefaultTimeout(settings.responseTimeoutMs);

		await ev.action.setSettings(settings);

		if (ev.action.isKey()) {
			await ev.action.setState(currentState);
			if (settings.responseLabel) {
				await ev.action.setTitle(buildLabelTitle(settings.responseLabel, ""));
			}
		}

		// Pre-connect so the first key press sends immediately
		await this.connectionManager.connect();

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
		command: string,
		expectResponse: boolean,
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
					const result = await this.connectionManager.sendWithToken(token.value);
					if (!result.sent) success = false;
					if (result.response) response = result.response;
				} else {
					const sent = await this.connectionManager.send(token.value);
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
		if (!settings.commandInit) return;
		const { response } = await this.sendCommand(settings.commandInit, true);
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
			const { success, response } = await this.sendCommand(cmd.commandPressed, cmd.commandPressedResponse);
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
			const { success, response } = await this.sendCommand(cmd.commandReleased, cmd.commandReleasedResponse);
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
		const expectResponse = ticks < 0 ? settings.commandRotateLeftResponse : settings.commandRotateRightResponse;
		if (template) {
			logger.debug(`DialRotate [${ticks}]: ${template}`);
			const { success, response } = await this.sendCommand(template, expectResponse, {
				ticks,
				rotationPercent,
				rotationAbsolute
			});
			if (!success) await ev.action.showAlert();
			if (expectResponse) {
				await this.showResponse(ev.action, response, settings.responseLabel);
			} else if (settings.commandInitRunOnNoResponse) {
				await this.runInitCommand(ev.action, settings);
			}
		}

		settings.rotationValue = rotationAbsolute;
		await ev.action.setSettings(settings);
	}

	override async onTouchTap(ev: TouchTapEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };

		if (settings.commandTouch) {
			logger.debug(`TouchTap: ${settings.commandTouch}`);
			const { success, response } = await this.sendCommand(settings.commandTouch, settings.commandTouchResponse);
			if (!success) await ev.action.showAlert();
			if (settings.commandTouchResponse) {
				await this.showResponse(ev.action, response, settings.responseLabel);
			} else if (settings.commandInitRunOnNoResponse) {
				await this.runInitCommand(ev.action, settings);
			}
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		this.states.set(ev.action.id, settings.currentState ?? 0);
		this.rotations.set(ev.action.id, settings.rotationValue ?? 0);
		this.connectionManager.setDefaultTimeout(settings.responseTimeoutMs);
	}

	override async onWillDisappear(ev: WillDisappearEvent<FXCommandSettings>): Promise<void> {
		this.states.delete(ev.action.id);
		this.rotations.delete(ev.action.id);
		this.layouts.delete(ev.action.id);
	}
}
