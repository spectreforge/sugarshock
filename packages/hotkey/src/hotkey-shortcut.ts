// Definitions and function relating to the shortcut format.
//
// The general shortcut format is `Meta+Ctrl+Alt+Shift+KeyR`; only those four
// modifiers are supported in bindings, others are graciously ignored. Each
// part of the shortcut joined by `+` is called a `key` while the complete
// string is just referred to as `shortcut`.

import { type Dictionary, noproto } from "./hotkey-utils";

/**
 * These key events need to be ignored during capture. Capture happens on the
 * first non-modifier keydown event.
 *
 * @see https://www.w3.org/TR/uievents-key/#keys-modifier
 */
// prettier-ignore
export const MODIFIER_KEYS: readonly string[] = Object.freeze([
	"Alt", "AltGraph", "CapsLock", "Control", "Fn", "FnLock", "Meta",
	"NumLock", "ScrollLock", "Shift",  "Symbol", "SymbolLock",
	// legacy
	"Hyper", "Super",
]);

/**
 * WAI-ARIA: "Authors SHOULD avoid implementing shortcut keys that inhibit
 * operating system, user agent, or assistive technology functionality."
 * ({@link https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts})
 *
 * The following is a non exhaustive list of shortcuts which are commonly used
 * (with `Meta` variants for macOS) and should therefore be prevented from being
 * bound. Curated subset of characters in
 * {@link https://searchfox.org/firefox-main/source/browser/base/content/browser-sets.inc.xhtml|`browser-sets.inc.xhtml`}
 * with the addition of
 * - `(Numpad)?Enter`: focused element interaction
 * - `Shift+F5`: reload ignoring cache (Chromium)
 */
// prettier-ignore
export const PROTECTED_SHORTCUTS: readonly string[] = Object.freeze([
	// focus navigation
	"Tab", "Shift+Tab",
	// these would work inconsistently due to focused element interactions
	"Enter", "NumpadEnter",
	// browser backward / forward
	"Alt+ArrowLeft", "Alt+ArrowRight",
	// reload
	"F5", "Shift+F5", "Ctrl+F5",
	"Ctrl+KeyR", "Ctrl+Shift+KeyR", "Meta+KeyR", "Meta+Shift+KeyR",
	// zoom
	"Ctrl+Minus", "Ctrl+Shift+Minus", "Ctrl+Equal", "Ctrl+Shift+Equal", "Ctrl+Digit0",
	"Ctrl+NumpadSubtract", "Ctrl+NumpadAdd", "Ctrl+Numpad0",
	"Meta+Minus", "Meta+Shift+Minus", "Meta+Equal", "Meta+Shift+Equal", "Meta+Digit0",
	// find
	"F3", "Shift+F3",
	"Ctrl+KeyF", "Ctrl+KeyG", "Ctrl+Shift+KeyG", "Meta+KeyF", "Meta+KeyG", "Meta+Shift+KeyG",
	// print
	"Ctrl+KeyP", "Meta+KeyP",
	// fullscreen, developer tools
	"F11", "F12",
]);

/**
 * The `KeyboardEvent.code` values which will likely be bound. Contains entries
 * from the main block, navigation keys, the number pad, and F-keys.
 *
 * Shortcuts not covered by this regex _might_ still work, but are probably
 * typos in the authors plugin configuration.
 *
 * @see https://www.w3.org/TR/uievents-code/
 */
const KEY_CODES = String.raw`
	Key[A-Z] Digit\d Backquote Backslash BracketLeft BracketRight Comma Equal
	Intl(?:Backslash|Ro|Yen) Minus Period Quote Semicolon Slash
	Space Enter Backspace Delete Insert Escape
	Home End PageUp PageDown Arrow(?:Up|Down|Left|Right)
	Numpad(?:\d|Add|Subtract|Multiply|Divide|Decimal|Enter) F[1-9]\d?
`
	.trim()
	.split(/\s+/)
	.join("|");
export const VALID_SHORTCUT: RegExp = new RegExp(
	`^(?:Meta\\+)?(?:Ctrl\\+)?(?:Alt\\+)?(?:Shift\\+)?(?:${KEY_CODES})$`,
);

const NUMPAD_SHORTCUT = /(?:^|\+)Numpad\w+$/;

/**
 * Punctuation display strings taken from the
 * {@link https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts|aria spec}.
 *
 * N.B. this doesn't include any punctuation reached via `Shift` on a QWERTY
 * layout as these shortcuts are encoded as e.g. `Shift+;` -> `:`
 */
const PUNCTUATION_NAMES: Dictionary<string, string> = Object.freeze({
	Backquote: "`",
	Backslash: "\\",
	BracketLeft: "[",
	BracketRight: "]",
	Comma: ",",
	Equal: "=",
	Minus: "-",
	Period: ".",
	Quote: "'",
	Semicolon: ";",
	Slash: "/",
});

/**
 * Lookup dictionary for converting shortcut keys to aria keyshortcut format.
 *
 * @see {@link PUNCTUATION_NAMES}
 */
const ARIA_KEY_NAMES: Dictionary<string, string> = Object.freeze({
	__proto__: noproto,
	...PUNCTUATION_NAMES,
	Ctrl: "Control",
});

/**
 * Fancy pants for display in the "Keyboard Settings" UI.
 */
const DISPLAY_KEY_NAMES: Dictionary<string, string> = Object.freeze({
	__proto__: noproto,
	...PUNCTUATION_NAMES,
	ArrowUp: "\u2191", // upwards arrow
	ArrowDown: "\u2193", // downwards arrow
	ArrowLeft: "\u2190", // leftwards arrow
	ArrowRight: "\u2192", // rightwards arrow
	Space: "\u2423", // open box
});

/**
 * Encodes a keyboard event into the shortcut format of this library.
 *
 * We deliberately use {@link KeyboardEvent.code} instead of {@link KeyboardEvent.key}
 * to keep shortcuts layout independent.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
 */
export function deriveShortcut(e: KeyboardEvent): string {
	return (
		(e.metaKey ? "Meta+" : "") +
		(e.ctrlKey ? "Ctrl+" : "") +
		(e.altKey ? "Alt+" : "") +
		(e.shiftKey ? "Shift+" : "") +
		e.code
	);
}

/**
 * Converts the shortcut format to `aria-keyshortcuts` on a best effort basis as
 * the latter is based on `KeyboardEvent.key`. As with the hints this is only
 * accurate on a US QWERTY layout.
 *
 * @param shortcut The key combination as per {@link deriveShortcut}
 * @returns `null` for number pad keys: their key value depends on Num Lock and
 *          coincides with other keys (e.g. `Numpad1` and `Digit1` are both
 *          "1").
 */
export function formatAriaKeyshortcut(shortcut: string): string | null {
	return NUMPAD_SHORTCUT.test(shortcut)
		? null
		: shortcut.split("+").map(formatAriaKey).join("+");
}

const formatAriaKey = (key: string) => rawFormat(ARIA_KEY_NAMES, key);

/**
 * Pretty prints the shortcut for display purposes.
 *
 * @param shortcut The key combination as per {@link deriveShortcut}
 */
export function formatShortcut(shortcut: string): string {
	return shortcut.split("+").map(formatKey).join("+");
}

/**
 * Pretty prints the key for display purposes.
 */
export const formatKey = (key: string): string =>
	rawFormat(DISPLAY_KEY_NAMES, key);

function rawFormat(mapping: Dictionary<string, string>, key: string) {
	if (key.startsWith("Key")) {
		return key.slice(3);
	}
	if (key.startsWith("Digit")) {
		return key.slice(5);
	}
	return mapping[key] ?? key;
}
