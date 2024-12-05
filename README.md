# Ten <!-- omit from toc -->

Ten will be / is a static site generator / content management system / web framework solution. I created it because:

- I want my website code to last for decades
  - Frameworks like Hugo, Zola, etc. will eventually go the way of Jekyll
  - Migrating working code is a waste of time
- It's easier to implement bespoke features
  - I have a lot of cool ideas that use [knowledge tools](https://github.com/fox-lists/catalog-knowledge-tools)

## Plans <!-- omit from toc -->

- refactor global variables (FileQueue, etc.)
- re-add watch mode (to _build_ and _serve_)
- instead of rewriting something like `mathematics/mathematics.html` to `mathematics/index.html`, create a redirect at `index.html` instead. Or, just fix the thing so it only rewrites content files (.md not .cards.json). Related: autogenerate index.html
- Something similar to flashcards, but only for words. Word association.
- Blog RSS feed and fix tags/categories in dev server
- Be able to build only certain files/directory matching a glob
- later: Linter to always ensure trailing slash for local URLs

## Introduction <!-- omit from toc -->

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
    - [`content/pages/`](#contentpages)
    - [`content/posts/`](#contentposts)
    - [`content/til/`](#contenttil)
  - [`layouts/`](#layouts)
  - [`partials/`](#partials)
  - [`static/`](#static)
- [Older Ideas](#older-ideas)

## Summary

Ten is a static site generator. Conventionally, it recursively reads input files from `content/`. Then, it processes each file path and content. Finally, it writes the result path and content to `build/`.

## Content Files

Content files are any files located in the content directory that aren't [special](#special-file-names).

Transformations are done to file paths in two cases:

1. If a file ends with `.md` (or similar) files, it is converted into a `.html` file.

- `/mathematics.md` -> `/mathematics.html`
- `/index.md` -> `/index.html`

2. If a file name (excluding file extensions) is the same as the directory name of it's parent directory, then that file is renamed to `index.html`.

- `/about/about.md` -> `/about/index.html`

This makes it easier to edit files in IDEs (unlike Next.js's `page.js`).

### Supported Formats

The following formats are supported:

#### HTML, XML

These are processed with the templating engine [Handlebars](https://handlebarsjs.com).

Templates have access to the following variables:

- `Page` (layouts & partials, pages)
- `Title` (layouts & partials, pages)
- `Body` (layouts & partials)

#### Markdown

Markdown files support the following features:

- Syntax highlighting (via [Shiki](https://shiki.style))
- Emoji conversion
- KaTeX

### Special File Names

Special file modify behavior and are not processed. They include:

- `*.ten.js`

Described further in [JavaScript Customization](#website-javascript-customization)

- `_*`

These are ignored.

- `*_`

These are ignored.

## Website JavaScript Customization

This file potentially customizes the behavior of the whole website. To be recognized, its name must be `/ten.config.js`.

It can export:

- `defaults`
- `transformUri()`
- `decideLayout()`
- `validateFrontmatter()`
- `handlebearsHelpers`
- `tenHelpers`

## Page JavaScript Customization

This file potentially customizes the behavior of a single page. To be recognized, its name must match `/**/<adjacentFileName>.ten.js`.

It can export:

- `Meta()`
- `Head()`
- `GenerateSlugMapping()`
- `GenerateTemplateVariables()`

## Directory Structure

Nothing here is out of the ordinary.

### `build/`

Where output files are written to.

### `content/`

User-generated content. There are several variants:

### `layouts/`

Handlebars templates that are applied to all pages and posts. Individual pages and posts can specify a particular template in the frontmatter using the `layout` property.

### `partials/`

Handlebars partials that can be used in any HTML file.

### `static/`

These assets are copied directly to the build directory without processing.

### Older Ideas

**Entrypoints**. Entrypoints were created to make it easier to approximate tracking dependencies of a page. For example, if `/math/theme.cls` changed, then probably `/math/slides.tex` should be regenerated as well. This breaks down too often, as it's not uncommon for files under a particular directory to be unrelated. An alternative to entrypoints was tracking dependencies of a page by parsing the page with either regular expressions or a laguage parser library. This wasn't chosen since it would mean adding regular expressions or traverse functions for each markup language. And, detection would not be posssible with more dynamic markup languages.
