// Core module for keeping track of actions, their shortcuts, and their hints.

import type { StringLocalizer } from "./hotkey-i18n";
import {
	PROTECTED_SHORTCUTS,
	formatKey,
	VALID_SHORTCUT,
} from "./hotkey-shortcut";
import {
	CSS_WHITESPACE,
	entryIsNonNullish,
	isNonNullObject,
	isNonWhitespaceString,
	noproto,
	objectDeepFreeze,
	objectTransform,
	type Dictionary,
} from "./hotkey-utils";

type NameType =
	string | readonly [key: string, vars?: Dictionary<string, string>];

/**
 * Allows binding a shortcut to click on a link in the page.
 */
export type LinkClickAction = {
	type: "link-click";
	/**
	 * Display name for the action. Can either be a string or an array containing
	 * an `l10nStrings` key and an optional substitution dictionary.
	 *
	 * @see {@link StringLocalizer}
	 */
	name: NameType;
};

/**
 * Allows binding a shortcut to an author provided function.
 */
export type InvokeAction = {
	type: "invoke";
	/**
	 * Display name for the action. Can either be a string or an array containing
	 * an `l10nStrings` key and an optional substitution dictionary.
	 *
	 * @see {@link StringLocalizer}
	 */
	name: NameType;
	/**
	 * A function to be called when one of the action's shortcuts is activated.
	 * The handler may call `event.preventDefault()` if the key's default behaviour
	 * should be suppressed.
	 *
	 * @param event The `keydown` event of the shortcut
	 */
	handle: (event: KeyboardEvent) => void;
};

export type BackwardAction = {
	type: "backward";
	name: string;
};

export type ForwardAction = {
	type: "forward";
	name: string;
};

/**
 * Action types which can be supplied by the author.
 */
export type CustomAction = LinkClickAction | InvokeAction;

type ResolvedCustomAction = CustomAction & { name: string };
export type Action = BackwardAction | ForwardAction | ResolvedCustomAction;
type BuiltinAction = Exclude<Action, InvokeAction>;
type BuiltinActionEntry = [string, BuiltinAction];

/**
 * shortcut -> actionId; `null` removes a default binding
 */
export type Keymap = Record<string, string | null>;
/**
 * actionId -> hint; `null` removes a default hint, {@link AUTO_HINT} derives
 * the hint from the action's shortcuts.
 */
export type Hints = Record<string, string | null | typeof AUTO_HINT>;
type DefaultHint = string | typeof AUTO_HINT;

export interface BehaviourOptions {
	/**
	 * You can override the builtin actions except for the implicit actions
	 * (`continue`, `continue0`, ...) if they haven't been disabled, see
	 * {@link Options.implicitActions}.
	 *
	 * Note that users will lose their bindings and hint for an action if its id
	 * changes (or it gets removed) between releases.
	 *
	 * @see {@link CustomAction}
	 */
	actions?: Dictionary<string, CustomAction>;
	/**
	 * Default set of bindings.
	 *
	 * Note that for actions with {@link AUTO_HINT} enabled, the definition
	 * order decides which shortcut is used for deriving the automatic hint. The
	 * first one wins.
	 */
	keymap?: Keymap;
	/**
	 * Default set of hints, only link-click actions can have one.
	 */
	hints?: Hints;
	/**
	 * If false no passage links will be annotated with implicit actions and the
	 * implicit actions won't be registered (i.e. they won't show up in the
	 * keyboard settings UI).
	 *
	 * Note that as with custom actions users will lose their bindings if this
	 * gets toggled between releases.
	 *
	 * @defaultvalue true
	 */
	implicitActions?: boolean;
}

////////////////////////////////////////////////////////////////////////
// Constants

export const MAX_HINT_LENGTH = 4; // arbitrarily chosen, might want to revisit

/**
 * Hint value showing the action's first shortcut without modifiers, e.g. "1"
 * for `Digit1`. Unlike a fixed hint it follows the user's rebindings, but isn't
 * keyboard layout aware.
 */
export const AUTO_HINT = true;

type BuiltinActionDef = {
	readonly id: string;
	readonly type: BuiltinAction["type"];
	readonly name: Readonly<Parameters<StringLocalizer["text"]>>;
	readonly shortcuts: readonly string[];
	readonly hint?: typeof AUTO_HINT;
};

// prettier-ignore
const CORE_ACTIONS: readonly BuiltinActionDef[] = objectDeepFreeze([
	{ id: "backward", type: "backward", name: ["hotkeyActionNameBackward"], shortcuts: ["ArrowLeft"]  },
	{ id: "forward",  type: "forward",  name: ["hotkeyActionNameForward"],  shortcuts: ["ArrowRight"] },
]);

const IMPLICIT_SINGLE_ACTION: BuiltinActionDef = objectDeepFreeze({
	id: "continue",
	type: "link-click",
	name: ["hotkeyActionNameContinue"],
	shortcuts: ["Space"],
	// no hint to let single links stay unannotated
});
const IMPLICIT_NUMBERED_ACTIONS: readonly BuiltinActionDef[] = objectDeepFreeze(
	[
		["Digit1", "Numpad1"],
		["Digit2", "Numpad2"],
		["Digit3", "Numpad3"],
		["Digit4", "Numpad4"],
		["Digit5", "Numpad5"],
		["KeyQ", "Digit6", "Numpad6"],
		["KeyW", "Digit7", "Numpad7"],
		["KeyE", "Digit8", "Numpad8"],
		["KeyR", "Digit9", "Numpad9"],
		["KeyT", "Digit0", "Numpad0"],
	].map((shortcuts, i): BuiltinActionDef => ({
		id: `continue${i}`,
		type: "link-click",
		name: ["hotkeyActionNameContinueNumbered", { number: String(i + 1) }],
		shortcuts,
		hint: AUTO_HINT,
	})),
);
const IMPLICIT_ACTIONS: readonly BuiltinActionDef[] = Object.freeze([
	IMPLICIT_SINGLE_ACTION,
	...IMPLICIT_NUMBERED_ACTIONS,
]);
export type ImplicitActionIds = {
	readonly single: string;
	readonly numbered: readonly string[];

	includes(id: string): boolean;
};
const IMPLICIT_ACTION_IDS: ImplicitActionIds = objectDeepFreeze({
	single: IMPLICIT_SINGLE_ACTION.id,
	numbered: IMPLICIT_NUMBERED_ACTIONS.map(({ id }) => id),

	includes(id) {
		return this.single === id || this.numbered.includes(id);
	},
});

////////////////////////////////////////////////////////////////////////

/**
 * Core class for maintaining user settings.
 */
export class HotkeySettings {
	/**
	 * The ids of the actions that should be assigned to passage links without an
	 * explicit action attribute.
	 *
	 * `null` if {@link Options.implicitActions} is off.
	 */
	readonly implicitIds: ImplicitActionIds | null;

	readonly #actions: Dictionary<string, Readonly<Action>>;
	readonly #defaultHints: Dictionary<string, DefaultHint>;
	readonly #defaultKeymap: Dictionary<string, string>;

	#hints: Record<string, string> = { __proto__: noproto };
	#keymap: Keymap = { __proto__: noproto };

	constructor(localizer: StringLocalizer, options: BehaviourOptions) {
		const implicitActions = options.implicitActions ?? true;
		this.implicitIds = implicitActions ? IMPLICIT_ACTION_IDS : null;
		const builtins = implicitActions
			? [...CORE_ACTIONS, ...IMPLICIT_ACTIONS]
			: CORE_ACTIONS;

		this.#actions = assembleActions(
			localizer,
			builtins,
			this.implicitIds,
			options.actions,
		);
		this.#defaultHints = assembleHints(builtins, this.#actions, options.hints);
		this.#defaultKeymap = assembleKeymap(
			builtins,
			this.#actions,
			options.keymap,
		);
	}

	get actions(): Dictionary<string, Readonly<Action>> {
		return this.#actions;
	}

	/**
	 * Checks whether an explicit link may use `actionId`.
	 *
	 * @returns `null` on success or a string describing the validation issue
	 */
	validateLinkActionId(actionId: string): string | null {
		const error = validateExplicitActionId(actionId, this.implicitIds);
		if (error != null) {
			return error;
		}
		const action = this.#actions[actionId];
		if (action === undefined) {
			return `no action "${actionId}" is registered`;
		}
		if (action.type !== "link-click") {
			return `the action "${actionId}" can't be used on links (type "${action.type}")`;
		}
		return null;
	}

	resetToDefaults(): void {
		this.#hints = { __proto__: noproto };
		this.#keymap = { __proto__: noproto };
	}
	loadJSON(v: unknown): void {
		if (!isSerializedHotkeySettings(v)) {
			// fallthrough to default
		} else if (v.version === 0) {
			if (isValidV0Shape(v)) {
				this.#keymap = objectTransform(v.keymap, noproto, (entries) =>
					entries.filter((e) => this.#isValidBinding(...e)),
				);
				this.#hints = objectTransform(v.hints, noproto, (entries) =>
					entries.filter(([actionId, hint]) => {
						const problem = validateHint(this.#actions, actionId, hint);
						if (problem !== null) {
							console.warn(
								`Dropping the stored hint for "${actionId}": ${problem}`,
								hint,
							);
							return false;
						}
						return true;
					}),
				);
				return;
			}

			function isValidV0Shape(
				maybeV0: SerializedHotkeySettings,
			): maybeV0 is SerializedHotkeySettingsV0 {
				return (
					"keymap" in maybeV0 &&
					isNonNullObject(maybeV0.keymap) &&
					"hints" in maybeV0 &&
					isNonNullObject(maybeV0.hints)
				);
			}
		}
		// fallback for no (v === null) or malformed settings / unknown version
		this.resetToDefaults();
	}
	#isValidBinding(shortcut: unknown, actionId: unknown): boolean {
		return (
			typeof shortcut === "string" &&
			((actionId === null && shortcut in this.#defaultKeymap) ||
				(typeof actionId === "string" &&
					actionId in this.#actions &&
					!PROTECTED_SHORTCUTS.includes(shortcut)))
		);
	}
	toJSON(): SerializedHotkeySettingsV0 | null {
		if (
			Object.keys(this.#hints).length === 0 &&
			Object.keys(this.#keymap).length === 0
		) {
			// default settings are serialized as null
			// This is important as SC uses strict equality to determine whether the
			// settings API should write something to localStorage or not.
			return null;
		}
		return {
			version: 0,
			hints: { ...this.#hints },
			keymap: { ...this.#keymap },
		};
	}

	actionIdForShortcut(shortcut: string): string | null {
		const userActionId = this.#keymap[shortcut];
		// a user binding of `null` overrides the default one => can't use `??`
		return userActionId !== undefined
			? userActionId
			: (this.#defaultKeymap[shortcut] ?? null);
	}
	shortcutsForActionId(actionId: string): string[] {
		return this.#shortcutsForAction(actionId, {
			...this.#defaultKeymap,
			...this.#keymap,
		});
	}
	#shortcutsForAction(actionId: string, keymap: Keymap): string[] {
		return Object.entries(keymap)
			.filter(entryIsNonNullish)
			.filter(([, boundActionId]) => boundActionId === actionId)
			.map(([shortcut]) => shortcut);
	}
	/**
	 * @param actionId new actionId to associate or `null` to remove the binding
	 * @returns the previously bound actionId
	 */
	setBinding(shortcut: string, actionId: string | null): string | null {
		const previousActionId = this.actionIdForShortcut(shortcut);
		if (actionId === null) {
			if (shortcut in this.#defaultKeymap) {
				this.#keymap[shortcut] = null;
			} else {
				delete this.#keymap[shortcut];
			}
		} else if (PROTECTED_SHORTCUTS.includes(shortcut)) {
			// TODO: throw and log on caller side, this class should be side-effect free
			console.error(
				`The shortcut "${shortcut}" is protected and can't be bound`,
			);
		} else if (!(actionId in this.#actions)) {
			// TODO: throw and log on caller side, this class should be side-effect free
			console.error(`There's no action "${actionId}" to bind`, shortcut);
		} else {
			this.#keymap[shortcut] = actionId;
		}
		return previousActionId;
	}
	resetBindings(actionId: string): void {
		const defaultShortcuts = this.#shortcutsForAction(
			actionId,
			this.#defaultKeymap,
		);
		this.#keymap = objectTransform(this.#keymap, noproto, (entries) =>
			entries.filter(
				([shortcut, boundActionId]) =>
					!defaultShortcuts.includes(shortcut) && boundActionId !== actionId,
			),
		);
	}

	/**
	 * @returns the effective hint to be displayed
	 */
	hintForActionId(actionId: string): string | null {
		return this.#hints[actionId] ?? this.defaultHintForActionId(actionId);
	}
	/**
	 * @returns the hint value for the case where no user-provided hint was present (resolves {@link AUTO_HINT}).
	 */
	defaultHintForActionId(actionId: string): string | null {
		const hint = this.#defaultHints[actionId];
		return hint === AUTO_HINT ? this.#autoHint(actionId) : (hint ?? null);
	}
	/**
	 * @returns user-provided hint or `null` if the default applies
	 */
	userHintForActionId(actionId: string): string | null {
		return this.#hints[actionId] ?? null;
	}
	#autoHint(actionId: string): string | null {
		for (const shortcut of this.shortcutsForActionId(actionId)) {
			// a hint can't show modifiers
			if (!shortcut.includes("+")) {
				const hint = formatKey(shortcut);
				if (hint.length <= MAX_HINT_LENGTH) {
					return hint;
				}
			}
		}
		return null;
	}
	/**
	 * @param hint an empty hint restores the default one (value gets trimmed)
	 * @returns the new effective hint value (possibly trimmed or null if default)
	 */
	setHint(actionId: string, hint: string): string | null {
		const trimmed = hint.trim();
		if (trimmed === "") {
			this.resetHint(actionId);
			return null;
		}
		const error = validateHint(this.#actions, actionId, trimmed);
		if (error != null) {
			throw new Error(`Rejected the hint for "${actionId}": ${error}`, {
				cause: error,
			});
		}
		this.#hints[actionId] = trimmed;
		return trimmed;
	}
	resetHint(actionId: string): void {
		delete this.#hints[actionId];
	}
}

export type SerializedHotkeySettings = { version: number };
export function isSerializedHotkeySettings(
	value: unknown,
): value is SerializedHotkeySettings {
	return (
		isNonNullObject(value) &&
		"version" in value &&
		typeof value.version === "number"
	);
}
export type SerializedHotkeySettingsV0 = {
	version: 0;
	hints: Dictionary<string, string>;
	keymap: Readonly<Keymap>;
};

////////////////////////////////////////////////////////////////////////

function assembleActions(
	localizer: StringLocalizer,
	builtins: readonly BuiltinActionDef[],
	implicitActionIds: ImplicitActionIds | null,
	customActions: Dictionary<string, CustomAction> | undefined,
): Dictionary<string, Readonly<Action>> {
	return objectDeepFreeze(
		objectTransform(customActions ?? {}, noproto, (entries) => {
			const validatedEntries: [string, Action][] = entries
				.filter(([actionId, action]) => {
					const idError = validateExplicitActionId(actionId, implicitActionIds);
					if (idError !== null) {
						console.error(
							`Invalid custom action id: ${idError}; dropping action`,
						);
						return false;
					}
					if (!isNonNullObject(action)) {
						console.error(
							`Action "${actionId}" is not a non-null object; dropping action`,
							action,
						);
						return false;
					}
					if (!["invoke", "link-click"].includes(action.type)) {
						console.error(
							`Action "${actionId}" has unknown action type "${action.type}"; dropping action`,
						);
						return false;
					}
					if (typeof action.name !== "string" && !Array.isArray(action.name)) {
						console.error(
							`Action "${actionId}" has no name string; dropping action`,
							action.name,
						);
						return false;
					}
					if (action.type === "invoke" && typeof action.handle !== "function") {
						console.error(
							`Action "${actionId}" has no handle function; dropping action`,
							action.handle,
						);
						return false;
					}
					return true;
				})
				.map(([id, action]) => [id, cloneCustomAction(localizer, action)]);

			const allEntries: [string, Action][] = [
				// builtin actions come first to allow overrides...
				...builtins.map((def) => deriveBuiltinAction(localizer, def)),
				...validatedEntries,
			];
			return allEntries;
		}),
	);
}
function deriveBuiltinAction(
	localizer: StringLocalizer,
	{ id, type, name }: BuiltinActionDef,
): BuiltinActionEntry {
	return [id, { type, name: localizer.text(...name) }];
}
/**
 * Action ids must not contain CSS whitespace due to usage with the `~=`
 * attribute selector. Furthermore explicit action ids must not collide with
 * internal action ids.
 */
function validateExplicitActionId(
	actionId: string,
	implicitIds: ImplicitActionIds | null,
): string | null {
	if (CSS_WHITESPACE.test(actionId)) {
		return `the action id "${actionId}" contains CSS whitespace characters (0x20, 0x09, 0x0A, 0x0D, 0x0C)`;
	}
	if (implicitIds?.includes(actionId)) {
		return `the action id "${actionId}" is reserved for implicit actions (see the implicitActions option)`;
	}
	return null;
}
/**
 * Custom clone function which drops all unexpected properties and resolves
 * localization keys.
 */
function cloneCustomAction(
	localizer: StringLocalizer,
	{ name, ...action }: CustomAction,
): Action {
	name = Array.isArray(name)
		? localizer.text(...(name as Parameters<StringLocalizer["text"]>))
		: (name as string);
	switch (action.type) {
		case "invoke":
			return { type: action.type, name, handle: action.handle };
		case "link-click":
			return { type: action.type, name };
		default:
			throw new Error(`Unknown action type ${(action as CustomAction).type}`);
	}
}

function assembleHints(
	builtins: readonly BuiltinActionDef[],
	actions: Dictionary<string, Action>,
	customHints: Readonly<Hints> | undefined,
): Dictionary<string, DefaultHint> {
	const builtinHints = Object.fromEntries(
		builtins.flatMap(({ id, hint }) => (hint ? [[id, hint] as const] : [])),
	);
	return Object.freeze(
		objectTransform({ ...builtinHints, ...customHints }, noproto, (es) =>
			es.filter((e): e is [string, DefaultHint] => {
				const [actionId, hint] = e;
				if (hint === null) {
					// author removes a default hint
					return false;
				}
				const problem = validateHint(actions, actionId, hint, "default");
				if (problem !== null) {
					console.error(
						`Dropping the hint for "${actionId}": ${problem}`,
						hint,
					);
				}
				return problem === null;
			}),
		),
	);
}
/**
 * @param source Only default hints may be {@link AUTO_HINT}
 */
function validateHint(
	actions: Dictionary<string, Readonly<Action>>,
	actionId: string,
	hint: unknown,
	source: "default" | "user" = "user",
): string | null {
	const action = actions[actionId];
	if (action === undefined) {
		return `there's no action "${actionId}"`;
	}
	if (action.type !== "link-click") {
		return `"${actionId}" isn't a link-click action`;
	}
	if (source === "default" && hint === AUTO_HINT) {
		return null;
	}
	if (!isNonWhitespaceString(hint)) {
		return "a hint must be a non-empty non-whitespace string";
	}
	if (hint.length > MAX_HINT_LENGTH) {
		return `a hint can have at most ${MAX_HINT_LENGTH} characters`;
	}
	return null;
}

function assembleKeymap(
	builtins: readonly BuiltinActionDef[],
	actions: Dictionary<string, Action>,
	customKeymap: Readonly<Keymap> | undefined,
): Dictionary<string, string> {
	const builtinKeymap = Object.fromEntries(
		builtins.flatMap(({ id, shortcuts }) =>
			shortcuts.map((shortcut) => [shortcut, id]),
		),
	);
	return Object.freeze(
		objectTransform({ ...builtinKeymap, ...customKeymap }, noproto, (es) =>
			es.filter(entryIsNonNullish).filter(([shortcut, actionId]) => {
				if (!(actionId in actions)) {
					console.error(
						`Tried to add the shortcut "${shortcut}" for the non-existant action "${actionId}"`,
					);
					return false;
				}
				if (PROTECTED_SHORTCUTS.includes(shortcut)) {
					console.error(
						`The shortcut "${shortcut}" is protected and can't be bound to "${actionId}"`,
					);
					return false;
				}
				if (!VALID_SHORTCUT.test(shortcut)) {
					// see VALID_SHORTCUT definition for further info
					console.warn(
						`The shortcut "${shortcut}" is unusual and might never be triggered: expected modifiers in the order Meta+Ctrl+Alt+Shift and a KeyboardEvent.code like "KeyA"`,
					);
				}
				return true;
			}),
		),
	);
}
