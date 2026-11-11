// SC macros for links with explicit actions.

import type { HotkeySettings } from "./hotkey-settings";
import {
	isNonEmptyString,
	isNonNullObject,
	splitCssWordList,
} from "./hotkey-utils";

export const MACRO_ID = {
	LINK: "hotlink",
	LINK_TO: "hotlink-to",
} as const;
Object.freeze(MACRO_ID);

/**
 * Registers our SC macros <<hotlink>> and <<hotlink-to>>.
 */
export function registerMacros(settings: HotkeySettings): void {
	// `<<hotlink "id">>...<</hotlink>>` wraps the contents in an element with a
	// special HTML attribute specifying with which the first link element in the
	// contents can be triggered. Further links are ignored (and also never get an
	// implicit action assigned)
	Macro.add(MACRO_ID.LINK, {
		tags: null,
		handler() {
			const actionIds = parseMacroActionIds(settings, this.args[0]);
			if (typeof actionIds === "string") {
				return this.error(actionIds);
			}
			if (this.args.length > 1) {
				return this.error(
					"takes only the action ids, the link goes between the tags",
				);
			}
			const wrapper = (
				<span
					className={`macro-${this.name}`}
					dataset={{ hotkeyAction: actionIds.join(" ") }}
				/>
			);
			jQuery(wrapper).wiki(this.payload[0].contents);
			this.output.append(wrapper);
			return undefined; // TS doesn't like mixing explicit/implicit returns
		},
	});

	// a shorthand macro for simple links; works the same as `<<hotlink>>` except
	// that the link is described by macro arguments and as `<<link>>` markup in
	// the contents.
	// `<<hotlink-to "id1 id2" "passage">>`
	// `<<hotlink-to "id1" "text" "passage">>`
	// `<<hotlink-to "id" [[text|passage][$gone = true]]>>`
	Macro.add(MACRO_ID.LINK_TO, {
		handler() {
			const [actionIdsArg, ...linkArgs] = this.args;
			const actionIds = parseMacroActionIds(settings, actionIdsArg);
			if (typeof actionIds === "string") {
				return this.error(actionIds);
			}

			const link = createLinkFromArgs(this.output, linkArgs);
			if (typeof link === "string") {
				return this.error(link);
			}
			link.classList.add(`macro-${this.name}`);
			link.dataset["hotkeyAction"] = actionIds.join(" ");
			return undefined;
		},
	});
}
export function deregisterMacros(): void {
	Macro.delete(Object.values(MACRO_ID));
}

/**
 * Splits and validates CSS whitespace separated action ids.
 *
 * @returns the ids or the error message
 */
function parseMacroActionIds(
	settings: HotkeySettings,
	arg: unknown,
): string[] | string {
	if (!isNonEmptyString(arg)) {
		return "the action ids must be a non-empty string";
	}
	const actionIds = splitCssWordList(arg);
	return actionIds.length === 0
		? "no action id specified"
		: (actionIds.reduce<string | null>(
				(err, id) => err ?? settings.validateLinkActionId(id),
				null,
			) ?? actionIds);
}

/**
 * Emulate SC <<link>> macro argument handling
 * - One or two string args form is ("text")? "passageName"
 * - Single `[[...]]` markup argument, see {@link WikiLingArg}
 *
 * @returns the link or why the arguments fail to form one
 */
function createLinkFromArgs(
	output: DocumentFragment | HTMLElement,
	args: unknown[],
): HTMLAnchorElement | string {
	if (args.length === 1 && isWikiLinkArg(args[0])) {
		const { link, external, text, setFn } = args[0];
		return external
			? // like standard `[[...]]` markup we ignore the setter of external links
				Wikifier.createExternalLink(output, link, text)
			: Wikifier.createInternalLink(output, link, text, setFn);
	}
	if (0 < args.length && args.length < 3 && args.every(isNonEmptyString)) {
		const passage = args.at(-1)!;
		const text = args[0];
		return Wikifier.createInternalLink(output, passage, text, null);
	}
	return 'expected "passage", "text" "passage" or [[link]] after the action ids';
}

/**
 * SC's parsed `[[...]]` markup representation.
 *
 * @see https://github.com/tmedwards/sugarcube-2/blob/ba17b12343728d191b5cc6a82e4dc5713379863d/src/markup/parserlib.js#L689
 */
interface WikiLinkArg {
	isLink: true;
	link: string;
	text: string;
	external: boolean;
	setFn: (() => void) | null;
}

function isWikiLinkArg(arg: unknown): arg is WikiLinkArg {
	return isNonNullObject(arg) && "isLink" in arg && arg.isLink === true;
}
