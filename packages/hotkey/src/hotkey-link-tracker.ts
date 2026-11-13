// Link lookup, implicit link & hint assignment

import type { HotkeySettings, ImplicitActionIds } from "./hotkey-settings";
import { noHotkeyPassage, noImplicitHotkeyPassage } from "./hotkey-passthrough";
import { formatAriaKeyshortcut } from "./hotkey-shortcut";
import { splitCssWordList } from "./hotkey-utils";

/**
 * Actions are attached to HTML elements via the `data-hotkey-action` attribute.
 *
 * The attribute may be located on the link itself or an ancestor. Use
 * {@link targetLinkOf} to retrieve the corresponding anchor element.
 */
const ACTION_SELECTOR = "[data-hotkey-action]";

/**
 * Watches over the DOM, i.e maintains element attributes (including hints) and
 * handles link lookup for dispatching link-click actions.
 */
export class LinkTracker {
	readonly #settings: HotkeySettings;

	/**
	 * Dispatches link re-indexing operations if changes to links, their disabled
	 * state or action attributes are detected on the watched element (see constructor).
	 *
	 * @see {@link refreshLinkAttributes}
	 */
	readonly #linkObserver = new MutationObserver((records) => {
		if (
			records.some((record) =>
				record.type === "attributes"
					? record.attributeName === "data-hotkey-action" ||
						record.target.nodeName === "A"
					: hasLinkNode(record.addedNodes) || hasLinkNode(record.removedNodes),
			)
		) {
			this.refreshLinkAttributes();
		}
	});

	/**
	 * To avoid spamming the console with overflow warnings, we keep track of
	 * those we've warned about.
	 */
	readonly #reportedOverflows = new Set<string>();

	/**
	 * Links we've touched so far. We keep track of them to avoid cleansing
	 * attributes manually placed by the author.
	 */
	#annotatedLinks = new Set<HTMLAnchorElement>();

	#currentPassage: { name: string; content: HTMLElement } | null = null;

	constructor(settings: HotkeySettings) {
		this.#settings = settings;

		// Observe the whole page instead of individual passage elements to also
		// catch changes to the UIBar which might get re-rendered with e.g.
		// `UIBar.update` either in response to user actions or as an
		// asynchronous/timed action.
		this.#linkObserver.observe(document.body, {
			subtree: true,
			childList: true,
			attributeFilter: ["data-hotkey-action", "aria-disabled"],
		});

		// N.B. :passagerender is only triggered on jQuery :/
		jQuery(document).on(":passagerender", this.#trackPassage);

		// in case `initialize()` is called first outside of the SC script bundle
		const passageEl = document.querySelector<HTMLElement>(
			"#passages > .passage:not(.passage-out)",
		);
		if (passageEl != null) {
			this.#currentPassage = {
				name: passageEl.dataset["passage"] ?? "<unknown>",
				content: passageEl,
			};
		}
	}
	dispose(): void {
		jQuery(document).off(":passagerender", this.#trackPassage);
		this.#linkObserver.disconnect();
		this.#linkObserver.takeRecords();
		this.#currentPassage &&
			assignImplicitActions(this.#currentPassage.content, null);
		for (const annotatedLink of this.#annotatedLinks) {
			updateHint(this.#settings, annotatedLink, []);
		}
		this.#annotatedLinks.clear();
	}

	readonly #trackPassage = (ev: JQuery.PassageRenderingEvent) => {
		this.#currentPassage = {
			name: ev.detail.passage.name,
			content: ev.detail.content,
		};
		// Annotates the passage before it's attached, so that its links never show
		// up without hints
		this.refreshLinkAttributes();
	};

	/**
	 * Re-annotates the links of the current passage and the explicit links
	 * outside of it, e.g. after the hints or bindings changed.
	 */
	refreshLinkAttributes(): void {
		const hotkeysEnabled = !noHotkeyPassage();

		if (this.#currentPassage != null) {
			const { name: passage, content } = this.#currentPassage;
			const { numOverflowed } = assignImplicitActions(
				content,
				hotkeysEnabled && !noImplicitHotkeyPassage()
					? this.#settings.implicitIds
					: null,
			);
			if (numOverflowed! > 0 && !this.#reportedOverflows.has(passage)) {
				this.#reportedOverflows.add(passage);
				console.warn(
					`Passage "${passage}" has ${numOverflowed} more eligible links than implicit actions. ` +
						`Exclude links with the data-hotkey-noimplicit attribute or disable implicit actions with the nohotkey-implicit passage tag.`,
				);
			}
		}

		this.#annotatedLinks = updateHints(
			this.#settings,
			this.#annotatedLinks,
			this.#currentPassage?.content,
			hotkeysEnabled,
		);
		// Prevent infinite recursive updates. Calling `assignImplicitActions`
		// triggers the mutation observer which in turn calls this method.
		this.#linkObserver.takeRecords();
	}

	findLink(actionId: string): HTMLAnchorElement | undefined {
		const candidates = document.querySelectorAll<HTMLElement>(
			`[data-hotkey-action~="${CSS.escape(actionId)}"]`,
		);

		// take the first candidate whose link is reachable, visible, interactive
		// (not `inert`) and not disabled.
		// N.B. hints get assigned regardless of visibility and `inert` as they're
		// hard to efficiently track.
		for (const el of candidates) {
			if (usableLinkActionIds(this.#settings, el).includes(actionId)) {
				const link = targetLinkOf(el);
				if (
					link !== undefined &&
					isReachable(this.#currentPassage?.content, link) &&
					link.checkVisibility({ visibilityProperty: true }) &&
					link.closest("[inert]") == null &&
					!isDisabled(link)
				) {
					return link;
				}
			}
		}
		return undefined;
	}
}

type ImplicitActionReport = {
	/**
	 * `> 0` => more eligible links have been detected than numbered actions
	 */
	numOverflowed?: number;
};

/**
 * Assigns the implicit actions to the eligible links in the given passage. A
 * link is eligible if and only if it...
 * - ...isn't borked
 * - ...and its ancestors don't have an explicit action attribute
 * - ...and its ancestors aren't explicitly excluded via
 *   `data-hotkey-noimplicit`
 *
 * If you want to remove all implicit link annotations from the passage you may
 * pass `null` for the `implicitIds` parameter.
 *
 * The links are numbered in document order and renumbered whenever this
 * function gets called again, i.e. an inserted link shifts the numbers after
 * it.  We always assign implicit actions to hidden and disabled links due to
 * inspecting the passage DOM before it gets attached to the document and
 * missing a performant API to track changes in this area (namely CSS changes).
 */
function assignImplicitActions(
	passage: HTMLElement,
	implicitIds: ImplicitActionIds | null,
): ImplicitActionReport {
	for (const el of passage.querySelectorAll<HTMLAnchorElement>(
		"a[data-hotkey-implicit]",
	)) {
		delete el.dataset["hotkeyImplicit"];
		delete el.dataset["hotkeyAction"];
	}

	if (implicitIds == null) {
		return {};
	}
	const { single, numbered } = implicitIds;
	const eligibleLinks = passage.querySelectorAll<HTMLAnchorElement>(
		// eligible links are those <a> elements that
		// - aren't borked
		// - don't have an explicit action (on themselves or an ancestor)
		// - aren't explicitly excluded (themselves or via an ancestor)
		"a:not(.link-broken, [data-hotkey-action], [data-hotkey-noimplicit], :is([data-hotkey-action], [data-hotkey-noimplicit]) a)",
	);
	if (eligibleLinks.length === 1) {
		eligibleLinks[0].dataset["hotkeyImplicit"] = "";
		// `single` goes first to hide the hint on pages with a single eligible link
		eligibleLinks[0].dataset["hotkeyAction"] = `${single} ${numbered[0]}`;
		return {};
	}
	const count = Math.min(eligibleLinks.length, numbered.length);
	for (let i = 0; i < count; i++) {
		eligibleLinks[i].dataset["hotkeyImplicit"] = "";
		eligibleLinks[i].dataset["hotkeyAction"] = numbered[i];
	}

	return { numOverflowed: eligibleLinks.length - numbered.length };
}

function updateHints(
	settings: HotkeySettings,
	previouslyAnnotated: Set<HTMLAnchorElement>,
	passageEl: HTMLElement | undefined,
	enabled: boolean,
): Set<HTMLAnchorElement> {
	const actionElements = new Set(
		document.querySelectorAll<HTMLElement>(ACTION_SELECTOR),
	);
	// During `:passagerender` the passage isn't attached yet
	if (passageEl && !passageEl.isConnected) {
		for (const el of passageEl.querySelectorAll<HTMLElement>(ACTION_SELECTOR)) {
			actionElements.add(el);
		}
	}

	const annotatedLinks = new Set<HTMLAnchorElement>();
	for (const el of actionElements) {
		const link = targetLinkOf(el);
		if (link === undefined || !isReachable(passageEl, link)) {
			continue;
		}
		updateHint(
			settings,
			link,
			// The keys of a disabled link do nothing, see `findLink`
			enabled && !isDisabled(link) ? usableLinkActionIds(settings, el) : [],
		);
		annotatedLinks.add(link);
	}
	// E.g. a link which is no longer the first one in its `<<hotlink>>` container
	// or a previously implicit link (see `assignImplicitActions`). The links of
	// an outgoing passage keep their hints until they're gone to prevent visual
	// jittering
	for (const link of previouslyAnnotated) {
		if (!annotatedLinks.has(link) && isReachable(passageEl, link)) {
			updateHint(settings, link, []);
		}
	}

	return annotatedLinks;
}

/**
 * Retrieves the anchor element corresponding to the given element's
 * `data-hotkey-action` attribute (see {@link ACTION_SELECTOR}).
 *
 * It might be the element itself or one of its descendants.
 */
function targetLinkOf(el: Element): HTMLAnchorElement | undefined {
	return el instanceof HTMLAnchorElement
		? el
		: Array.prototype.find.call(
				el.getElementsByTagName("a"),
				// weed out anchor elements wrapped in an action container
				// or having an action attribute themselves
				(link: Element) => link.closest(ACTION_SELECTOR) === el,
			);
}

/**
 * Updates aria-keyshortcuts and hotkey-hint attributes on a link.
 */
function updateHint(
	settings: HotkeySettings,
	link: HTMLElement,
	actionIds: string[],
) {
	const ariaShortcuts = actionIds
		.flatMap((id) => settings.shortcutsForActionId(id))
		.map(formatAriaKeyshortcut)
		.filter((ariaShortcut) => ariaShortcut != null);

	link.ariaKeyShortcuts = ariaShortcuts.join(" ") || null;

	const hint =
		actionIds.length > 0 ? settings.hintForActionId(actionIds[0]) : null;
	// Unlike HiEv's Keyboard Links plugin we don't inject elements into the
	// anchor element due to the fact that some interactive macros (e.g.
	// <<linkappend>>) copy the anchor element's content into other containers and
	// we don't have a sane/robust way of tracking down those copies to remove the
	// hints later on. Therefore we set the `data-hotkey-hint` attribute to the
	// hint value and render it via CSS pseudo-elements. We leave it to the
	// stylesheet to ensure that hints only get rendered on anchor elements as we
	// don't track down stray hint attributes.
	if (hint != null) {
		link.dataset["hotkeyHint"] = hint;
	} else {
		delete link.dataset["hotkeyHint"];
	}
}

/**
 * Determines which actions are valid for the first anchor element in the given
 * HTML element (which might be the link itself). The rules basically boil down
 * to the mentioned action must be of type `link-click` and implicit actions are
 * only valid on implicit links, i.e. elements which have been marked with
 * `data-hotkey-implicit` to weed out attempts at explicitly assigning them.
 */
function usableLinkActionIds(
	{ actions, implicitIds }: HotkeySettings,
	{ dataset }: HTMLElement,
): string[] {
	const isImplicitLink = "hotkeyImplicit" in dataset;
	return splitCssWordList(dataset["hotkeyAction"]).filter(
		(id) =>
			actions[id]?.type === "link-click" &&
			(isImplicitLink || !implicitIds?.includes(id)),
	);
}

/**
 * Determines whether any node in the nodelist includes an anchor element in its tree.
 */
function hasLinkNode(nodeList: NodeList) {
	return Array.prototype.some.call(nodeList, (node) => {
		return (
			node.nodeName === "A" ||
			(node instanceof Element && node.querySelector("a") != null)
		);
	});
}

/**
 * Mirrors SC's `ariaClick()` definition of a disabled element.
 */
function isDisabled(link: Element) {
	return link.ariaDisabled === "true";
}

/**
 * Determines whether the given element is part of the "active" element tree,
 * i.e. not in a passage transitioning out.
 *
 * @param currentPassage the currently active passage container element.
 */
function isReachable(currentPassage: HTMLElement | undefined, el: Element) {
	return currentPassage?.contains(el) || el.closest("#passages") == null;
}
