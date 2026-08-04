# Changelog

All notable changes to `@sigx/mermaid` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Builds against sigx core **0.15** (signalxjs/core 0.15.1): the catalog moves
  `sigx` / `@sigx/vite` / `@sigx/server-renderer` to `^0.15.0`, so the
  published `sigx` peer range becomes `^0.15.0`. Sibling pins move with it —
  `@sigx/router` `^0.12.0`, `@sigx/ssg` `^0.21.0` (examples-only
  dependencies). No source change in the package itself; the example layout
  adopts core 0.15's optional slot accessor (`slots.default?.()`).

## [0.2.0] - 2026-08-03

### Added

- `remarkMermaid` on the `@sigx/mermaid/ssg` entry — a remark plugin that
  claims ```` ```mermaid ```` fences on the markdown tree, before HTML
  conversion, so nothing downstream of it ever sees the fence and no other
  pipeline configuration is needed. Same options as `rehypeMermaid`
  (`language`, `className`) and the identical emitted `<figure>` shell;
  nothing changes for `@sigx/mermaid/client` or the stylesheet.

  ```ts
  // ssg.config.ts
  import { remarkMermaid } from '@sigx/mermaid/ssg';

  markdown: {
      remarkPlugins: [remarkMermaid],
  },
  ```

  `rehypeMermaid` is unchanged and remains available; it runs on the HTML tree
  and claims whatever `<pre><code class="language-mermaid">` is still present
  when it runs.

### Changed

- The figure shell's source block is now a bare
  `<pre class="sigx-mermaid-source">` with no inner `<code>` — everywhere it is
  emitted (`<Mermaid>`, `remarkMermaid`, `rehypeMermaid`). The shell must not
  look like a markdown fence (`pre > code`), or fence tooling running later in
  the same pipeline mistakes the embedded source for a code block and claims
  it out of the figure. Styling hooks are unchanged (`.sigx-mermaid-source`);
  only CSS targeting the removed inner `code` element needs updating.
- `mermaidThemeContribution` now contributes `markdown.remarkPlugins` instead
  of `markdown.rehypePlugins`, which makes it genuinely drop-in for a theme:
  previously the rehype path additionally required site-level pipeline
  configuration that a `ThemeConfig` cannot carry.
- Documentation no longer references any specific syntax highlighter. Each
  plugin documents its own contract; how a site's pipeline treats fences
  before the HTML stage belongs to that pipeline's documentation.

### Fixed

- The documented Vite advice now tells the dependency optimizer to **include**
  mermaid (`optimizeDeps.include: ['mermaid']`) instead of excluding it.
  mermaid is imported lazily, so the dev server's dependency scanner never
  discovers it, and un-optimized its CJS dependencies (dayjs) are served raw
  and fail to load as ES modules — with the previous advice every diagram
  errored under `vite dev` ([#14]). Verified against `@sigx/ssg` 0.20.0: the
  example site renders diagrams under the dev server, through client-side
  navigation, with the invalid-diagram fence degrading to visible source.

[#14]: https://github.com/signalxjs/mermaid/issues/14

## [0.1.0] - 2026-07-31

### Added

- Initial release. Mermaid diagrams for sigx, in four entry points:
  - `@sigx/mermaid` — the `<Mermaid>` component plus the render primitives
    (`renderDiagram`, `loadMermaid`, `resolveTheme`, `watchTheme`).
  - `@sigx/mermaid/client` — installs on import and progressively enhances
    ```` ```mermaid ```` fences: lazy render on `IntersectionObserver`, SVG inserted as
    a sibling of the source `<pre>` (never over it), source left visible on a
    parse error, and a `MutationObserver` so diagrams added by `@sigx/ssg`'s
    client-side navigation are picked up — including ones the router patched
    in place, where the `<figure>` element is re-used and only its text
    changes, which is why the enhancer keys on the diagram source and not on
    element identity.
  - `@sigx/mermaid/ssg` — `rehypeMermaid`, which turns a mermaid fence into an
    accessible `<figure>` shell, lifting `title="…"` fence meta into a
    `<figcaption>`.
  - `@sigx/mermaid/styles` — cosmetic stylesheet; nothing functional depends on it.
- Light/dark support: diagrams re-render when the resolved theme changes.
  Detection order is `resolveColorScheme` → `data-theme` → computed
  `color-scheme` → `.dark` class → the page's background luminance.
  `prefers-color-scheme` is deliberately **not** consulted: a page that has not
  opted into dark mode renders light whatever the OS prefers, and keying off the
  OS put mermaid's dark theme (black nodes) on a white page.
- `<Mermaid>` accepts and forwards host attributes (`id`, `class`, `style`,
  `data-*`, `aria-*`, event handlers) onto the `<figure>`, with `class`
  composed rather than replaced. `title` stays the caption prop and is not
  forwarded. Props are declared with `Define.WithAttrs` / `Define.Prop`.
- `configureMermaid()` for global themes, `securityLevel` (default `'strict'`)
  and arbitrary mermaid config.
- Per-scheme theming: each scheme takes a mermaid theme name or
  `{ theme, variables }`, so light and dark can carry different palettes.
  `variables` may be a function, evaluated at render time, which is how
  diagrams follow CSS custom properties through a daisyUI/Tailwind theme swap.
  `themeVariables` merges rather than replaces at every level, so two callers
  each setting one colour no longer erase each other.
- `edgeLabelBackground` defaults to the page's background colour. mermaid
  hardcodes a light grey in every built-in theme including the dark ones, so an
  edge label otherwise lands as a highlighter smear across a dark diagram. It
  sits at the bottom of the precedence chain, so any explicit value wins, and
  it is skipped entirely when the page paints no background.

[Unreleased]: https://github.com/signalxjs/mermaid/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/signalxjs/mermaid/releases/tag/v0.2.0
[0.1.0]: https://github.com/signalxjs/mermaid/releases/tag/v0.1.0
