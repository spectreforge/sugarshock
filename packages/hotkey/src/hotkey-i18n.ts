// Internationalization infrastructure; text formatting & `l10nStrings` lookup

import type { DEFAULT_STRINGS } from "./hotkey-l10n";
import type { Dictionary } from "./hotkey-utils";

export type L10nKeys = keyof typeof DEFAULT_STRINGS;

/**
 * Provides UI text and substitutes `{name}` placeholders with the provided
 * string vars. Note that it doesn't support the `l10n.get()` mis-feature of
 * substituting placeholders with other `l10nStrings`. `{` and `}` are escaped
 * as `{{` and `}}` respectively.
 */
export interface StringLocalizer {
	/**
	 * @param key The `l10nStrings` key
	 * @param vars Values for the string's `{name}` placeholders
	 */
	text(key: L10nKeys, vars?: Dictionary<string, string>): string;
}

/**
 * Provides UI text and substitutes placeholders with the provided vars which
 * may also be DOM Node instances in addition to plain strings.
 *
 * @see {@link StringLocalizer}
 */
export interface NodeLocalizer extends StringLocalizer {
	/**
	 * Like {@link StringLocalizer.text} but placeholders can be replaced by nodes
	 * and doesn't concatenate anything.
	 */
	nodes<V extends string | Node>(
		key: L10nKeys,
		vars: Dictionary<string, V>,
	): (string | V)[];
}

export const text: StringLocalizer["text"] = (key, vars = {}) =>
	nodes(key, vars).join("");

const TOKENIZER = /(\{\{|\}\}|\{\w+\})/;

export const nodes: NodeLocalizer["nodes"] = (key, vars) => {
	if (!Object.hasOwn(l10nStrings, key)) {
		console.warn(`l10nStrings: no string "${key}"`);
		return [key];
	}
	return l10nStrings[key]
		.split(TOKENIZER)
		.map((part, i) => {
			// the matched tokens end up at the odd positions
			if (i % 2 === 0) {
				return part;
			}
			if (part === "{{" || part === "}}") {
				return part[0];
			}
			const name = part.slice(1, -1);
			if (Object.hasOwn(vars, name)) {
				return vars[name];
			}
			console.warn(`l10nStrings["${key}"]: unknown variable {${part}}`);
			return part;
		})
		.filter((part) => part !== "");
};
