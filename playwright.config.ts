import { defineConfig, devices } from "@playwright/test";

// Serves the already-built dist/ (run `make build` first; `make check` does this).
const port = 4001;

export default defineConfig({
	testDir: "tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: "retain-on-failure",
	},
	projects: [
		{ name: "desktop", use: { ...devices["Desktop Chrome"] } },
		{ name: "mobile", use: { ...devices["Pixel 7"] } },
	],
	webServer: {
		command: `node tools/serve-dist.mjs ${port} dist`,
		url: `http://127.0.0.1:${port}/`,
		reuseExistingServer: false,
		timeout: 60_000,
	},
});
