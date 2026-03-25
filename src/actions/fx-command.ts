import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	KeyUpEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent
} from "@elgato/streamdeck";

import { ConnectionManager } from "../connection-manager";

const logger = streamDeck.logger.createScope("FXCommandAction");
const MAX_STATES = 5;
const DELAY_MS = 500;

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
		commandReleased4: ""
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

	override async onWillAppear(ev: WillAppearEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		const currentState = settings.currentState ?? 0;
		this.states.set(ev.action.id, currentState);

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
	 *
	 * Examples:
	 *   "e sit;;me relaxes"              500ms delay between commands
	 *   "me sits;{500ms};me stands up"   500ms delay with explicit syntax
	 *   "e sit;{1500ms};me looks;{2000ms};e c"
	 */
	private async sendCommand(command: string): Promise<boolean> {
		// Split into tokens: commands and delay markers
		// ;; becomes a 500ms delay, {NNNms} becomes an NNN ms delay
		const tokens: Array<{ type: "cmd"; value: string } | { type: "delay"; ms: number }> = [];
		let remaining = command;

		while (remaining.length > 0) {
			const match = remaining.match(/;?;;|;?\{(\d+)ms\};?/i);
			if (!match) {
				tokens.push({ type: "cmd", value: remaining.trim() });
				break;
			}
			const before = remaining.slice(0, match.index).trim();
			if (before) tokens.push({ type: "cmd", value: before });
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

	override async onKeyDown(ev: KeyDownEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		const currentState = this.states.get(ev.action.id) ?? 0;
		const cmd = getCommandAction(settings, currentState);

		if (cmd.commandPressed) {
			logger.debug(`KeyDown [${currentState}]: ${cmd.commandPressed}`);
			const ok = await this.sendCommand(cmd.commandPressed);
			if (!ok) await ev.action.showAlert();
		}
	}

	override async onKeyUp(ev: KeyUpEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		const currentState = this.states.get(ev.action.id) ?? 0;
		const cmd = getCommandAction(settings, currentState);

		if (cmd.commandReleased) {
			logger.debug(`KeyUp [${currentState}]: ${cmd.commandReleased}`);
			const ok = await this.sendCommand(cmd.commandReleased);
			if (!ok) await ev.action.showAlert();
		}

		// Advance to next state
		const desiredStates = Math.min(Math.max(settings.desiredStates || 1, 1), MAX_STATES);
		const nextState = (currentState + 1) % desiredStates;
		this.states.set(ev.action.id, nextState);

		settings.currentState = nextState;
		await ev.action.setSettings(settings);
		await ev.action.setState(nextState);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		this.states.set(ev.action.id, settings.currentState ?? 0);
	}

	override async onWillDisappear(ev: WillDisappearEvent<FXCommandSettings>): Promise<void> {
		this.states.delete(ev.action.id);
	}
}
