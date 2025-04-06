# Sauerkraut <!-- omit from toc -->

My tool for building websites. See [philosophy](#philosophy) for details.

## Plans <!-- omit from toc -->

- do not rewrite mathematics/mathematics.cards.json to index.html
- file.cards.json should generate file-cards.html
- Autogenerate index.html?
- "Daily/", etc. categories?
- Blog RSS feed and fix tags/categories in dev server
- later: Linter to always ensure trailing slash for local URLs
- later: for each page autogenerate: references, backreferences, other meatdata,
  tags, etc.
- Some interactive apps should have a "freeze" button. to save output, like from
  a command line. SSR or render caches this, and anything with side-effects
  cannot be ran unless unfrozen

## Introduction <!-- omit from toc -->

- [Philosophy](#philosophy)
- [Usage](#usage)
- [Summary](#summary)
- [Content Files](#content-files)
  - [Supported Formats](#supported-formats)
    - [HTML Files](#html-files)
    - [Markdown Files](#markdown-files)
  - [Special File Names](#special-file-names)
- [Website JavaScript Customization](#website-javascript-customization)
- [Page JavaScript Customization](#page-javascript-customization)
- [Directory Structure](#directory-structure)
  - [`build/`](#build)
  - [`content/`](#content)
  - [`static/`](#static)
- [Older Ideas](#older-ideas)

## Philosophy

Sauerkraut is my tool for building websites. It:

- Avoids using popular meta-frameworks like [Next.js](https://nextjs.org) and
  [Astro](https://astro.build)
  - To detatch from JavaScript framework boom-bust cycles
- Uses libraries that solve general problems with a focused, composable, small
  solution
  - When libraries are inevitably superseded, replacing them should take minutes
  - For example, when serving minature apps, I use
    [esbuild](https://esbuild.github.io) & "manually" do SSR instead of using a
    [Vite](https://vite.dev)-based framework
  - For example, when serving content, I "AOT" bundle necessary libraries with
    [Rollup](https://rollupjs.org) and use them within `<script type="module">`
    tags
- Integrates with popular tools like [KaTeX](https://katex.org) and
  [Mermaid](https://mermaid.js.org)
  - See a full list under [Supported Formats](#supported-formats)
  - Later, more integrations will be implemented
    [from this list](https://github.com/fox-lists/catalog-knowledge-tools)

## Usage

In a new directory,

```bash
pnpm init
pnpm install sauerkraut
mkdir -p ./content
printf '%s\n' '# Hello, World!' > ./content/index.md
./node_modules/.bin/sauerkraut
```

## Summary

Sauerkraut is a static site generator. Conventionally, it recursively reads
input files from `content/`. Then, it processes each file path and content.
Finally, it writes the result path and content to `build/`.

## Content Files

Content files are any files located in the content directory that aren't
[special files](#special-file-names).

Transformations are done by default to file paths in two cases:

1. If a file ends with `.md` (or similar) files, it is converted into a `.html`
   file.

- `/mathematics.md` -> `/mathematics.html`
- `/index.md` -> `/index.html`

2. If a file name (excluding file extensions) is the same as the directory name
   of it's parent directory, then that file is renamed to `index.html`.

- `/about/about.md` -> `/about/index.html`

This makes it easier to edit files in IDEs (unlike Next.js's `page.js`).

### Supported Formats

The following formats are supported:

#### JSX

These files are processed with [esbuild](https://github.com/evanw/esbuild).
Typically, they use [Nano JSX](https://github.com/nanojsx/nano).

#### HTML

These files are automatically given the proper HTML boilerplate.

#### Markdown

These files are processed with the markdown parser
[markdown-it](https://github.com/markdown-it/markdown-it).

Markdown files support the following features:

- Syntax highlighting (via [Shiki](https://shiki.style))
- Emoji conversion
- LaTeX with [KaTeX](https://katex.org)
- [Mermaid](https://mermaid.js.org) diagrams

### Special File Names

Special files modify behavior and are not processed. They include:

- `*.sk.js`

Described further in
[JavaScript Customization](#website-javascript-customization)

Ignored files are ignored. They include:

- `_*/`
- `*_/`
- `.git/`
- `.obsidian/`
- `node_modules/`

## Website JavaScript Customization

This file potentially customizes the behavior of the whole website. To be
recognized, its name must match `/sk.config.js`.

It can export:

- `title`
- `rootDir`
- `contentDir`
- `staticDir`
- `outputDir`
- `transformUri()`
- `validateFrontmatter()`
- `createHtml()`

## Page JavaScript Customization

This file potentially customizes the behavior of a single page. To be
recognized, its name must match `/**/<adjacentPage>.sk.js`.

It can export:

- `Meta()`
- `Head()`
- `GenerateSlugMapping()`
- `GenerateTemplateVariables()`

## Directory Structure

### `build/`

Where output files are written to.

### `content/`

These files are processed and written to the build directory.

### `static/`

These files are copied directly to the build directory without processing.

### Older Ideas

**Entrypoints**. Entrypoints were created to make it easier to approximate
tracking dependencies of a page. For example, if `/math/theme.cls` changed, then
probably `/math/slides.tex` should be regenerated as well. This breaks down too
often, as it's not uncommon for files under a particular directory to be
unrelated. An alternative to entrypoints was tracking dependencies of a page by
parsing the page with either regular expressions or a laguage parser library.
This wasn't chosen since it would mean adding regular expressions or traverse
functions for each markup language. And, detection would not be posssible with
more dynamic markup languages.
