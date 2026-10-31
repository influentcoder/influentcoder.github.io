#!/usr/bin/env node
// Check the Envoy configs in the Envoy post.
//
// YAML blocks that start with "admin:" are complete configs: they are written
// to OUT_DIR so `make envoy-examples` can run `envoy --mode validate` on them.
// Every other YAML block is an excerpt and must appear, line for line (at any
// indentation), in one of the complete configs, so excerpts can't drift from
// the configs that were validated.
//
// Usage: node tools/check-envoy-examples.mjs [POST] [OUT_DIR]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const post = process.argv[2] ?? "content/posts/envoy.md";
const outDir = process.argv[3];

const blocks = [...readFileSync(post, "utf8").matchAll(/^```yaml[^\n]*\n([\s\S]*?)^```$/gm)].map((m) =>
	m[1].replace(/\n$/, "").split("\n").map((l) => l.trimEnd()),
);
const configs = blocks.filter((b) => b[0]?.startsWith("admin:"));
const excerpts = blocks.filter((b) => !b[0]?.startsWith("admin:"));
if (configs.length === 0) {
	console.error(`${post}: no complete Envoy config (a yaml block starting with admin:)`);
	process.exit(1);
}

const indent = (line) => line.match(/^ */)[0].length;

function excerptOf(excerpt, config) {
	const base = indent(excerpt[0]);
	return config.some((line, i) => {
		const offset = indent(line) - base;
		if (offset < 0) return false;
		return excerpt.every((l, k) => config[i + k] === (l === "" ? "" : " ".repeat(offset) + l));
	});
}

const failed = excerpts.filter((e) => !configs.some((c) => excerptOf(e, c)));
for (const e of failed) console.error(`${post}: excerpt not found in any full config:\n${e.slice(0, 3).join("\n")}\n...`);

if (outDir) {
	mkdirSync(outDir, { recursive: true });
	configs.forEach((c, i) => writeFileSync(join(outDir, `config-${i + 1}.yaml`), `${c.join("\n")}\n`));
}

if (failed.length) process.exit(1);
console.log(`${post}: ${configs.length} full configs, ${excerpts.length} excerpts match`);
