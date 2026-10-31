import { test, expect, type Page } from '@playwright/test';

// Collect uncaught exceptions and console errors so each test can assert none occurred.
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()} (${m.location().url})`);
  });
  return errors;
}

// Every page listed in the sitemap, as a site-relative path.
async function sitemapPaths(page: Page): Promise<string[]> {
  const res = await page.request.get('/sitemap.xml');
  expect(res.ok()).toBeTruthy();
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

test('home page lists posts', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle('InfluentCoder');
  await expect(page.locator('#post-list article').first()).toBeVisible();
  expect(await page.locator('#post-list article').count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('every sitemap page loads without errors', async ({ page }) => {
  const paths = await sitemapPaths(page);
  expect(paths.length).toBeGreaterThan(10);
  const errors = trackErrors(page);
  for (const path of paths) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    // Not h1: on mobile, Chirpy hides tab-page headings and shows the title in the top bar.
    await expect(page.locator('main'), path).toBeVisible();
    await expect(page.locator('main'), path).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

test('posts render a title, description and table of contents', async ({ page }) => {
  const posts = (await sitemapPaths(page)).filter((p) => p.startsWith('/posts/'));
  expect(posts.length).toBeGreaterThan(0);
  for (const path of posts) {
    await page.goto(path);
    await expect(page.locator('article h1, header h1').first(), path).not.toBeEmpty();
    await expect(page.locator('meta[name="description"]'), path).toHaveAttribute('content', /.{50,}/);
  }
  await page.goto(posts[0]);
  if (page.viewportSize()!.width >= 1200) {
    await expect(page.locator('#toc-wrapper a').first()).toBeVisible();
  }
});

test('pages fit the viewport without horizontal scrolling', async ({ page }) => {
  for (const path of ['/', '/posts/aws-iam/', '/categories/', '/tags/']) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test('search finds posts', async ({ page }) => {
  await page.goto('/');
  const trigger = page.locator('#search-trigger');
  if (await trigger.isVisible()) await trigger.click();
  await page.locator('#search-input').fill('linux');
  await expect(page.locator('#search-results article').first()).toBeVisible();
});

test('dark mode can be selected', async ({ page }) => {
  test.skip(page.viewportSize()!.width < 850, 'theme switcher lives in the sidebar on desktop');
  await page.goto('/');
  await page.locator('#mode-toggle').click();
  await page.locator('.dropdown-item[data-theme-mode="dark"]').click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(27, 27, 30)');
});

test('unknown pages return 404', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist/');
  expect(res?.status()).toBe(404);
});
