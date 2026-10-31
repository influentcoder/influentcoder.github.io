#!/usr/bin/env node
// Create a new post with the required front matter.
//
// Usage: node tools/new-post.mjs "Post title" [YYYY-MM-DD]

import { existsSync, writeFileSync } from "node:fs";

const title = (process.argv[2] ?? "").trim();
if (!title) {
	console.error('Usage: node tools/new-post.mjs "Post title" [YYYY-MM-DD]');
	process.exit(1);
}
const date = process.argv[3] ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
	console.error(`Invalid date: ${date} (expected YYYY-MM-DD)`);
	process.exit(1);
}

const slug = title
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, "-")
	.replace(/^-|-$/g, "");
const path = `content/posts/${slug}.md`;
if (existsSync(path)) {
	console.error(`${path} already exists`);
	process.exit(1);
}

writeFileSync(
	path,
	`---
title: ${JSON.stringify(title)}
description: >-
  CHANGE ME: one or two sentences (50-200 characters) shown under the title, in previews and search results.
publishDate: ${date}
tags: [change-me]
---

Intro paragraph.
`,
);
console.log(path);
