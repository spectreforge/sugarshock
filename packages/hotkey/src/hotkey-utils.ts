// General utility functions & types

export type Dictionary<K extends keyof any, T> = Readonly<Record<K, T>>;

/**
 * workaround for v8 & TypeScript quirks
 *
 * TypeScript misses special handling around `__proto__` and assigning a never
 * typed value promptly removes the wrongly added property from the object shape
 *
 * v8 puts object literals with `__proto__: null` into DICT mode instead of
 * object mode, therefore to keep object mode we use a shared immutable
 * prototype:
 * https://adventures.nodeland.dev/archive/optimizing-objects-with-null-prototypes/
 */
export const noproto = Object.freeze({ __proto__: null }) as never;

/**
 * @see https://www.w3.org/TR/selectors-3/#whitespace
 */
export const CSS_WHITESPACE: RegExp = /[ \t\n\r\f]+/;

/**
 * Imitates the `~=` attribute selector behaviour, i.e. it splits the given
 * string by {@link CSS_WHITESPACE}, deduplicates them and discards empty
 * strings ("" -> []).
 */
export function splitCssWordList(value: string | null | undefined): string[] {
	return value == null
		? []
		: [...new Set(value.split(CSS_WHITESPACE).filter(isNonEmptyString))];
}

type Version = { major: number; minor: number; patch: number };
/** returns true if `left < right` in terms of SemVer holds */
export function isVersionLess(left: Version, right: Version): boolean {
	return (
		(left.major - right.major ||
			left.minor - right.minor ||
			left.patch - right.patch) < 0
	);
}

/** prototype aware shortcut for `Object.fromEntries(transform(Object.entries(obj)))` */
export function objectTransform<
	K extends string,
	V,
	RK extends PropertyKey,
	RV,
>(
	obj: Dictionary<K, V>,
	proto: object | null | undefined,
	transform: (entries: [K, V][]) => readonly (readonly [RK, RV])[],
): Record<RK, RV> {
	// `Object.entries()` is typed as [string, V][]
	const entries = Object.entries(obj) as [K, V][];
	return {
		__proto__: proto === undefined ? Object.getPrototypeOf(obj) : proto,
		...Object.fromEntries(transform(entries)),
		// TypeScript doesn't special case `__proto__` in object literals, see {@link noproto}
	} as Record<RK, RV>;
}

/** freezes every object in a possibly circular object graph */
export function objectDeepFreeze<T extends object>(obj: T): Readonly<T> {
	Object.freeze(obj);
	for (const value of Object.values(obj)) {
		if (
			typeof value === "object" &&
			value !== null &&
			!Object.isFrozen(value)
		) {
			objectDeepFreeze(value);
		}
	}
	return obj;
}

export function isNonNullObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

export function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value !== "";
}

export function isNonWhitespaceString(value: unknown): value is string {
	return typeof value === "string" && value.trim() !== "";
}

export function entryIsNonNullish<K, V>(
	v: [K, V],
): v is [K, Exclude<V, null | undefined>] {
	return v[1] != null;
}
