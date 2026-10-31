# InfluentCoder blog

Personal tech blog at https://influentcoder.com. Built with
[Astro](https://docs.astro.build/) and the
[Cactus](https://github.com/chrismwilliams/astro-theme-cactus) theme (8.3.0,
MIT, see `THEME-LICENSE`; its code lives in `src/` and is ours to change), and
deployed to GitHub Pages by `.github/workflows/pages-deploy.yml` on every push
to `main`.

## Commands

Everything goes through `make` (run `make help` for the list):

| Command | What it does |
|---|---|
| `make install` | Install npm dependencies and the Playwright browser |
| `make serve` | Dev server with live reload at http://127.0.0.1:4321 |
| `make check` | **Run before every push.** Type check and front matter, Envoy excerpts, prose check, production build, link check, browser tests. CI runs exactly this. |
| `make new-post TITLE="..."` | Create a post with the required front matter |
| `make prose` | Fail on LLM-style writing in any post (`POST=content/posts/x.md` for one post) |
| `make lint` / `prose` / `build` / `links` / `test` | The individual steps of `make check` (`links` and `test` need a prior `build`) |
| `make envoy-examples` | Validate the Envoy post's configs with Envoy in Docker (CI runs it) |

Requires Node (version in `.nvmrc`). No Ruby.

## Layout

- `content/posts/<slug>.md`: posts. The file name is the URL (`/posts/<slug>/`).
  A post with images is a folder: `content/posts/<slug>/index.md` plus the
  images, referenced relatively (`![alt](./diagram.png)`) so Astro optimizes them.
- `content/notes/`: short notes (`/notes/`), and `content/tags/<tag>.md`:
  optional title/description for a tag page. Both are empty for now.
- `src/content.config.ts`: the front matter schema. It's where the post rules
  are enforced (`make lint` / `astro check` and the build fail on violations).
- `src/site.config.ts`: site title, description, menu, code block themes.
- `src/pages/`: home, about, posts, tags, notes, RSS, social images.
- `tools/`: the checks behind `make` (prose, Envoy excerpts, links, new post,
  a static server for the tests).

## Writing posts

**Before changing any post's wording or structure, use the `edit-post` skill**
(`.claude/skills/edit-post/SKILL.md`). It describes the author's voice and the
rules for editing: never invent experience, run every command, keep the URL.

- **Never rename an existing post** (file or folder): it changes the URL.
- Front matter (enforced by `src/content.config.ts`):

  ```yaml
  ---
  title: "Human title"            # up to 100 characters
  description: >-
    50-200 characters. Shown under the title, in previews and search results.
  publishDate: 2025-06-08
  tags: [linux, filesystems]      # lowercase-hyphenated, at least one
  ---
  ```

- Tags replace the old categories. Start with one of the broad tags (`linux`,
  `tools`, `cloud`, `engineering`), then add specific ones. Reuse existing
  tags: `grep -h "^tags:" -r content/posts | sort | uniq -c`.
- Every post must pass the prose check (`tools/check-prose.mjs`): no emoji, bold
  or numbered headings, no Abstract/Conclusion-style sections, at most 5 bold
  spans and 3 em-dashes, no stock LLM phrases. If a rule gets in the way of
  something the author really wants to write, change the rule in that file
  rather than working around it.
- Code blocks use [Expressive Code](https://expressive-code.com/): add a file
  name with ```` ```c title="walk.c" ````. Callouts use admonitions:
  `:::note`, `:::tip`, `:::important`, `:::caution`, `:::warning` … `:::`.

## Gotchas

- **Social images are cached.** Post preview images (`/og-image/<slug>.png`)
  are cached in `node_modules/.astro/og-images`, keyed on title and date only.
  After changing `src/pages/og-image/_ogMarkup.ts`, run `make clean`. CI always
  starts without the cache.
- **`astro preview` runs in the background** when Astro detects an AI agent,
  which breaks Playwright's server handling. The tests therefore serve `dist/`
  with `tools/serve-dist.mjs`. To look at the built site yourself, use
  `node tools/serve-dist.mjs 4321` (or `make serve` for the dev server).
- **Expected build warnings:** `The collection "note" does not exist or is
  empty` and the same for `"tag"`, until there is at least one note and one tag
  description. Anything else in the build output is worth a look.
- `package-lock.json` is committed; update dependencies deliberately
  (`npm update`) and run `make check` afterwards.

## Verifying a change visually

`make build`, then `node tools/serve-dist.mjs 4321` and drive
http://127.0.0.1:4321 with Playwright (`require('playwright')`). The smoke
tests in `tests/smoke.spec.ts` show the selectors that matter: post links
(`main a.cactus-link`), search (`#search`, then `pagefind-modal input`), the
theme switch (`theme-toggle button`), and the table of contents.
