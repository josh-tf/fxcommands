import { action } from "@elgato/streamdeck";
import { FXCommandAction } from "./fx-command";

/**
 * Legacy action UUID alias for backwards compatibility.
 * v1.x used the plugin UUID as the action UUID. Existing users
 * have settings keyed to this UUID. This registration ensures
 * those buttons continue to work after the v2.x migration.
 */
@action({ UUID: "tf.josh.fxcommands" })
export class FXCommandLegacyAction extends FXCommandAction {}
