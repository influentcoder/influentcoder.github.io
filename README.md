# influentcoder.com

Source for [influentcoder.com](https://influentcoder.com), a tech blog for
software developers, built with Jekyll and the Chirpy theme.

```sh
make install    # gems + test runner
make serve      # http://127.0.0.1:4000 with live rebuild
make check      # lint, build, link check and browser tests (what CI runs)
make new-post TITLE="My new post"
```

No local Ruby? `make serve-container` runs the dev server in a Ruby container
(Podman by default; `CONTAINER=docker` to switch).

Pushes to `main` deploy to GitHub Pages. See [CLAUDE.md](CLAUDE.md) for post
conventions and gotchas.
