// The default (English) locale.

/**
 * The default English UI strings.
 *
 * They work almost exactly like SugarCube `l10nStrings` (and are indeed merged
 * into `l10nStrings`). See {@link https://www.motoslave.net/sugarcube/2/docs/#guide-localization}.
 * The most notable difference to SugarCube's `l10n` API being that we only
 * substitute {name} placeholders with variables explicitly provided by the
 * caller and never with other entries from `l10nStrings`.
 *
 * You can load a different locale or use custom English labels by assigning
 * the keys listed below to SugarCube's `l10nStrings`. Changes to the locale
 * should always be followed by re-initializing the library in order to update
 * static UI elements.
 *
 * @example
 * Object.assign(l10nStrings, {
 * 	hotkeySettingsHeaderReset: "Zur\u00fccksetzen",
 * 	// ...
 * });
 * Hotkey.initialize();
 */
export const DEFAULT_STRINGS = {
	// dialog and its menu item
	hotkeySettingsTitle: "Keyboard Settings",
	hotkeySettingsHeaderAction: "Action",
	hotkeySettingsHeaderShortcut: "Shortcut",
	hotkeySettingsHeaderHint: "Hint",
	// the visually hidden name for the column of the reset buttons
	hotkeySettingsHeaderReset: "Reset",
	hotkeySettingsButtonResetAll: "Reset All to Default",

	// built-in actions
	hotkeyActionNameBackward: "Go Back",
	hotkeyActionNameForward: "Go Forward",
	hotkeyActionNameContinue: "Continue (Single Link)",
	hotkeyActionNameContinueNumbered: "Continue (Link {number})",

	// row controls
	hotkeySettingsLabelAdd: "Add a shortcut for {action}",
	hotkeySettingsDescriptionAdd:
		"Screen reader users may need to switch to focus mode first.",
	hotkeySettingsButtonCapture: "Press a key\u2026 (Esc)",
	hotkeySettingsLabelRemove: "Remove {shortcut} from {action}",
	hotkeySettingsLabelHint: "Link hint for {action}",
	hotkeySettingsLabelReset: "Reset {action} to default",

	// status messages
	hotkeySettingsStatusCaptureStart:
		"Press a key for {action}, or Escape to cancel.",
	hotkeySettingsStatusCaptureCancel:
		"Cancelled adding a shortcut for {action}.",
	hotkeySettingsStatusCaptureUnidentified:
		"That key can't be used as a shortcut.",
	hotkeySettingsStatusCaptureProtected:
		"{shortcut} can't be used as a shortcut.",
	hotkeySettingsStatusAdded: "Added {shortcut} to {action}.",
	hotkeySettingsStatusMoved:
		"{shortcut} moved from {previousAction} to {action}.",
	hotkeySettingsStatusUnchanged: "{shortcut} already belongs to {action}.",
	hotkeySettingsStatusRemoved: "Removed {shortcut} from {action}.",
	hotkeySettingsStatusHintSet: "The hint for {action} is now {hint}.",
	hotkeySettingsStatusHintDefault:
		"{action} uses its default hint {hint} again.",
	hotkeySettingsStatusHintNone: "{action} has no hint anymore.",
	hotkeySettingsStatusHintInvalid: "The entered hint for {action} was invalid.",
	hotkeySettingsStatusReset:
		"{action} was reset to default, taking back its default shortcuts if needed.",
	hotkeySettingsStatusResetAll:
		"All shortcuts and hints were reset to default.",

	// "About Shortcuts", the {key...} placeholders become key chips
	hotkeyHelpTitle: "About Shortcuts",
	hotkeyHelpTextCapture:
		"To add a shortcut press the key combination you want. The keys' physical location on your keyboard will be recorded.",
	hotkeyHelpTextLayout:
		"Due to Browser limitations labels show where the key sits on a US QWERTY keyboard. On other layouts the key in that position may be labelled differently, e.g. {keyQ} is {keyA} on AZERTY.",
	hotkeyHelpTextHints:
		"The automatic default hints are also derived from the US QWERTY layout. Feel free to change the hint to match your actual keyboard layout.",
	hotkeyHelpTextNumpad:
		"Number pad keys ({keyNumpad1}) are separate from the number row. They work whether Num Lock is on or off.",
	hotkeyHelpTextModifiers:
		"{keyMeta} is the \u2318 Command key on a Mac and the Windows key on a PC. {keyAlt} is the \u2325 Option key on a Mac.",
} as const;
Object.freeze(DEFAULT_STRINGS);

export function installDefaultStrings(): void {
	Object.assign(l10nStrings, DEFAULT_STRINGS, { ...l10nStrings });
}
