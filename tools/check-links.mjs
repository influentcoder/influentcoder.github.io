#!/usr/bin/env node
// Check internal links, images and scripts in the built site: every href/src
// pointing inside the site must resolve to a file in DIR, and every #fragment
// to an element id on the target page. External links are not checked.
//
// Usage: node tools/check-links.mjs [DIR]   (default: dist)

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const root = process.argv[2] ?? "dist";
const pages = readdirSync(root, { recursive: true })
	.filter((f) => f.endsWith(".html"))
	.map((f) => join(root, f));

const idCache = new Map();
function idsOf(file) {
	if (!idCache.has(file)) {
		const html = readFileSync(file, "utf8");
		idCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
	}
	return idCache.get(file);
}

// Map a URL path to the file that would serve it.
function resolve(urlPath) {
	const p = join(root, decodeURIComponent(urlPath));
	if (existsSync(p) && statSync(p).isFile()) return p;
	if (existsSync(join(p, "index.html"))) return join(p, "index.html");
	if (existsSync(`${p}.html`)) return `${p}.html`;
	return null;
}

let checked = 0;
const broken = [];
for (const page of pages) {
	const html = readFileSync(page, "utf8");
	const pageUrl = `/${relative(root, page)}`.replace(/index\.html$/, "");
	for (const [, attr, raw] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
		if (/^(https?:|mailto:|data:|javascript:|\/\/)/.test(raw) || raw === "") continue;
		const url = new URL(raw.replaceAll("&amp;", "&"), `https://site${pageUrl}`);
		checked += 1;
		const target = resolve(url.pathname);
		if (!target) {
			broken.push(`${page}: ${attr}="${raw}" -> no such file`);
		} else if (url.hash && target.endsWith(".html") && !idsOf(target).has(decodeURIComponent(url.hash.slice(1)))) {
			broken.push(`${page}: ${attr}="${raw}" -> no element with id "${url.hash.slice(1)}"`);
		}
	}
}

for (const b of broken) console.error(b);
console.log(`Checked ${checked} internal links in ${pages.length} pages, ${broken.length} broken.`);
if (checked === 0) {
	console.error("No links were checked, so nothing was verified. Was the site built?");
	process.exit(1);
}
if (broken.length) process.exit(1);
