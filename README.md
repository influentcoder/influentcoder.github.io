# influentcoder.com

Source for [influentcoder.com](https://influentcoder.com), a tech blog for
software developers, built with [Astro](https://astro.build/) and the
[Cactus](https://github.com/chrismwilliams/astro-theme-cactus) theme.

```sh
make install    # npm dependencies + test browser
make serve      # http://127.0.0.1:4321 with live reload
make check      # type check, prose check, build, link check, browser tests (what CI runs)
make new-post TITLE="My new post"
```

Posts are in `content/posts/`. No local Node? `make serve-container` runs the
dev server in a Node container (Podman by default; `CONTAINER=docker` to
switch).

Pushes to `main` deploy to GitHub Pages. See [CLAUDE.md](CLAUDE.md) for post
conventions and gotchas. The theme is MIT-licensed, see
[THEME-LICENSE](THEME-LICENSE).
