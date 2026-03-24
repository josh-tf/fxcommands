import streamDeck from "@elgato/streamdeck";
import { FXCommandAction } from "./actions/fx-command";

streamDeck.actions.registerAction(new FXCommandAction());
streamDeck.connect();
