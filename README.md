<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Ten <!-- omit from toc -->](#ten----omit-from-toc---)
  - [Plans <!-- omit from toc -->](#plans----omit-from-toc---)
  - [Introduction <!-- omit from toc -->](#introduction----omit-from-toc---)
  - [Summary](#summary)
  - [Content Files](#content-files)
    - [??? Things](#-things)
    - [File Formats](#file-formats)
      - [HTML Files](#html-files)
      - [Markdown Files](#markdown-files)
      - [XML Files](#xml-files)
      - [Other Files](#other-files)
    - [Special File Names](#special-file-names)
  - [Project JavaScript Customization](#project-javascript-customization)
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

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

# Ten <!-- omit from toc -->

Ten will be / is a static site generator / content management system / web framework solution. I created it because:

- Any current framework (Hugo, Zola, etc.) will eventually go the way of Jekyll
- It's easier to hack on and add bespoke functionality

## Plans <!-- omit from toc -->

- on watch mode:
  - it's VERY useful for debugging output
  - it felt slow and bad because i was using it with browser-sync to serve the generated contents
  - it should now be "re-added" (without browser-sync), and everything will make sense
- Blog RSS feed and fix tags/categories in dev server
- Be able to build only certain files/directory matching a glob
- later: Linter to always ensure trailing slash for local URLs

## Introduction <!-- omit from toc -->

- [Summary](#summary)
- [Content Files](#content-files)
  - [Supported Formats](#supported-formats)
    - [HTML Files](#html-files)
    - [Markdown Files](#markdown-files)
    - [XML Files](#xml-files)
- [Project JavaScript Customization](#project-javascript-customization)
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

Ten is a static site generator. Conventionally, it reads input files from `content/`; for each file, it is processed, then written to `build/`. When processing each file, it transforms both its path and content.

When walking the content directory, every file is associated with either a route or ignored. The name of a file can change it's route, or if it's ignored.

## Content Files

Content files are any files located in the content directory. Transformations are done to file paths in two cases:

1. If a file ends with `.md` (or similar) files, it is converted into a `.html` file.

- `/mathematics.md` -> `/mathematics.html`
- `/index.md` -> `/index.html`

2. If a file name (excluding file extensions) is the same as the directory name of it's parent directory, then that file is renamed to `index.html`.

- `/about/about.md` -> `/about/index.html`

This makes it easier to edit files in IDEs (unlike Next.js's `page.js`).

### ??? Things

**Run once and cached files**

- `.py`, `.js` files used in "markdown fence"

**services things**

- A route is dedicated to playing around with postgres and showing output
- Be able to manage postgres with docker/nix and make it "reproducable"

**other services**

- Excalidraw `.json` files

### Supported Formats

The following formats are supported:

#### HTML

These are processed with the templating engine [Handlebars](https://handlebarsjs.com).

#### Markdown

Markdown files support the following features:

- Syntax highlighting (via [Shiki](https://shiki.style))
- Emoji conversion
- KaTeX

#### XML

TODO: No special processing will be done

#### Other Files

- Handlebars

### Special File Names

Some file names are treated specially. (TODO: handle directory case)

- `*.ten.js`

These are ignored and processed as described in [JavaScript Customization](#javascript-customization)

- `_*`

These are treated as "draft" and only be published when serving the files with the development server.

- `*_`

These are ignored.

## Project JavaScript Customization

- `defaults`
- `transformUri()`
- `decideLayout()`
- `validateFrontmatter()`
- `handlebearsHelpers`
- `tenHelpers`

## Page JavaScript Customization

- `Meta()`
- `Header()`
- `GenerateSlugMapping()`
- `GenerateTemplateVariables()`

## Directory Structure

Nothing here is out of the ordinary.

### `build/`

Where output files are written to.

### `content/`

User-generated content. There are several variants:

#### `content/pages/`

Contains directories and files that each represent an individual page. For example, the directory `/pages/about` represents `/about/index.html` while the file `pages/index.xml` represents `/index.xml`.

#### `content/posts/`

Contains subdirectories with a dirname of either (1) a year (ex. `2005`) or (2) the value `drafts`. The subdirectories of those subdirectories represent an individual page (ex. `posts/2023/oppenheimer-movie-review`). Drafts are automatically shown when running the development server and automatically hidden when building the blog, unless indicated otherwise by the `--show-drafts` command-line flag.

#### `content/til/`

### `layouts/`

Handlebars templates that are applied to all pages and posts. Individual pages and posts can specify a particular template in the frontmatter using the `layout` property.

### `partials/`

Handlebars partials that can be used in any HTML file.

### `static/`

These assets are copied directly to the build directory without processing.

### Older Ideas

**Entrypoints**. Entrypoints were created to make it easier to approximate tracking dependencies of a page. For example, if `/math/theme.cls` changed, then probably `/math/slides.tex` should be regenerated as well. This breaks down too often, as it's not uncommon for files under a particular directory to be unrelated. An alternative to entrypoints was tracking dependencies of a page by parsing the page with either regular expressions or a laguage parser library. This wasn't chosen since it would mean adding regular expressions or traverse functions for each markup language. And, detection would not be posssible with more dynamic markup languages.
