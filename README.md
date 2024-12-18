# Sauerkraut <!-- omit from toc -->

My tool for building websites. See [philosophy](#philosophy) for details.

## Plans <!-- omit from toc -->

- re-add watch mode (to _build_ and _serve_)
- Add overlay to all pages to see info of some sort, what layout, dep tree, etc.
- instead of rewriting something like `mathematics/mathematics.html` to `mathematics/index.html`, create a redirect at `index.html` instead. Or, just fix the thing so it only rewrites content files (.md not .cards.json). Related: autogenerate index.html
- Blog RSS feed and fix tags/categories in dev server
- later: Linter to always ensure trailing slash for local URLs
- later: for each page autogenerate: references, backreferences, other meatdata, tags, etc.

## Introduction <!-- omit from toc -->

- [Philosophy](#philosophy)
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
  - [`static/`](#static)
- [Older Ideas](#older-ideas)

## Philosophy

Sauerkraut is meant to be a stable tool for building websites. It:

- Avoids using popular frameworks like [Next.js](https://nextjs.org) and [Astro](https://astro.build)
  - A tool that lasts for decades must detach from JavaScript framework boom-bust cycles
- Uses libraries that solve general problems with a focused, composable, small solution
  - When libraries are inevitably superseded, replacing them should take minutes

But, sauerkraut is meant to be module enough to allow for easy experimentation. It:

- Should easily integrate with [various knowledge tools](https://github.com/fox-lists/catalog-knowledge-tools)

## Summary

Sauerkraut is a static site generator. Conventionally, it recursively reads input files from `content/`. Then, it processes each file path and content. Finally, it writes the result path and content to `build/`.

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

#### JSX

These files are processed with [esbuild](https://github.com/evanw/esbuild). Typically, they use [Nano JSX](https://github.com/nanojsx/nano).

#### Markdown

These files are processed with the markdown parser [markdown-it](https://github.com/markdown-it/markdown-it).

Markdown files support the following features:

- Syntax highlighting (via [Shiki](https://shiki.style))
- Emoji conversion
- LaTeX with [KaTeX](https://katex.org)
- [Mermaid](https://mermaid.js.org) diagrams

### Special File Names

Special file modify behavior and are not processed. They include:

- `*.ten.js`

Described further in [JavaScript Customization](#website-javascript-customization)

- `_*`

These _directories_ are ignored.

- `*_`

These _directories_ are ignored.

## Website JavaScript Customization

This file potentially customizes the behavior of the whole website. To be recognized, its name must match `/ten.config.js`.

It can export:

- `defaults`
- `transformUri()`
- `decideLayout()`
- `validateFrontmatter()`
- `handlebearsHelpers`
- `tenHelpers`

## Page JavaScript Customization

This file potentially customizes the behavior of a single page. To be recognized, its name must match `/**/<adjacentPage>.ten.js`.

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

User-generated content.

### `static/`

These assets are copied directly to the build directory without processing.

### Older Ideas

**Entrypoints**. Entrypoints were created to make it easier to approximate tracking dependencies of a page. For example, if `/math/theme.cls` changed, then probably `/math/slides.tex` should be regenerated as well. This breaks down too often, as it's not uncommon for files under a particular directory to be unrelated. An alternative to entrypoints was tracking dependencies of a page by parsing the page with either regular expressions or a laguage parser library. This wasn't chosen since it would mean adding regular expressions or traverse functions for each markup language. And, detection would not be posssible with more dynamic markup languages.

**Templating Library**: A templating library was initially helpful when starting the project. However, there were some limitations. It's hard to debug since there are no "stack traces". Composing partials is either not possible or is not well-supported. Also, there is no typechecking, and both intellisense and syntax highlighting is deficient. I also don't like the nature of the "partials" and "layouts" directory. I don't like their names and that they are very small files. All of is why I will just use JavaScript, which can do all of these things.
