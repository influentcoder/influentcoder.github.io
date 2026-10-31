# Single entry point for working on the site. Run `make help` for the list.

PORT ?= 4321
CONTAINER ?= podman
ENVOY_IMAGE := envoyproxy/envoy:v1.34.1
ENVOY_DIR := .envoy-examples

.DEFAULT_GOAL := help

.PHONY: help install serve build lint prose links test check envoy-examples new-post serve-container clean

help: ## List available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-16s %s\n", $$1, $$2}'

install: ## Install dependencies and the Playwright browser
	npm ci
	npx playwright install chromium

serve: ## Dev server with live reload (http://127.0.0.1:4321)
	npx astro dev --host 127.0.0.1 --port $(PORT)

build: ## Production build into dist/, plus the Pagefind search index
	npm run build

lint: ## Type-check the site and validate post front matter; check the Envoy post's config excerpts
	npx astro check
	@node tools/check-envoy-examples.mjs

prose: ## Fail on LLM-style writing in posts (POST=content/posts/x.md for one post)
	@node tools/check-prose.mjs --strict $(POST)

links: ## Check internal links, images and anchors in the built site
	@node tools/check-links.mjs dist

test: ## Browser smoke tests (Playwright) against the built site
	npx playwright test

check: lint prose build links test ## Everything CI runs: lint, prose, build, links, browser tests

envoy-examples: ## Validate the Envoy post's full configs with Envoy (needs Docker; CI runs this)
	@rm -rf $(ENVOY_DIR) && node tools/check-envoy-examples.mjs content/posts/envoy.md $(ENVOY_DIR)
	@mkdir -p $(ENVOY_DIR)/certs && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=edge.example.org \
		-keyout $(ENVOY_DIR)/certs/edge.key -out $(ENVOY_DIR)/certs/edge.crt 2>/dev/null
	@for f in $(ENVOY_DIR)/config-*.yaml; do \
		echo "Validating $$f with $(ENVOY_IMAGE)"; \
		docker run --rm -e ENVOY_UID=0 -v "$(CURDIR)/$(ENVOY_DIR):/examples:ro" \
			-v "$(CURDIR)/$(ENVOY_DIR)/certs:/etc/envoy/certs:ro" \
			$(ENVOY_IMAGE) --mode validate -c /examples/$$(basename $$f) || exit 1; \
	done

new-post: ## Create a post: make new-post TITLE="My title" [DATE=YYYY-MM-DD]
	@test -n "$(TITLE)" || { echo 'Usage: make new-post TITLE="My title" [DATE=YYYY-MM-DD]'; exit 1; }
	@node tools/new-post.mjs "$(TITLE)" $(DATE)

serve-container: ## Same as serve, but inside a Node container (CONTAINER=podman)
	$(CONTAINER) run --rm -it -p $(PORT):$(PORT) -v "$(CURDIR)":/work -w /work \
		docker.io/library/node:$(shell cat .nvmrc) \
		sh -c "npm ci && npx astro dev --host 0.0.0.0 --port $(PORT)"

clean: ## Remove build output and caches (including cached social images)
	rm -rf dist .astro node_modules/.astro test-results playwright-report $(ENVOY_DIR)
