---
layout: post
title:  "Understanding Diagnostics in Neovim"
date:   2025-04-06 00:00:00 +0800
categories: [Tools]
description: >-
  Why inline diagnostics disappeared in Neovim 0.11, and how namespaces, virtual text and vim.diagnostic.config control what you see.
tags: [neovim, lsp, diagnostics]
---

## Problem

At some point, error and warning messages stopped appearing inline while
working in Neovim. The signs in the gutter were still visible, but the actual
messages were missing from the code. This setup used common plugins like
`nvim-lspconfig`, `nvim-cmp`, and `cmp-nvim-lsp`, and had recently been updated
to Neovim `0.11.0`. The cause could have been Neovim itself, a plugin, or a
configuration change.

After some investigation, it turned out the issue was due to a disabled option:
virtual_text in the diagnostics settings. Once re-enabled, the inline messages
returned.

This is due to the fact that Neovim 0.11 release changed the virtual text
handler from opt-out to opt-in:
https://gpanders.com/blog/whats-new-in-neovim-0-11/#virtual-text-handler-changed-from-opt-out-to-opt-in

## Understanding Namespaces

Namespaces in Neovim are used to isolate groups of diagnostics, highlights,
extmarks, and more. When working with diagnostics, it's common to create a
namespace to control a specific set of messages independently.

### Creating a Namespace

```lua
:lua =vim.api.nvim_create_namespace("my.namespace")
```

This returns a numeric ID that can be used in functions like
`vim.diagnostic.set`. The ID doesn't necessarily need to be stored, as it can
be retrieved later using the namespace name.

### Listing Namespaces

To inspect existing namespaces:

```lua
:lua =vim.api.nvim_get_namespaces()
```

This returns a table of name → ID mappings.

### Getting a Namespace ID by Name

There isn’t a built-in way to retrieve a namespace ID directly by name, but you
can do:

```lua
:lua =vim.api.nvim_get_namespaces()["my.namespace"]
```

## Sending and Displaying Diagnostics

Most Neovim users interact with diagnostics through the built-in LSP client.
When an LSP server detects a problem, it sends diagnostic messages to Neovim,
which then displays them. However, diagnostics can also be created manually
using the Lua API.

Here’s a minimal example of how to send a diagnostic programmatically:

```lua
vim.diagnostic.set(
  vim.api.nvim_get_namespaces()["my.namespace"],
  0, -- buffer number (0 = current buffer)
  {
    {
      lnum = 1, -- line number (0-based)
      end_lnum = 2, -- end line number (0-based)
      col = 0, -- column number (0-based)
      severity = vim.diagnostic.severity.WARN,
      message = "test diagnostic",
      source = "my-source"
    }
  }
)
```

This adds a diagnostic to the current buffer on line 2 (since line numbers are
0-based). The `severity` can be one of:

- `vim.diagnostic.severity.ERROR`
- `vim.diagnostic.severity.WARN`
- `vim.diagnostic.severity.INFO`
- `vim.diagnostic.severity.HINT`

By default, diagnostics from the LSP are handled automatically. But this
example shows that diagnostics are just data passed into Neovim, and the API
gives full control over how and when they appear.


## Customizing Diagnostic Display

Neovim provides flexible options for controlling how diagnostics appear. These
can be set globally or per-buffer.

The main display methods are:

- **Virtual text**: inline messages next to the code
- **Signs**: icons in the gutter
- **Underlines**: highlight under the affected text
- **Floating windows**: pop-up messages on hover

Here’s how to configure these options globally:

```lua
vim.diagnostic.config({
  virtual_text = true,  -- show inline messages
  signs = true,         -- show signs in the gutter
  underline = true,     -- underline problematic text
  update_in_insert = false, -- don't update diagnostics while typing
  severity_sort = true,     -- sort diagnostics by severity
})
```

Each option can also take a table for more fine-grained control. For example:

```lua
virtual_text = {
  prefix = "●",  -- can be a string or a function
  spacing = 2,
}
```

To disable all inline messages, set `virtual_text = false`:

```lua
vim.diagnostic.config({ virtual_text = false })
```

This is useful when the screen feels cluttered or when working in smaller
terminal windows.


## Useful Keybindings

### Show Diagnostics in a Floating Window

This shows diagnostics at the current cursor position:

```lua
vim.keymap.set("n", "<Leader>ds", vim.diagnostic.open_float, { desc = "Show diagnostic" })
```

The default mapping for this is `<C-W>d` or `<C-W><C-D>`.

### Go to Next or Previous Diagnostic

Navigate between diagnostics in the buffer:

```lua
vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, { desc = "Previous diagnostic" })
vim.keymap.set("n", "]d", vim.diagnostic.goto_next, { desc = "Next diagnostic" })
```

(Note that these are the default mappings already)

Also by default, `[D` and `]D` are used to go to the first and the last
diagnostic, respectively.

### Toggle Virtual Text (Inline Messages)

Sometimes it's useful to hide inline diagnostics temporarily:

```lua
local virtual_text_enabled = true

vim.keymap.set("n", "<leader>dv", function()
  vim.diagnostic.config({ virtual_text = not vim.diagnostic.config().virtual_text })
end, { desc = "Toggle diagnostics virtual text" })
```

Neovim’s diagnostics system is flexible and scriptable. When diagnostics don’t
behave as expected, the issue may be as simple as a config setting like
`virtual_text` being disabled.

Whether working with LSPs or writing custom tools, understanding diagnostics
makes Neovim easier to use and debug.

