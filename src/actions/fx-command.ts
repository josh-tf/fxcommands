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

import { ConnectionManager } from "../connection-manager";

const logger = streamDeck.logger.createScope("FXCommandAction");
const MAX_STATES = 5;
const DELAY_MS = 500;
const ROTATION_MAX = 255;
const ROTATION_PERSIST_MS = 400;

/** Delay helper. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Per-state command pair. */
type CommandAction = {
	commandPressed: string;
	commandReleased: string;
};

/** Settings shape persisted per action instance. */
type FXCommandSettings = {
	currentState: number;
	desiredStates: number;
	commandPressed0: string;
	commandReleased0: string;
	commandPressed1: string;
	commandReleased1: string;
	commandPressed2: string;
	commandReleased2: string;
	commandPressed3: string;
	commandReleased3: string;
	commandPressed4: string;
	commandReleased4: string;
	rotationValue: number;
	commandRotateLeft: string;
	commandRotateRight: string;
	commandTouch: string;
};

function defaultSettings(): FXCommandSettings {
	return {
		currentState: 0,
		desiredStates: 1,
		commandPressed0: "",
		commandReleased0: "",
		commandPressed1: "",
		commandReleased1: "",
		commandPressed2: "",
		commandReleased2: "",
		commandPressed3: "",
		commandReleased3: "",
		commandPressed4: "",
		commandReleased4: "",
		commandTouch: "",
		rotationValue: 0,
		commandRotateLeft: "",
		commandRotateRight: ""
	};
}

/** Extract the command pair for a given state index from flat settings. */
function getCommandAction(settings: FXCommandSettings, stateIndex: number): CommandAction {
	const pressed = settings[`commandPressed${stateIndex}` as keyof FXCommandSettings] as string;
	const released = settings[`commandReleased${stateIndex}` as keyof FXCommandSettings] as string;
	return {
		commandPressed: pressed || "",
		commandReleased: released || ""
	};
}

@action({ UUID: "tf.josh.fxcommands" })
export class FXCommandAction extends SingletonAction<FXCommandSettings> {
	private connectionManager = new ConnectionManager();
	private states = new Map<string, number>();
	private rotations = new Map<string, number>();
	private rotationPersists = new Map<string, { timer: ReturnType<typeof setTimeout>; flush: () => void }>();

	/**
	 * Persist the rotation value once a burst of dial movement settles.
	 *
	 * A dial emits a stream of rotate events, and calling setSettings on each one
	 * both writes the profile to disk repeatedly and pushes didReceiveSettings to
	 * an open Property Inspector, which would reload its fields mid-edit.
	 */
	private schedulePersistRotation(action: DialAction<FXCommandSettings>, settings: FXCommandSettings): void {
		const existing = this.rotationPersists.get(action.id);
		if (existing) clearTimeout(existing.timer);

		const flush = (): void => {
			this.rotationPersists.delete(action.id);
			void action.setSettings({ ...settings, rotationValue: this.rotations.get(action.id) ?? 0 });
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
		}

		// Pre-connect so the first key press sends immediately
		await this.connectionManager.connect();
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
	private async sendCommand(command: string, vars: Record<string, string | number> = {}): Promise<boolean> {
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
		for (const token of tokens) {
			if (token.type === "delay") {
				await sleep(token.ms);
			} else if (token.value) {
				const sent = await this.connectionManager.send(token.value);
				if (!sent) success = false;
			}
		}
		return success;
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
			const ok = await this.sendCommand(cmd.commandPressed);
			if (!ok) await action.showAlert();
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
			const ok = await this.sendCommand(cmd.commandReleased);
			if (!ok) await action.showAlert();
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
		if (template) {
			logger.debug(`DialRotate [${ticks}]: ${template}`);
			const ok = await this.sendCommand(template, { ticks, rotationPercent, rotationAbsolute });
			if (!ok) await ev.action.showAlert();
		}

		this.schedulePersistRotation(ev.action, settings);
	}

	override async onTouchTap(ev: TouchTapEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };

		if (settings.commandTouch) {
			logger.debug(`TouchTap: ${settings.commandTouch}`);
			const ok = await this.sendCommand(settings.commandTouch);
			if (!ok) await ev.action.showAlert();
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		this.states.set(ev.action.id, settings.currentState ?? 0);
		this.rotations.set(ev.action.id, settings.rotationValue ?? 0);
	}

	override async onWillDisappear(ev: WillDisappearEvent<FXCommandSettings>): Promise<void> {
		// Flush any rotation still waiting on the debounce so it survives a page switch.
		const pending = this.rotationPersists.get(ev.action.id);
		if (pending) {
			clearTimeout(pending.timer);
			pending.flush();
		}

		this.states.delete(ev.action.id);
		this.rotations.delete(ev.action.id);
	}
}
