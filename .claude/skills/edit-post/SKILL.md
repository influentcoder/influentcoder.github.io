---
name: edit-post
description: Write, rewrite or edit a blog post in _posts/ in the author's own voice. Use for any change to post wording or structure, including removing LLM-style writing from existing posts.
---

# Editing posts in the author's voice

Several posts were rewritten by LLMs in 2025 and lost the author's voice.
The goal of any edit is a post that sounds like the author wrote it, not a
"more human" version of generic text. Follow every rule below.

## Hard rules

1. **Never invent experience.** No anecdotes, opinions, preferences, "at work
   we…", or "I always…" that the author has not told you. If a post needs them,
   ask the author (questions below). If you write a first-person line anyway,
   list it in the PR description under "For the author to check".
2. **Every command and output must be real.** Run each command and paste its
   actual output. If you can't run something (needs a cluster, cloud account,
   root), say so in the PR. Fix or remove examples that are wrong.
3. **Never rename a post file.** The filename is the URL. Titles can change.
4. **Check the history first:** `git log --follow -p -- _posts/<file>`. If an
   earlier version exists from before the 2025 rewrite, restore it and only
   fix typos and broken things (this was done for the GRUB and Kerberos posts).
5. `make check` must pass. It includes the prose check, which fails on any
   warning in any post; `make prose POST=_posts/<file>` checks one post.

## The author's voice

Taken from the posts the author wrote themselves
(`2023-12-19-reinstall-grub-arch-linux.md`,
`2023-11-12-walkthrough-setup-kerberos-linux.md`). Read one before editing.

- **First person, and says why the post exists.** "My motivation to write this
  article is for myself, to remember how to get out of this situation again if
  needs be, and to help other folks who might face the same issue."
- **Walks the reader through with "let's" and "we'll".** "Let's try to mount
  the first partition", "We'll then need to copy the keytab".
- **Plain, direct sentences.** Says what to do, then shows the command. No
  build-up, no restating.
- **Honest about uncertainty.** "hopefully Windows starts as usual", "depending
  on how you did it earlier, it might be different", "it seemed quite bad".
- **Shows how to figure things out, not just the answer.** The GRUB post
  explains how to tell which partition is root, rather than saying "mine was
  p5".
- **Small informal touches are fine and should be kept:** "and voila!",
  "if needs be", "kind of messed up". Don't "correct" them.
- Uses " - " or brackets, not em-dashes.

## Structure

- Headings: plain sentence case describing the content ("Identify the
  partitions"). No emoji, no bold, no numbering, no "Step N:" prefixes.
- No Abstract, Introduction, Methodology, Summary, Conclusion, Final thoughts,
  Key takeaways or Wrapping up sections. Start with why the post exists; stop
  when the content is done. A short "Additional resources" list is fine.
- No `---` separators between sections; headings already separate them.
- Bold only for a real warning (data loss, security). Not for emphasis.
- Prose for reasoning and explanations; lists only for things that really are
  lists (prompts to answer, files to edit, options).
- Shorter is better. Cut anything a reader of this blog already knows.
- The front matter `description` is shown under the title. Write it the way
  the author would introduce the post, ideally from the post's own first lines.

## Words and phrases to avoid

`tools/check_prose.rb` has the full list (delve, landscape, crucial,
seamless, robust, leverage, comprehensive, "it's important to note", "let's
dive in", "whether you're", "plays a key role", "in conclusion", and more).
Don't swap them for synonyms; rewrite the sentence plainly or delete it.

## Workflow for a post without an earlier draft

1. Read the post. Run `make prose POST=_posts/<file>` to see the patterns.
2. Fact-check: run every command, check every claim you can. Note bugs.
3. Ask the author a few short questions before rewriting, e.g.:
   - Why did you write this post? What were you working on at the time?
   - What do you actually use this for? Any real example you can share?
   - What tripped you up or surprised you?
   - Should it stay broad, or become a shorter "how I use it" post?
4. Rewrite using only the author's answers plus verified facts.
5. Run `make prose POST=_posts/<file>` (must be clean) and `make check`.
6. PR description: bugs found (with evidence), what changed, and the
   first-person lines for the author to confirm.

## Example

Before (2025 rewrite):

> You'll need to figure out which partition contains your root (`/`)
> filesystem. In my case:
> * `/dev/nvme0n1p5` is root (`/`)

After (the author's original, restored):

> `/dev/nvme0n1p7` is clearly identified as a swap partition, but for the
> other two, it might not be clear which one is what. […] Let's try to mount
> the first partition […] If you see something that looks like
> `bin boot dev ... proc run tmp ...`, then that's probably the root of the
> filesystem, so all good.
