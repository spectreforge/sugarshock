// The public API, exposed as the global `Hotkey` variable.

export {
	dispose,
	initialize,
	openSettings,
	type Options,
} from "./hotkey-plugin";
export { AUTO_HINT } from "./hotkey-settings";
export type {
	CustomAction,
	LinkClickAction,
	InvokeAction,
} from "./hotkey-settings";
