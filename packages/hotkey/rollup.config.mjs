// @ts-check
/// <reference types="node" />

import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";

import packageJSON from "./package.json" with { type: "json" };

const INPUT = "src/hotkey.ts";
const GLOBAL_NAME = "Hotkey";

const assetsPath = resolve(import.meta.dirname, "assets") + sep;

const banner = `/*!
 * SugarShock
${readFileSync("banner.txt", "ascii")
	.split("\n")
	.map((line) => ` * ${line}`)
	.join("\n")}
 *
 * ${packageJSON.name} v${packageJSON.version}
 * ${packageJSON.homepage}
 * Copyright 2026 io-spectre, MIT License
 */`;

/** @type {import("rollup").RollupOptions[]} */
export default [
	{
		input: INPUT,
		output: {
			file: "dist/hotkey.js",
			format: "iife",
			name: GLOBAL_NAME,
			banner,
			// export to global
			footer: `globalThis.${GLOBAL_NAME} = ${GLOBAL_NAME};`,
		},
		plugins: [
			// inlines the JSX runtime
			nodeResolve(),
			typescript({
				tsconfig: "tsconfig.json",
				noEmit: false,
				// the declarations are bundled by the second config
				declaration: false,
				isolatedDeclarations: false,
				// type errors shouldn't interrupt the watch mode
				noEmitOnError: !process.env["ROLLUP_WATCH"],
			}),
			copyStylesheet("src/hotkey.css"),
		],
	},
	{
		input: INPUT,
		output: {
			file: "dist/hotkey.d.ts",
			banner,
			// match the global export (see above)
			footer: `export as namespace ${GLOBAL_NAME};`,
		},
		plugins: [dts({ tsconfig: "tsconfig.json" })],
	},
];

/**
 * Ships the stylesheet next to the bundle.
 *
 * @param {string} path
 * @returns {import("rollup").Plugin}
 */
function copyStylesheet(path) {
	return {
		name: "copy-stylesheet",
		buildStart() {
			this.addWatchFile(path);

			// poor man's SVG inlining; we want to avoid shipping extra assets
			// (if we need something smarter than this, we should switch to svgo)
			const css = readFileSync(path, "utf8").replaceAll(
				/url\("(\.{1,2}\/[^"]+\.svg)"\)/g,
				(_, url) => {
					const file = resolve(dirname(path), url);
					if (!file.startsWith(assetsPath)) {
						this.error(
							`Tried inlining an SVG from outside of "./assets": ${file}`,
						);
					}
					this.addWatchFile(file);
					const svg = readFileSync(file, "utf8")
						.replaceAll(/<!--[\s\S]*?-->/g, "") // strip comments
						.replaceAll(/>\s+</g, "><") // strip formatting whitespace
						.replaceAll(/\s+/g, " ") // collapse content whitespace
						.trim();
					return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
				},
			);

			this.emitFile({
				type: "asset",
				fileName: "hotkey.css",
				source: `${banner}\n${css}`,
			});
		},
	};
}
