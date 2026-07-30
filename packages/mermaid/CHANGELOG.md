# Changelog

All notable changes to `@sigx/mermaid` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release. Mermaid diagrams for sigx, in four entry points:
  - `@sigx/mermaid` — the `<Mermaid>` component plus the render primitives
    (`renderDiagram`, `loadMermaid`, `resolveTheme`, `watchTheme`).
  - `@sigx/mermaid/client` — installs on import and progressively enhances
    ` ```mermaid ` fences: lazy render on `IntersectionObserver`, SVG inserted as
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
- `configureMermaid()` for global themes, `securityLevel` (default `'strict'`)
  and arbitrary mermaid config.
- Per-scheme theming: each scheme takes a mermaid theme name or
  `{ theme, variables }`, so light and dark can carry different palettes.
  `variables` may be a function, evaluated at render time, which is how
  diagrams follow CSS custom properties through a daisyUI/Tailwind theme swap.
  `themeVariables` merges rather than replaces at every level, so two callers
  each setting one colour no longer erase each other.

[Unreleased]: https://github.com/signalxjs/mermaid/commits/main
