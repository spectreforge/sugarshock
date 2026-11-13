////////////////////////////////////////////////////////////////////////
// APIs which have been documented but haven't been added to the typings
declare module "twine-sugarcube/settings" {
	interface SettingsAPI {
		has(name: string): boolean;

		addValue(
			name: string,
			definition: {
				default?: unknown;
				onInit?(setting: { value: unknown }): void;
			},
		): void;
	}
}

////////////////////////////////////////////////////////////////////////
// Undocumented but longtime stable APIs
declare module "twine-sugarcube/settings" {
	interface SettingsAPI {
		delete(name: string): void;
	}
}

declare module "twine-sugarcube/wiki" {
	interface WikifierAPI {
		/**
		 * Used by SC to render its own `[[...]]` markup.
		 */
		createInternalLink(
			destination: OutputDestination | null,
			passage: string,
			text: string | null,
			callback: (() => void) | null,
		): HTMLAnchorElement;
	}
}

////////////////////////////////////////////////////////////////////////
export {}; // don't you cry little tsc
