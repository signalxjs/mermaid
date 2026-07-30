# @sigx/mermaid

[Mermaid](https://mermaid.js.org/) diagrams for [sigx](https://sigx.dev/).

- a `<Mermaid>` component for any sigx app
- drop-in ` ```mermaid ` fence support for [`@sigx/ssg`](https://sigx.dev/ssg/)
- diagrams follow the page's light/dark theme, re-rendering when it flips
- mermaid loads lazily — only on pages with a diagram, only once one is near the
  viewport

## Installation

```sh
pnpm add @sigx/mermaid mermaid
```

`mermaid` and `sigx` are **peer dependencies**; this package has no runtime
dependencies of its own. You control mermaid's version.

## Use with @sigx/ssg

```ts
// ssg.config.ts
import { defineSSGConfig } from '@sigx/ssg';
import { rehypeMermaid } from '@sigx/mermaid/ssg';

export default defineSSGConfig({
    markdown: {
        // Both lines are required. `skipLanguages` stops shiki from claiming
        // the fence; site rehype plugins run after shiki, so rehypeMermaid
        // then finds the raw <pre><code class="language-mermaid">.
        shiki: { skipLanguages: ['mermaid'] },
        rehypePlugins: [rehypeMermaid],
    },
    clientImports: ['@sigx/mermaid/styles', '@sigx/mermaid/client'],
});
```

Every other language still goes through shiki as usual.

````mdx
```mermaid title="Request flow"
sequenceDiagram
  Browser->>Server: GET /
  Server-->>Browser: HTML
```
````

The optional `title="…"` fence meta becomes a `<figcaption>` and the SVG's
accessible name.

### What lands in the HTML

```html
<figure class="sigx-mermaid" data-sigx-mermaid data-mermaid-title="Request flow">
  <pre class="sigx-mermaid-source"><code>sequenceDiagram…</code></pre>
  <figcaption class="sigx-mermaid-caption">Request flow</figcaption>
</figure>
```

No SVG — see [Why not build-time?](#why-not-build-time) below. On the client,
`@sigx/mermaid/client` inserts a `.sigx-mermaid-output` **sibling** holding the
SVG and hides the source `<pre>`. It never renders over the server markup, so
there is no hydration divergence, and a diagram that fails to parse keeps its
source visible with `data-mermaid-state="error"`.

`data-mermaid-state` moves `pending` → `ready` | `error`; style against it.

### Without the rehype plugin

The plugin is optional. `@sigx/mermaid/client` also claims a bare
`pre > code.language-mermaid`, wrapping it in the same figure at runtime, so
`skipLanguages` + `clientImports` alone is a working setup. What the plugin adds
is the caption, a reserved box that stops the page jumping when the SVG lands,
and markup that exists before JavaScript runs.

## Use as a component

```tsx
import { Mermaid } from '@sigx/mermaid';

<Mermaid code="graph TD; A-->B;" title="Flow" />
<Mermaid code={source} eager />
```

| Prop | Type | Description |
| --- | --- | --- |
| `code` | `string` | The diagram definition. Required. |
| `title` | `string` | Rendered as a `<figcaption>` and the SVG's accessible name. |
| `class` | `string` | Extra classes on the `<figure>`. |
| `options` | `MermaidOptions` | Per-instance overrides, merged over the global config. |
| `eager` | `boolean` | Render on mount instead of on scroll-into-view. Default `false`. |

## Configuration

```ts
// src/mermaid-config.ts
import { configureMermaid } from '@sigx/mermaid';

configureMermaid({
    themes: { light: 'neutral', dark: 'dark' },
    config: { flowchart: { curve: 'basis' } },
});
```

```ts
// ssg.config.ts — the config module must come BEFORE the client entry,
// which installs itself on import.
clientImports: ['./src/mermaid-config', '@sigx/mermaid/client'];
```

| Option | Default | Description |
| --- | --- | --- |
| `themes` | `{ light: 'default', dark: 'dark' }` | mermaid theme per colour scheme. |
| `securityLevel` | `'strict'` | Passed to mermaid. Raising it lets diagrams emit raw HTML and click handlers. |
| `config` | `{}` | Shallow-merged into `mermaid.initialize()`. |
| `resolveColorScheme` | — | Override colour-scheme detection entirely. |

### Theme detection

In order, first match wins:

1. an explicit `resolveColorScheme`
2. `data-theme` of exactly `light` / `dark` on `<html>`
3. the *computed* `color-scheme` — how named daisyUI themes like `night` or
   `cupcake` resolve
4. a `.dark` class on `<html>` (the Tailwind convention)
5. the page's actual background colour

Note what is **not** in that list: `prefers-color-scheme`. A page that hasn't
opted into dark mode renders light no matter what the OS prefers, so keying off
the OS puts a dark diagram on a white page. Reading the background answers the
question actually being asked — *is this diagram about to sit on something
dark?* — and it works whether the site themes itself with `data-theme`, a class,
or a bare `@media (prefers-color-scheme: dark)` block that declares no
`color-scheme`. A page with no background at all is canvas white, so: light.

If your page is dark in a way none of these can see, say so directly:

```ts
configureMermaid({ resolveColorScheme: () => (myStore.dark ? 'dark' : 'light') });
```

When the resolved theme changes, already-rendered diagrams re-render. Diagrams
that haven't drawn yet simply pick up the new theme when they do.

## Styling

`@sigx/mermaid/styles` is cosmetic — everything functional is done in JS with the
`hidden` attribute, so a site that skips the stylesheet still behaves correctly.
Override the custom properties on `.sigx-mermaid`:

`--sigx-mermaid-gap`, `--sigx-mermaid-radius`, `--sigx-mermaid-padding`,
`--sigx-mermaid-bg`, `--sigx-mermaid-border`, `--sigx-mermaid-muted`,
`--sigx-mermaid-error`, `--sigx-mermaid-min-height`.

## Caveats

**1. `clientImports` is ignored when your project has a custom client entry.**
`@sigx/ssg` skips the generated entry — and with it `clientImports` — when it
detects `src/main.tsx` or similar. Those projects must import the client module
themselves:

```ts
// src/main.tsx
import '@sigx/mermaid/styles';
import '@sigx/mermaid/client';
```

**2. mermaid is heavy to pre-bundle.** It pulls in d3, cytoscape and katex.
Exclude it from Vite's dependency optimizer to keep dev-server cold start fast —
it is dynamically imported either way, so it still gets its own chunk:

```ts
// vite.config.ts
export default defineConfig({
    optimizeDeps: { exclude: ['mermaid'] },
});
```

## Why not build-time?

Rendering to SVG during the build would mean zero client JavaScript, and it is
the obvious thing to want. mermaid can't do it without a browser: it measures
text with `getBBox`, which neither jsdom nor happy-dom implements faithfully.
The options are a headless Chromium (slow builds, a ~300 MB dependency) or
`isomorphic-mermaid` (svgdom-based, young, and approximate on font metrics).

Neither is a good default, so this package renders on the client and keeps the
cost honest: the source is always in the HTML, and mermaid is never loaded for a
diagram nobody scrolled to. A build-time prerenderer behind an optional peer
dependency is a plausible future addition.

## API

```ts
// @sigx/mermaid
export { Mermaid, type MermaidProps };
export { configureMermaid, getMermaidConfig, resetMermaidConfig };
export { loadMermaid, renderDiagram, resolveColorScheme, resolveTheme, watchTheme };
export type { MermaidOptions, MermaidThemeName, MermaidThemes, RenderResult };

// @sigx/mermaid/client   — installs on import
export { installMermaid, uninstallMermaid, type MermaidClientOptions };

// @sigx/mermaid/ssg
export { rehypeMermaid, mermaidThemeContribution, type RehypeMermaidOptions };
```

## License

MIT
