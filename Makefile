# Single entry point for working on the site. Run `make help` for the list.

# Force UTF-8 so Ruby tools work in containers with a POSIX/C locale.
export LANG := C.UTF-8
export LC_ALL := C.UTF-8
export RUBYOPT := -Eutf-8

SITE := _site
PORT ?= 4000
ENVOY_IMAGE := envoyproxy/envoy:v1.34.1
ENVOY_DIR := .envoy-examples
CONTAINER ?= podman
RUBY_VERSION := $(shell cat .ruby-version)

.DEFAULT_GOAL := help

.PHONY: help install serve build lint prose links test check envoy-examples new-post serve-container clean

help: ## List available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  make %-16s %s\n", $$1, $$2}'

install: ## Install Ruby gems and the Playwright test runner
	bundle install
	npm ci
	npx playwright install chromium

serve: ## Run the dev server with live rebuild (http://127.0.0.1:4000)
	bundle exec jekyll serve --host 127.0.0.1 --port $(PORT)

build: ## Production build into _site; fails on any Jekyll warning
	@rm -rf $(SITE)
	@JEKYLL_ENV=production bundle exec jekyll build --strict_front_matter -d $(SITE) 2>&1 | tee .build.log
	@if grep -Eq 'Warning|Conflict|Error' .build.log; then \
		printf "\nBuild produced warnings (see above). Fix them before pushing.\n"; rm -f .build.log; exit 1; \
	fi; rm -f .build.log

lint: ## Validate post filenames and front matter, and the Envoy post's config excerpts
	@ruby tools/check_posts.rb
	@ruby tools/check_envoy_examples.rb

prose: ## Fail on LLM-style writing in posts (POST=_posts/x.md for one post)
	@ruby tools/check_prose.rb --strict $(POST)

links: ## Check internal links, images and scripts in the built site
	@out=$$(bundle exec htmlproofer $(SITE) --disable-external \
		--ignore-urls "/^http:\/\/127.0.0.1/,/^http:\/\/0.0.0.0/,/^http:\/\/localhost/" 2>&1); \
	status=$$?; echo "$$out" | tail -5; [ $$status -eq 0 ] || exit $$status; \
	echo "$$out" | grep -Eq 'Checking [1-9][0-9]* internal links' || \
		{ echo "htmlproofer checked 0 links, so nothing was verified."; exit 1; }

test: ## Browser smoke tests (Playwright) against the built site
	npx playwright test

check: lint prose build links test ## Everything CI runs: lint, prose, build, links, browser tests

envoy-examples: ## Validate the Envoy post's full configs with Envoy (needs Docker; CI runs this)
	@rm -rf $(ENVOY_DIR) && ruby tools/check_envoy_examples.rb _posts/2025-06-01-envoy.md $(ENVOY_DIR)
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
	@ruby tools/new_post.rb "$(TITLE)" $(DATE)

serve-container: ## Same as serve, but inside a Ruby container (CONTAINER=podman)
	$(CONTAINER) run --rm -it -p $(PORT):$(PORT) -v "$(CURDIR)":/work -w /work \
		docker.io/library/ruby:$(RUBY_VERSION) \
		sh -c "bundle install && bundle exec jekyll serve --host 0.0.0.0 --port $(PORT) --force_polling"

clean: ## Remove build output and caches
	rm -rf $(SITE) .jekyll-cache test-results playwright-report $(ENVOY_DIR)
