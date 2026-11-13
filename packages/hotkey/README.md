# @spectreforge/sugarcube-hotkey

```
SugarShock
    __          __  __
   / /_  ____  / /_/ /_____  __  __
  / __ \/ __ \/ __/ //_/ _ \/ / / /
 / / / / /_/ / /_/ ,< /  __/ /_/ /
/_/ /_/\____/\__/_/|_|\___/\__, /
                          /____/
```

Keyboard shortcuts for [SugarCube 2](https://www.motoslave.net/sugarcube/2/)
stories which players can rebind in a settings dialog. Requires SugarCube
v2.37.0 or later.

OOB features:

- <kbd>←</kbd> / <kbd>→</kbd> for history navigation.
- <kbd>Space</kbd> for passages with a single link (after scrolling to the bottom).
- <kbd>1</kbd>–<kbd>5</kbd> and <kbd>Q</kbd>–<kbd>T</kbd> for the first ten
  links of a passage. Each one is annotated with a small hint like `[1]`. The
  <kbd>6</kbd>–<kbd>0</kbd> keys can be used instead of
  <kbd>Q</kbd>–<kbd>T</kbd> as well as the numpad numbers.
- Closes Dialogs on <kbd>Escape</kbd>.
- Player toggle for hint display.

The public API typings ([`hotkey.d.ts`](https://cdn.jsdelivr.net/npm/@spectreforge/sugarcube-hotkey/dist/hotkey.d.ts)) feature in-depth documentation for the plugin options.

## Installation

The package ships three files in `dist/`:

- `hotkey.js` has to go into the Story JavaScript _before_ any code using the
  `Hotkey` global
- `hotkey.css` goes into the Story Stylesheet
- `hotkey.d.ts` declares the `Hotkey` global for your editor, e.g. via
  `/// <reference types="@spectreforge/sugarcube-hotkey" />`

### Tweego

Add the package via your favourite package manager:

```sh
yarn add --dev @spectreforge/sugarcube-hotkey
# or
npm install -S -D @spectreforge/sugarcube-hotkey
```

Include the plugin sources in your tweego invocation before your own:

```sh
tweego -o index.html node_modules/@spectreforge/sugarcube-hotkey/dist src
```

### Twine

Copy the contents of
[`hotkey.js`](https://cdn.jsdelivr.net/npm/@spectreforge/sugarcube-hotkey/dist/hotkey.js)
to the top of your Story JavaScript and
[`hotkey.css`](https://cdn.jsdelivr.net/npm/@spectreforge/sugarcube-hotkey/dist/hotkey.css)
into your Story Stylesheet.

## Usage

```js
Hotkey.initialize();
```

That's it. A "Keyboard Settings" item will be added to the UI bar and the players' changed bindings will be persisted with SugarCube's settings.

### Custom actions

```js
Hotkey.initialize({
	actions: {
		inventory: { type: "link-click", name: "Open Inventory" },
		journal: {
			type: "invoke",
			name: "Open Journal",
			handle: () => Engine.play("Journal"),
		},
	},
	keymap: { KeyI: "inventory", KeyJ: "journal" },
	hints: { inventory: Hotkey.AUTO_HINT },
	/*... other options ...*/
});
```

Shortcuts are physical keys (`KeyboardEvent.code`) with optional modifiers in
the order `Meta+Ctrl+Alt+Shift`, e.g. `Ctrl+Shift+KeyS`. Browser and assistive
technology shortcuts like <kbd>Tab</kbd> or <kbd>Ctrl</kbd>+<kbd>R</kbd> can't
be bound.

A `link-click` action clicks the first visible and enabled link marked with it:

```
<<hotlink-to "inventory" "Inventory">>
<<hotlink-to "inventory" [[Inventory][$from = passage()]]>>
<<hotlink "inventory">><<link "Inventory">>...<</link>><</hotlink>>
```

All options are documented in `hotkey.d.ts`.

### Opting out

- `nohotkey` passage tag: no shortcuts and no hints on this passage
- `nohotkey-implicit` passage tag: no numbered links on this passage
- `data-hotkey-noimplicit` attribute: excludes a link (or all links within the
  element) from numbering
- `implicitActions: false` option: no numbered links at all

### Hint display

By default the shortcut hints will be displayed and a SugarCube setting will be
registered. These can be individually controlled on initialization like so:

```js
Hotkey.initialize({
	showHintsDefault: false, // don't show visible hints by default
	showHintsToggle: false, // don't let users change hint visibility themselves
	/*... other options ...*/
});
```

## Localization

All UI strings are `l10nStrings` entries prefixed with `hotkey`, see
`DEFAULT_STRINGS` in
[`hotkey-l10n.ts`](https://github.com/spectreforge/sugarshock/blob/main/packages/hotkey/src/hotkey-l10n.ts).
Assign your translations before calling `Hotkey.initialize()`, or call it again
afterwards.

## Theming

The settings dialog derives its colours from the surrounding text colour and
can be adjusted via a few CSS custom properties which are documented at the top
of `hotkey.css`.
