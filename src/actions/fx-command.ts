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

@action({ UUID: "tf.josh.fxcommands.run-command" })
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

	override async onKeyDown(ev: KeyDownEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		const currentState = this.states.get(ev.action.id) ?? 0;
		const cmd = getCommandAction(settings, currentState);

		if (cmd.commandPressed) {
			logger.debug(`KeyDown [${currentState}]: ${cmd.commandPressed}`);
			await this.connectionManager.send(cmd.commandPressed);
		}
	}

	override async onKeyUp(ev: KeyUpEvent<FXCommandSettings>): Promise<void> {
		const settings = { ...defaultSettings(), ...ev.payload.settings };
		const currentState = this.states.get(ev.action.id) ?? 0;
		const cmd = getCommandAction(settings, currentState);

		if (cmd.commandReleased) {
			logger.debug(`KeyUp [${currentState}]: ${cmd.commandReleased}`);
			await this.connectionManager.send(cmd.commandReleased);
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
