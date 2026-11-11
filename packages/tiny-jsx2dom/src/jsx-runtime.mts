import { createRuntime, type FragmentFn, type JsxFn } from "./core.mjs";

export type { JSX } from "./core.mjs";

// this is a bit awkward, but isolatedDeclarations (TS9019) forces us into this pickle
const globalRuntime = /* @__PURE__ */ createRuntime(globalThis.document);
export const jsx: JsxFn = /* @__PURE__ */ (() => globalRuntime.jsx)();
export const jsxs: JsxFn = /* @__PURE__ */ (() => globalRuntime.jsxs)();
export const Fragment: FragmentFn = /* @__PURE__ */ (() =>
	globalRuntime.Fragment)();
