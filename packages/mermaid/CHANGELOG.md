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
    client-side navigation are picked up.
  - `@sigx/mermaid/ssg` — `rehypeMermaid`, which turns a mermaid fence into an
    accessible `<figure>` shell, lifting `title="…"` fence meta into a
    `<figcaption>`.
  - `@sigx/mermaid/styles` — cosmetic stylesheet; nothing functional depends on it.
- Light/dark support: diagrams re-render when the resolved theme changes.
  Detection order is `resolveColorScheme` → `data-theme` → computed
  `color-scheme` → `.dark` class → `prefers-color-scheme`.
- `configureMermaid()` for global themes, `securityLevel` (default `'strict'`)
  and arbitrary mermaid config.

[Unreleased]: https://github.com/signalxjs/mermaid/commits/main
