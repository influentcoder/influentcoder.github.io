#!/usr/bin/env node
// Serve the built site (dist/) the way GitHub Pages does: /path/ -> path/index.html,
// /path -> path.html, unknown paths -> 404.html with a 404 status.
// Used by the Playwright tests; `astro preview` backgrounds itself in some
// environments, which breaks Playwright's server management.
//
// Usage: node tools/serve-dist.mjs [PORT] [DIR]

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const port = Number(process.argv[2] ?? 4001);
const root = process.argv[3] ?? "dist";
const types = {
	".html": "text/html; charset=utf-8",
	".css": "text/css",
	".js": "text/javascript",
	".json": "application/json",
	".xml": "application/xml",
	".txt": "text/plain",
	".svg": "image/svg+xml",
	".png": "image/png",
	".webp": "image/webp",
	".jpg": "image/jpeg",
	".ico": "image/x-icon",
	".webmanifest": "application/manifest+json",
	".wasm": "application/wasm",
	".woff2": "font/woff2",
};

function find(urlPath) {
	const p = join(root, normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, ""));
	for (const candidate of [p, join(p, "index.html"), `${p}.html`]) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

createServer((req, res) => {
	const path = new URL(req.url ?? "/", "http://localhost").pathname;
	const file = find(path);
	const status = file ? 200 : 404;
	const body = file ?? join(root, "404.html");
	res.writeHead(status, { "Content-Type": types[extname(body)] ?? "application/octet-stream" });
	res.end(readFileSync(body));
}).listen(port, "127.0.0.1", () => console.log(`Serving ${root} on http://127.0.0.1:${port}`));
