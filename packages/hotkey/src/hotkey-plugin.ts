// Setup, persistence and key dispatch. Ties all modules together.

import { HotkeySettings, type BehaviourOptions } from "./hotkey-settings";
import { deriveShortcut } from "./hotkey-shortcut";
import {
	closeSettingsDialog,
	openSettingsDialog,
	removeMenuItem,
	syncMenuItem,
} from "./hotkey-settings-dialog";
import {
	focusOwnsKey,
	hasScrollRemaining,
	noHotkeyPassage,
} from "./hotkey-passthrough";
import * as localizer from "./hotkey-i18n";
import { installDefaultStrings } from "./hotkey-l10n";
import { LinkTracker } from "./hotkey-link-tracker";
import { deregisterMacros, MACRO_ID, registerMacros } from "./hotkey-macros";
import { isVersionLess } from "./hotkey-utils";

const SETTING_KEY = "hotkey-settings";

export interface UiOptions {
	/**
	 * If false no menu item for the settings dialog will be added to the UI bar.
	 * You can still open it from code via `Hotkey.openSettings()` if you want to
	 * provide your own button for it.
	 *
	 * @defaultvalue true
	 */
	menuItem?: boolean;
	/**
	 * If true pressing Escape closes the open dialog.
	 *
	 * Defaults to true up to and including SugarCube v2.37.3. Later versions
	 * close the dialog on Escape by themselves.
	 */
	closeDialogOnEscape?: boolean;
}

export type Options = UiOptions & BehaviourOptions;

class HotkeyPlugin {
	readonly #closeDialogOnEscape: boolean;
	readonly #settings: HotkeySettings;
	readonly #linkTracker: LinkTracker;

	constructor({ menuItem, closeDialogOnEscape, ...options }: Options) {
		checkEnvironment();
		installDefaultStrings();

		this.#closeDialogOnEscape =
			closeDialogOnEscape ??
			!isVersionLess({ major: 2, minor: 37, patch: 3 }, SugarCube.version);
		this.#settings = new HotkeySettings(localizer, options);
		this.#settings.loadJSON(Setting.getValue(SETTING_KEY));

		registerMacros(this.#settings);
		this.#linkTracker = new LinkTracker(this.#settings);

		document.addEventListener("keydown", this.#handleKeydown);
		if (menuItem !== false) {
			syncMenuItem(localizer, this.openSettings);
		}
	}
	dispose(): void {
		removeMenuItem();
		closeSettingsDialog();
		document.removeEventListener("keydown", this.#handleKeydown);
		this.#linkTracker.dispose();
		deregisterMacros();
	}

	readonly openSettings = (): void => {
		openSettingsDialog(localizer, this.#settings, {
			onChange: () => Setting.setValue(SETTING_KEY, this.#settings.toJSON()),
			onClose: () => this.#linkTracker.refreshLinkAttributes(),
		});
	};

	readonly #handleKeydown = (e: KeyboardEvent) => {
		if (e.defaultPrevented || e.isComposing || e.repeat) {
			return;
		}
		const shortcut = deriveShortcut(e);
		if (focusOwnsKey(e.target, shortcut)) {
			return;
		}
		if (Dialog.isOpen()) {
			if (this.#closeDialogOnEscape && shortcut === "Escape") {
				Dialog.close();
				e.preventDefault();
			}
			return;
		}
		if (noHotkeyPassage()) {
			return;
		}
		const actionId = this.#settings.actionIdForShortcut(shortcut);
		if (actionId == null) {
			return;
		}

		const action = this.#settings.actions[actionId];
		switch (action?.type) {
			case "link-click": {
				const link = this.#linkTracker.findLink(actionId);
				if (link != null && (shortcut !== "Space" || !hasScrollRemaining())) {
					e.preventDefault();
					link.click();
				}
				break;
			}
			case "backward":
			case "forward":
				if (Config.history.controls && Engine[action.type]()) {
					e.preventDefault();
				}
				break;

			case "invoke":
				action.handle(e);
				break;

			default:
				console.error(
					`Unknown action type for action "${actionId}" (triggered by shortcut "${shortcut}")`,
				);
				break;
		}
	};

	updateUserSettings(settings: unknown): void {
		this.#settings.loadJSON(settings);
	}
}

let plugin: HotkeyPlugin | undefined;

/**
 * Sets up the hotkeys. Calling it multiple times will always exclusively use
 * the option values provided by the last call.
 *
 * Translations of the UI strings (`l10nStrings.hotkey...`) have to be set
 * beforehand. Call `initialize()` with the same options again after changing
 * the locale.
 */
export function initialize(options: Options = {}): void {
	dispose();
	plugin = new HotkeyPlugin(options);

	if (!Setting.has(SETTING_KEY)) {
		Setting.addValue(SETTING_KEY, {
			default: null,
			// Only relevant if `initialize()` ran before SC loaded the settings, i.e.
			// from the Story JavaScript. Otherwise the `HotkeyPlugin` ctor loads the
			// stored user settings.
			onInit: ({ value }) => plugin?.updateUserSettings(value),
		});
	}
}
/**
 * Removes all hooks and registrations except for the SugarCube `Setting`
 * registration which can't be undone.
 */
export function dispose(): void {
	plugin?.dispose();
	plugin = undefined;
}

/**
 * Opens the settings dialog, e.g. for stories without SugarCube's default UI
 * bar. Use like this:
 *
 * `<<link "Keyboard">><<run Hotkey.openSettings()>><</link>>`
 */
export function openSettings(): void {
	if (plugin == null) {
		throw new Error("Hotkey.initialize() has to be called first");
	}
	plugin.openSettings();
}

function checkEnvironment() {
	if (isVersionLess(SugarCube.version, { major: 2, minor: 37, patch: 0 })) {
		throw new Error(
			"This plugin requires at least SugarCube v2.37.0 due to changes to the :passagerender event",
		);
	}

	const takenMacroIds = Object.values(MACRO_ID).filter(
		(name) => Macro.has(name) || Macro.tags.has(name),
	);
	if (takenMacroIds.length > 0) {
		const takenMacros = takenMacroIds.map((name) => `<<${name}>>`).join(", ");
		throw new Error("Hotkey macros taken by another script: " + takenMacros);
	}

	// For <<hotlink-to>>; they're missing from the docs, but are partially
	// declared in @types/twine-sugarcube and have been stable over a long time.
	const missingApis = (
		["createInternalLink", "createExternalLink"] as const
	).filter((name) => typeof Wikifier[name] !== "function");
	if (missingApis.length > 0) {
		throw new Error(
			`Hotkey: unsupported SugarCube version, missing ${missingApis.map((name) => `Wikifier.${name}()`).join(", ")}`,
		);
	}
}
