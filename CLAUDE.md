# InfluentCoder blog

Personal tech blog at https://influentcoder.com. Built with Jekyll and the
[Chirpy](https://github.com/cotes2020/jekyll-theme-chirpy) theme (installed as
a gem, so its layouts live in the gem, not this repo) and deployed to GitHub
Pages by `.github/workflows/pages-deploy.yml` on every push to `main`.

## Commands

Everything goes through `make` (run `make help` for the list):

| Command | What it does |
|---|---|
| `make install` | Install gems (into `.bundle/`) and the Playwright test runner |
| `make serve` | Dev server with live rebuild at http://127.0.0.1:4000 |
| `make check` | **Run before every push.** Lint posts, production build, link check, browser tests. CI runs exactly this. |
| `make new-post TITLE="..."` | Create a post with the required front matter |
| `make prose` | Flag LLM-style writing in posts (warnings). `make prose POST=_posts/x.md` is strict for one post. |
| `make lint` / `build` / `links` / `test` | The individual steps of `make check` (`test` and `links` need a prior `build`) |

Requires Ruby (version in `.ruby-version`) and Node 22.

## Writing posts

**Before changing any post's wording or structure, use the `edit-post` skill**
(`.claude/skills/edit-post/SKILL.md`). It describes the author's voice and the
rules for editing: never invent experience, run every command, keep the URL.

- Files: `_posts/YYYY-MM-DD-lowercase-slug.md`. The slug becomes the URL
  (`/posts/<slug>/`), so **never rename an existing post**; it breaks links.
- Required front matter (enforced by `tools/check_posts.rb`):

  ```yaml
  ---
  layout: post
  title:  "Human title"
  date:   2025-06-08 00:00:00 +0800   # must match the filename date
  categories: [Linux, Filesystems]   # 1-2 entries; the 2nd is a sub-category
  description: >-
    50-200 characters. Used for home-page previews, search results and SEO.
  tags: [lowercase, hyphenated-tags]
  ---
  ```

- Categories must come from `CATEGORIES` in `tools/check_posts.rb`
  (Linux › Filesystems/Administration, Tools, Cloud › AWS/Networking,
  Engineering). Only add a new one when no existing category fits.
- Reuse existing tags where possible: `grep -h "^tags:" _posts/*.md | sort | uniq -c`.
- Images go in `assets/img/posts/<slug>/` and are referenced as
  `/assets/img/posts/<slug>/file.png`.

## Gotchas

- **`{{` and `{%` in post content are Liquid.** Go templates, Helm charts,
  GitHub Actions expressions and Jinja inside code blocks must be wrapped in
  `{% raw %}...{% endraw %}`, otherwise they silently render as empty text.
  `make build` fails on the resulting Liquid warning.
- **Overriding theme files:** to replace a file from the Chirpy gem, put a file
  at the same path. If the theme's version has front matter, yours needs front
  matter too, or both get written and Jekyll reports a conflict.
- **Encoding:** Ruby tools must run with UTF-8. The Makefile sets this; if you
  run `bundle exec` directly in a container with a C/POSIX locale, prefix it
  with `RUBYOPT=-Eutf-8`.
- **New top-level files** are published to the site unless listed under
  `exclude:` in `_config.yml`. Add tooling files there.
- `Gemfile.lock` and `package-lock.json` are committed; update them
  deliberately (`bundle update`, `npm update`) and run `make check` afterwards.

## Verifying a change visually

`make serve`, then drive http://127.0.0.1:4000 with Playwright
(`require('playwright')`). The smoke tests in `tests/smoke.spec.ts` show the
selectors that matter: `#post-list`, `#search-input`, `#mode-toggle`,
`#toc-wrapper`.
