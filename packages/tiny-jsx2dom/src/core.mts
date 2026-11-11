type IfEquals<X, Y, A, B> =
	(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;

/** keys of T without index signatures (HTMLFormElement, HTMLSelectElement, ...) */
type KnownKeys<T> = keyof {
	[K in keyof T as string extends K ? never : number extends K ? never : K]: 0;
};

type WritableKeys<T> = {
	[P in KnownKeys<T> & keyof T]-?: IfEquals<
		{ [Q in P]: T[P] },
		{ -readonly [Q in P]: T[P] },
		P,
		never
	>;
}[KnownKeys<T> & keyof T];

/**
 * accessors whose setter takes a string while the getter returns an object
 * ([PutForwards] in WebIDL); mapped types only see the getter type
 */
type StringSetterKeys =
	| "style"
	| "classList"
	| "relList"
	| "sizes"
	| "sandbox"
	| "part"
	| "blocking"
	| "htmlFor";

/**
 * just some cheap hints that you're doing something wrong (no runtime enforcement)
 */
type ForbiddenContentPropKeys =
	| "children"
	| "innerHTML"
	| "outerHTML"
	| "textContent"
	| "innerText"
	| "outerText";

/** writable, non-method properties; on* handlers stay since they're `fn | null` */
type PropsOf<E> = {
	[
		K in WritableKeys<E> as K extends
			StringSetterKeys | ForbiddenContentPropKeys
			? never
			: E[K] extends (...args: never) => unknown
				? never
				: K
	]?: E[K] | undefined;
} & {
	[K in StringSetterKeys & keyof E]?: string | undefined;
};

type Dataset = Record<string, string | boolean | undefined> | undefined;
type UntypedAttributes =
	Record<string, string | boolean | undefined> | undefined;

export declare namespace JSX {
	/**
	 * note that we don't render booleans, they're allowed make the conditional
	 * rendering pattern work
	 */
	type Child = Node | string | number | boolean | null | undefined;
	type Children = Child | Iterable<Children>;

	/** a bare text node isn't a valid result; render text via a fragment */
	type Element = globalThis.Element | DocumentFragment;
	type ElementType =
		keyof IntrinsicElements | ((props: never) => Element | null);
	interface ElementChildrenAttribute {
		children: {};
	}
	interface IntrinsicAttributes {}
	type HTMLProps<E extends HTMLElement> = PropsOf<E> & {
		ref?: (el: E) => void;
		children?: Children;
		dataset?: Dataset;
		/**
		 * Attribute setters serving as escape hatch (assigned last).
		 */
		attrs?: UntypedAttributes;
	};
	type IntrinsicElements = {
		[K in keyof HTMLElementTagNameMap]: HTMLProps<HTMLElementTagNameMap[K]>;
	};
}

type AnyComponent = (props: object) => JSX.Element | null;

/** a function component; returning null renders nothing */
export type Component<P = {}> = (props: P) => JSX.Element | null;

/** P plus optional children; declare `children` in P to make it required or narrower */
export type PropsWithChildren<P = {}> = P & { children?: JSX.Children };

/** props of an intrinsic element, incl. ref/dataset/attrs; for wrappers */
export type IntrinsicProps<K extends keyof JSX.IntrinsicElements> =
	JSX.IntrinsicElements[K];

type Props = {
	ref?: (el: HTMLElement) => void;
	children?: JSX.Children;
	dataset?: Dataset;
	attrs?: UntypedAttributes;
	readonly [name: string]: unknown;
};

export type JsxFn = (
	type: keyof JSX.IntrinsicElements | AnyComponent,
	props: Props,
	_key?: string,
) => JSX.Element;
export type FragmentFn = (props: { children?: JSX.Children }) => JSX.Element;

export type Runtime = { jsx: JsxFn; jsxs: JsxFn; Fragment: FragmentFn };
export function createRuntime(
	doc: Pick<Document, "createElement" | "createDocumentFragment">,
): Runtime {
	const jsx: JsxFn = (type, props, _key) => {
		if (typeof type === "function") {
			return type(props) ?? doc.createDocumentFragment();
		}
		// prettier-ignore
		const {
			ref, children, dataset, attrs,
			type: elType,
			value, checked, defaultValue, defaultChecked,
			...set
		} = props;
		const el = doc.createElement(type);
		// e.g. <select value needs the options attached first
		if (children != null) {
			renderChildren(el, children);
		}
		// prop assignment order mimics React
		// e.g. <input needs its type set before assigning type specific props
		assignProps(el, { type: elType });
		assignProps(el, set);
		// e.g. <input type="range" default min value might clamp the set value
		assignProps(el, { value, checked, defaultValue, defaultChecked });
		if (dataset != null) {
			for (const key in dataset) {
				if (Object.hasOwn(dataset, key)) {
					const value = dataset[key];
					if (value === true || typeof value === "string") {
						el.dataset[key] = value === true ? "" : value;
					}
				}
			}
		}
		if (attrs != null) {
			for (const attrName in attrs) {
				if (Object.hasOwn(attrs, attrName)) {
					const value = attrs[attrName];
					if (value === true || typeof value === "string") {
						el.setAttribute(attrName, value === true ? "" : value);
					}
				}
			}
		}
		ref?.(el);
		return el;
	};
	return {
		jsx,
		jsxs: jsx,
		Fragment({ children }) {
			const fragment = doc.createDocumentFragment();
			if (children != null) {
				renderChildren(fragment, children);
			}
			return fragment;
		},
	};
}

function assignProps(el: object, props: Record<string, unknown>): void {
	for (const key in props) {
		if (Object.hasOwn(props, key)) {
			const value = props[key];
			if (value !== undefined) {
				(el as Record<string, unknown>)[key] = value;
			}
		}
	}
}

function renderChildren(n: ParentNode, children: JSX.Children): void {
	if (isMultipleChildren(children)) {
		// exhaust potential generators before causing any side effects ourselves
		const eagerChildren = Array.isArray(children) ? children : [...children];
		const limit = eagerChildren.length;
		for (let i = 0; i < limit; ++i) {
			renderChildren(n, eagerChildren[i]);
		}
	} else if (children != null && typeof children !== "boolean") {
		n.append(typeof children === "object" ? children : String(children));
	}
}
function isMultipleChildren(
	children: JSX.Children,
): children is Iterable<JSX.Children> {
	return (
		children !== null &&
		typeof children === "object" &&
		!("nodeType" in children) && // HTMLSelectElement is at it again
		Symbol.iterator in children
	);
}
