import streamDeck from "@elgato/streamdeck";
import { FXCommandAction } from "./actions/fx-command";
import { FXCommandLegacyAction } from "./actions/fx-command-legacy";

streamDeck.actions.registerAction(new FXCommandAction());
streamDeck.actions.registerAction(new FXCommandLegacyAction());
streamDeck.connect();
