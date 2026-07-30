# @sigx/mermaid example

A minimal [`@sigx/ssg`](https://sigx.dev/ssg/) site with diagrams, and the
fixture for `packages/mermaid/src/__tests__/example-e2e.test.ts`.

```sh
pnpm build                                        # required — the example resolves
                                                  # @sigx/mermaid through dist
pnpm --filter @sigx-examples/mermaid-basic dev
pnpm --filter @sigx-examples/mermaid-basic build:site
```

What it covers:

- `src/pages/index.mdx` — a flowchart with a `title=` caption, a sequence
  diagram, and a `.ts` fence that shiki still owns
- `src/pages/second.mdx` — a diagram reached by client-side navigation (the case
  the enhancer's `MutationObserver` exists for), plus an intentionally invalid
  diagram that must degrade to visible source
- `ssg.config.ts` — the whole integration: `shiki.skipLanguages`,
  `rehypePlugins`, `clientImports`
- `vite.config.ts` — `optimizeDeps.exclude: ['mermaid']`

If you change these pages, keep the e2e assertions in sync.
