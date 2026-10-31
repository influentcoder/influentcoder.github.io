import { expect, type Page, test } from "@playwright/test";

// Collect uncaught exceptions and console errors so each test can assert none occurred.
function trackErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
	page.on("console", (m) => {
		if (m.type() === "error") errors.push(`console: ${m.text()} (${m.location().url})`);
	});
	return errors;
}

// Every page listed in the sitemap, as a site-relative path.
async function sitemapPaths(page: Page): Promise<string[]> {
	const res = await page.request.get("/sitemap-0.xml");
	expect(res.ok()).toBeTruthy();
	const xml = await res.text();
	return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? "/").pathname);
}

test("home page lists posts", async ({ page }) => {
	const errors = trackErrors(page);
	await page.goto("/");
	await expect(page).toHaveTitle(/InfluentCoder/);
	const posts = page.locator('main a.cactus-link[href^="/posts/"]');
	await expect(posts.first()).toBeVisible();
	expect(await posts.count()).toBeGreaterThanOrEqual(10);
	expect(errors).toEqual([]);
});

test("every sitemap page loads without errors", async ({ page }) => {
	const paths = await sitemapPaths(page);
	expect(paths.length).toBeGreaterThan(20);
	const errors = trackErrors(page);
	for (const path of paths) {
		const res = await page.goto(path);
		expect(res?.status(), path).toBe(200);
		await expect(page.locator("main"), path).toBeVisible();
		await expect(page.locator("main"), path).not.toBeEmpty();
	}
	expect(errors).toEqual([]);
});

test("posts render a title, description, table of contents and code blocks", async ({ page }) => {
	const posts = (await sitemapPaths(page)).filter((p) => /^\/posts\/(?!\d+\/$)[a-z0-9-]+\/$/.test(p)); // not /posts/2/ (pagination)
	expect(posts.length).toBe(12);
	for (const path of posts) {
		await page.goto(path);
		await expect(page.locator("main h1").first(), path).not.toBeEmpty();
		await expect(page.locator('meta[name="description"]'), path).toHaveAttribute("content", /.{50,}/);
	}
	await page.goto("/posts/envoy/");
	await expect(page.getByText("Table of Contents")).toBeVisible();
	await expect(page.locator(".expressive-code").first()).toBeVisible();
});

test("pages fit the viewport without horizontal scrolling", async ({ page }) => {
	for (const path of ["/", "/posts/envoy/", "/posts/aws-iam/", "/tags/", "/about/"]) {
		await page.goto(path);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		expect(overflow, path).toBeLessThanOrEqual(1);
	}
});

test("search finds posts", async ({ page }) => {
	await page.goto("/");
	await page.locator("#search").click();
	await page.locator("pagefind-modal input").fill("linux");
	await expect(page.locator('pagefind-modal a[href*="/posts/"]').first()).toBeVisible();
});

test("theme can be switched", async ({ page }) => {
	await page.goto("/");
	const html = page.locator("html");
	const before = await html.getAttribute("data-theme");
	await page.locator("theme-toggle button").click();
	await expect(html).not.toHaveAttribute("data-theme", before ?? "");
});

test("unknown pages return 404", async ({ page }) => {
	const res = await page.goto("/this-page-does-not-exist/");
	expect(res?.status()).toBe(404);
});
