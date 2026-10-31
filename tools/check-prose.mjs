#!/usr/bin/env node
// Flag writing patterns that make posts read as machine-generated: emoji or
// bold or numbered headings, paper-style sections, stock phrases, heavy bold
// and em-dash use, and broken code fences. See .claude/skills/edit-post/.
//
// Usage: node tools/check-prose.mjs [--strict] [--quiet] [FILE...]
//   Warnings only by default; --strict exits 1 if anything is found (this is
//   what `make prose` and `make check` use); --quiet prints only the totals.

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]/u;
const SCAFFOLD_HEADINGS =
	/^(abstract|introduction|methodology|conclusion|summary|final thoughts|closing thoughts|key takeaways|wrapping up|tl;?dr)$/i;
const STOCK_PHRASES = new RegExp(
	[
		/\bdelv(e|es|ed|ing)\b/, /\b(ever|rapidly)[- ]evolving\b/, /\blandscape\b/,
		/\bcrucial\b/, /\bseamless(ly)?\b/, /\brobust\b/, /\bleverag(e|es|ed|ing)\b/,
		/\bcomprehensive\b/, /\bin today's\b/, /\bit'?s (important|worth) (to note|noting)\b/,
		/\bgame[- ]changer\b/, /\bunlock(s|ed|ing)?\b/, /\bempower(s|ed|ing)?\b/,
		/\blet'?s (dive|delve)\b/, /\bdeep dive\b/, /\bwhether you'?re\b/,
		/\bplays? an? (key|vital|crucial|pivotal) role\b/, /\bpivotal\b/, /\btestament to\b/,
		/\bnavigat(e|ing) the complexit/, /\btapestry\b/, /\bharness(es|ed|ing)?\b/,
		/\bin (conclusion|summary)\b/, /\bat its core\b/, /\bembark/, /\bcutting[- ]edge\b/,
		/\bindispensable\b/, /\bbackbone\b/, /\bmyriad\b/, /\bplethora\b/, /\bstreamlin(e|es|ed|ing)\b/,
	]
		.map((r) => r.source)
		.join("|"),
	"gi",
);
const MAX_BOLD = 5; // **bold** spans per post
const MAX_EM_DASHES = 3; // per post
const MAX_RULES = 1; // "---" separators per post

function check(path) {
	const issues = [];
	const lines = readFileSync(path, "utf8").split("\n");
	const fmEnd = lines.findIndex((l, i) => i > 0 && l.trim() === "---"); // closing front matter line
	let inCode = false;
	let bold = 0;
	let em = 0;
	let rules = 0;

	lines.forEach((line, idx) => {
		const n = idx + 1;
		if (idx <= fmEnd && !line.startsWith("  ")) return; // front matter, except the indented description

		if (line.startsWith("```")) {
			if (/^```\w*\s+\S.*```$/.test(line.trim())) issues.push([n, "broken-fence", "code fence and code on one line"]);
			inCode = !inCode;
			return;
		}
		if (inCode) return;

		if (/^---[a-z]+\s*$/i.test(line)) issues.push([n, "broken-fence", `"${line.trim()}" is not a code fence; use \`\`\` instead`]);

		if (line.startsWith("#")) {
			if (EMOJI.test(line)) issues.push([n, "emoji-heading", "heading contains an emoji"]);
			if (/^#+\s+\*\*/.test(line)) issues.push([n, "bold-heading", "heading is wrapped in **bold**"]);
			if (/^#+\s+(\*\*)?\d+(\.\d+)*\.?\s/.test(line)) issues.push([n, "numbered-heading", "heading is numbered"]);
			const bare = line
				.replace(/^#+\s+/, "")
				.replace(new RegExp(`\\*\\*|${EMOJI.source}`, "gu"), "")
				.replace(/^\d+(\.\d+)*\.?\s*/, "")
				.trim();
			if (SCAFFOLD_HEADINGS.test(bare)) issues.push([n, "scaffold-heading", `"${bare}" section: paper-style structure`]);
		}

		if (idx > fmEnd && line.trim() === "---") rules += 1;
		bold += (line.match(/\*\*[^*]+\*\*/g) || []).length;
		em += (line.match(/—/g) || []).length;
		for (const m of line.matchAll(STOCK_PHRASES)) issues.push([n, "stock-phrase", `"${m[0]}"`]);
	});

	if (bold > MAX_BOLD) issues.push([0, "bold-density", `${bold} bold spans (max ${MAX_BOLD}); keep bold for real warnings`]);
	if (em > MAX_EM_DASHES) issues.push([0, "em-dash", `${em} em-dashes (max ${MAX_EM_DASHES}); use commas, brackets or " - "`]);
	if (rules > MAX_RULES) issues.push([0, "section-rules", `${rules} "---" separators (max ${MAX_RULES}); headings already separate sections`]);
	return issues;
}

function posts(dir) {
	return readdirSync(dir, { recursive: true })
		.filter((f) => /\.mdx?$/.test(f))
		.map((f) => join(dir, f))
		.sort();
}

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const quiet = args.includes("--quiet");
const files = args.filter((a) => !a.startsWith("--"));
const targets = files.length ? files : posts("content/posts");

let total = 0;
const summary = targets.map((path) => {
	const issues = check(path).sort((a, b) => a[0] - b[0]);
	if (!quiet) for (const [n, rule, msg] of issues) console.error(`${path}:${n}: [${rule}] ${msg}`);
	total += issues.length;
	return [path.endsWith("index.md") ? basename(join(path, "..")) : basename(path), issues.length];
});

console.log("\nProse warnings per post:");
for (const [name, count] of summary) console.log(`  ${name.padEnd(50)} ${String(count).padStart(3)}`);
console.log(`  Total: ${total}`);
if (strict && total > 0) process.exit(1);
