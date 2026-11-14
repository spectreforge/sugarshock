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
import {
	isVersionLess,
	objectTransform,
	type Dictionary,
} from "./hotkey-utils";

const SETTING_ID = {
	BINDINGS: "hotkey-settings",
	HINT_STYLE: "hotkey-hint-style",
} as const;
Object.freeze(SETTING_ID);

/**
 * The hint style is applied via CSS (see `hotkey.css`) governed by this
 * attribute on the root element.
 */
const HINTS_ATTRIBUTE = "hotkeyHints";

/**
 * How shortcut hints are displayed:
 * - `hidden`: no visible hints
 * - `plain`: the bare hint, e.g. `1`
 * - `brackets`: the hint in brackets, e.g. `[1]`
 */
export type HintStyle = "hidden" | "plain" | "brackets";

/**
 * N.B. these are saved as-is by SC's Setting API and therefore need to stay
 * locale-independent and stable.
 */
const HINT_STYLE_LABELS = Object.freeze({
	hidden: "\u2205", // empty set symbol
	plain: "1",
	brackets: "[1]",
});
const HINT_LABELS = Object.freeze(Object.values(HINT_STYLE_LABELS));
const HINT_STYLE_BY_LABEL: Dictionary<string, HintStyle> = Object.freeze(
	objectTransform(HINT_STYLE_LABELS, null, (es) =>
		es.map(([style, label]) => [label, style]),
	),
);

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
	/**
	 * How shortcut hints are displayed by default. The player can pick a
	 * different style in SugarCube's Settings dialog.
	 *
	 * @defaultvalue "plain"
	 */
	hintStyleDefault?: HintStyle;
	/**
	 * If false no "Shortcut hints" setting will be added to SugarCube's Settings
	 * dialog and `hintStyleDefault` always applies.
	 *
	 * @defaultvalue true
	 */
	hintStyleSetting?: boolean;
}

export type Options = UiOptions & BehaviourOptions;

class HotkeyPlugin {
	readonly #hintStyleSetting: boolean;
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

		registerMacros(this.#settings);
		this.#linkTracker = new LinkTracker(this.#settings);

		this.#hintStyleSetting = options.hintStyleSetting ?? true;
		this.#initializeSugarCubeSettings(options);

		this.#linkTracker.refreshLinkAttributes();

		document.addEventListener("keydown", this.#handleKeydown);
		if (menuItem !== false) {
			syncMenuItem(localizer, this.openSettings);
		}
	}
	dispose(): void {
		removeMenuItem();
		closeSettingsDialog();
		document.removeEventListener("keydown", this.#handleKeydown);

		delete document.documentElement.dataset[HINTS_ATTRIBUTE];
		nonDestructiveSettingDelete(SETTING_ID.BINDINGS);
		if (this.#hintStyleSetting) {
			nonDestructiveSettingDelete(SETTING_ID.HINT_STYLE);
		}
		this.#linkTracker.dispose();
		deregisterMacros();
	}

	#initializeSugarCubeSettings({ hintStyleDefault }: UiOptions): void {
		hintStyleDefault ??= "plain";
		if (this.#hintStyleSetting) {
			const defaultLabel = HINT_STYLE_LABELS[hintStyleDefault];
			// unknown values fall back to the default
			const syncHintStyle = () =>
				this.#updateHintStyle(
					HINT_STYLE_BY_LABEL[Setting.getValue(SETTING_ID.HINT_STYLE)] ??
						hintStyleDefault,
				);
			Setting.addList(SETTING_ID.HINT_STYLE, {
				label: localizer.text("hotkeySugarCubeSettingsLabelHintStyle"),
				desc: localizer.text(
					"hotkeySugarCubeSettingsDescriptionHintStyle",
					HINT_STYLE_BY_LABEL,
				),
				list: [...HINT_LABELS],
				default: defaultLabel,
				onInit: syncHintStyle,
				onChange: syncHintStyle,
			});
			syncHintStyle();
		} else {
			this.#updateHintStyle(hintStyleDefault);
		}

		Setting.addValue(SETTING_ID.BINDINGS, {
			default: null,
			// Only relevant if `initialize()` ran before SC loaded the settings, i.e.
			// from the Story JavaScript.
			onInit: ({ value }) => this.updateUserSettings(value),
		});
		this.#settings.loadJSON(Setting.getValue(SETTING_ID.BINDINGS));
	}
	#updateHintStyle(style: HintStyle): void {
		document.documentElement.dataset[HINTS_ATTRIBUTE] = style;
	}

	readonly openSettings = (): void => {
		openSettingsDialog(localizer, this.#settings, {
			onChange: () =>
				Setting.setValue(SETTING_ID.BINDINGS, this.#settings.toJSON()),
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

function nonDestructiveSettingDelete(key: string): void {
	const value = (settings as Record<string, unknown>)[key];
	const hasValue = Object.hasOwn(settings, key);
	Setting.delete(key);
	if (hasValue) {
		(settings as Record<string, unknown>)[key] = value;
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
}

/**
 * Removes all hooks and registrations including the SugarCube `Setting`
 * registrations. Note that the user will lose their settings if
 * `Setting.save()` is called between `Hotkey.dispose()` and the next
 * `Hotkey.initialize()` (same as calling `Setting.save()` after settings have
 * been loaded but before calling `Hotkey.initialize()`)
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

	const takenSettingIds = Object.values(SETTING_ID).filter((id) =>
		Setting.has(id),
	);
	if (takenSettingIds.length > 0) {
		throw new Error(
			`Hotkey setting ids taken by another script: ${takenSettingIds.join(", ")}`,
		);
	}

	const takenMacroIds = Object.values(MACRO_ID).filter(
		(id) => Macro.has(id) || Macro.tags.has(id),
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
