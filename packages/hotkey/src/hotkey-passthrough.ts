// Bypass logic (<== the cases where we shouldn't answer keydown events or annotate things)

/**
 * On these passages no shortcuts should trigger and all hints should be removed.
 */
export function noHotkeyPassage(): boolean {
	return tags().includes("nohotkey");
}

/**
 * On these passages no implicit actions should be assigned to links in the passage.
 */
export function noImplicitHotkeyPassage(): boolean {
	return tags().includes("nohotkey-implicit");
}

export function hasScrollRemaining(): boolean {
	const el = document.scrollingElement;
	return el != null && el.scrollTop + el.clientHeight < el.scrollHeight - 1; // -1 for rounding
}

// Keys which focused elements handle themselves => shortcut handling must not
// `.preventDefault()` them.
// The keys per role have been derived from the "Keyboard Interaction" sections
// of the WAI-ARIA Authoring Practices patterns,
// and "Keyboard Navigation Inside Components".
// References:
// - https://www.w3.org/WAI/ARIA/apg/patterns/
// - https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#keyboardnavigationinsidecomponents

/**
 * Checks whether we should leave handling of the event to the focused element /
 * event target, otherwise it would be impossible to e.g. type in `input` fields
 * or manipulate radio groups with the keyboard _without_ triggering shortcuts.
 */
export function focusOwnsKey(
	target: EventTarget | null,
	shortcut: string,
): boolean {
	return (
		target instanceof Element &&
		(target.matches(RICH_INTERACTION_SELECTOR) ||
			(ACTIVATION_KEY.test(shortcut) && target.matches(ACTIVATABLE_SELECTOR)) ||
			(NAVIGATION_KEY.test(shortcut) &&
				target.closest(NAVIGABLE_SELECTOR) !== null))
	);
}

/**
 * Interactable elements taking almost any key.
 * - `:read-write` covers the editable text-like inputs, textareas, ...
 * - type-ahead in a select picks an option
 * - media controls take Space, Arrows, Home/End, and possibly others
 */
const RICH_INTERACTION_SELECTOR =
	":read-write, select, [role=textbox], [role=searchbox], audio[controls], video[controls]";

/**
 * Regex for those shortcuts which activate a focused element in a SC story.
 */
export const ACTIVATION_KEY: RegExp = /^(?:Space|(?:Numpad)?Enter)$/;
/**
 * Elements which can be activated by {@link ACTIVATION_KEY}.
 */
const ACTIVATABLE_SELECTOR = `a, button, summary, input, ${roles(
	// prettier-ignore
	[
		"button", "link",
		"checkbox", "switch",
		"radio",
		"tab",
		"combobox", "listbox", "option",
		"menuitem", "menuitemcheckbox", "menuitemradio",
		"treeitem",
		"gridcell",
	],
)}`;

/**
 * Regex for those shortcuts which navigate within a widget, e.g. between radio buttons.
 */
const NAVIGATION_KEY =
	/^(?:Arrow(?:Left|Right|Up|Down)|Home|End|Page(?:Up|Down))$/;
/**
 * Elements which (probably) want to handle {@link NAVIGATION_KEY} events
 * themselves.
 *
 * Should be matched with `closest()` because the focus may be on an element
 * inside, e.g. an option of a listbox. `:read-write` doesn't match range
 * inputs, so they're here (and digits still reach the shortcuts).
 */
const NAVIGABLE_SELECTOR = `input[type=radio], input[type=range], ${roles(
	// prettier-ignore
	[
		"radio", "radiogroup",
		"tab", "tablist",
		"slider", "spinbutton",
		"combobox", "listbox",
		"menu", "menubar",
		"tree", "treegrid", "grid",
		"toolbar",
		"separator", // focusable = window splitter
	],
)}`;

/**
 * small helper to compress `[role=x]` selectors and make the selector more readable.
 */
function roles(names: readonly string[]): string {
	return names.map((name) => `[role=${name}]`).join();
}
