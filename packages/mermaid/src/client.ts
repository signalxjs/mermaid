/**
 * Progressive enhancement for mermaid code fences on a statically-rendered
 * page. Import for side effects — it installs itself:
 *
 * ```ts
 * // ssg.config.ts
 * clientImports: ['@sigx/mermaid/styles', '@sigx/mermaid/client']
 * ```
 *
 * The rules this follows are the ones `@sigx/ssg` enforces for every enhancer
 * (see `installCodeCopy` in `@sigx/ssg`'s client, and the comment above the
 * live-preview markup in its shiki transformer):
 *
 *  - **Never `render()` over or wipe the SSR subtree.** Rendering a framework
 *    tree on top of server markup is what caused duplicated widgets in
 *    signalxjs/live-code#34 and hydration self-heal remounts under core 0.6+.
 *    The SVG is *inserted as a sibling*; the original `<pre>` is only hidden.
 *  - **Idempotent.** A module-level flag guards install; a `WeakSet` guards
 *    per-element claims. Installing twice yields one SVG, not two.
 *  - **Degrade visibly.** A diagram that fails to parse leaves its source on
 *    the page with `data-mermaid-state="error"`, never a blank box.
 */

import { configureMermaid, getMermaidConfig, type MermaidOptions } from './config';
import { renderDiagram, watchTheme } from './render';

export interface MermaidClientOptions {
    /** Where to look for diagrams. @default document */
    root?: ParentNode;
    /**
     * How far outside the viewport to start rendering.
     * @default '200px'
     */
    rootMargin?: string;
}

/** Selector for shells emitted by `rehypeMermaid`. */
const FIGURE_SELECTOR = '[data-sigx-mermaid]';
/** Selector for bare fences — the no-rehype-plugin path. */
const BARE_SELECTOR = 'pre > code.language-mermaid';

/** Figures already claimed by an observer, so a re-scan never doubles up. */
let claimed = new WeakSet<Element>();

/** Rendered diagrams, kept so a light/dark toggle can re-render them. */
const rendered = new Map<HTMLElement, { source: string; output: HTMLElement }>();

/** Disposer for the currently-installed enhancer, if any. */
let activeDispose: (() => void) | null = null;

function isElement(node: Node): node is Element {
    return node.nodeType === 1;
}

/**
 * Normalize either supported shape into a `<figure data-sigx-mermaid>` whose
 * first child is the source `<pre>`. Bare fences get wrapped in place — the
 * `<pre>` itself is moved, never re-created, so nothing that already points at
 * it goes stale.
 */
function toFigure(node: Element): HTMLElement | null {
    // `closest` — not `matches` — because the node may be the `language-mermaid`
    // `<code>` of a fence this function already wrapped. Wrapping mutates the
    // DOM, which wakes the SPA MutationObserver, which re-scans and finds that
    // same `<code>`: without this check each wrap schedules the next one and
    // the page grows nested figures forever.
    const existing = node.closest<HTMLElement>(FIGURE_SELECTOR);
    if (existing) return existing;

    // node is the <code>; its parent is the <pre> we want to wrap.
    const pre = node.parentElement;
    if (!pre || pre.tagName !== 'PRE') return null;

    const figure = document.createElement('figure');
    figure.className = 'sigx-mermaid';
    figure.setAttribute('data-sigx-mermaid', '');
    pre.replaceWith(figure);
    pre.classList.add('sigx-mermaid-source');
    figure.appendChild(pre);
    return figure;
}

function sourceOf(figure: HTMLElement): string {
    const pre = figure.querySelector('.sigx-mermaid-source, pre');
    return (pre?.textContent ?? '').trim();
}

async function renderInto(figure: HTMLElement, source: string): Promise<void> {
    figure.setAttribute('data-mermaid-state', 'pending');

    let output = figure.querySelector<HTMLElement>('.sigx-mermaid-output');
    if (!output) {
        output = document.createElement('div');
        output.className = 'sigx-mermaid-output';
        const pre = figure.querySelector('.sigx-mermaid-source, pre');
        if (pre) pre.after(output);
        else figure.prepend(output);
    }

    try {
        const { svg, bindFunctions } = await renderDiagram(source);
        output.innerHTML = svg;
        bindFunctions?.(output);

        const title = figure.getAttribute('data-mermaid-title');
        if (title) {
            output.setAttribute('role', 'img');
            output.setAttribute('aria-label', title);
        }

        // `hidden` rather than a CSS rule: the source leaves the accessibility
        // tree too, and it works even if the stylesheet was never imported.
        const pre = figure.querySelector<HTMLElement>('.sigx-mermaid-source, pre');
        if (pre) pre.hidden = true;

        figure.setAttribute('data-mermaid-state', 'ready');
        rendered.set(figure, { source, output });
    } catch (error) {
        // Leave the source visible — a readable diagram definition beats an
        // empty frame, and the message names the fence for the author.
        const pre = figure.querySelector<HTMLElement>('.sigx-mermaid-source, pre');
        if (pre) pre.hidden = false;
        output.textContent = error instanceof Error ? error.message : String(error);
        figure.setAttribute('data-mermaid-state', 'error');
        rendered.delete(figure);
        console.error('[@sigx/mermaid] failed to render diagram:', error);
    }
}

/**
 * Install the enhancer. Safe to call repeatedly; only the first call does
 * anything. Returns a disposer that disconnects every observer — subsequent
 * installs start clean.
 */
export function installMermaid(options: MermaidClientOptions = {}): () => void {
    if (typeof document === 'undefined') return () => {};
    if (activeDispose) return activeDispose;

    const root = options.root ?? document;
    const rootMargin = options.rootMargin ?? '200px';

    // No IntersectionObserver (old browser, or a test DOM): render eagerly
    // rather than not at all.
    const lazy = typeof IntersectionObserver === 'function';

    const io = lazy
        ? new IntersectionObserver(
              (entries) => {
                  for (const entry of entries) {
                      if (!entry.isIntersecting) continue;
                      const figure = entry.target as HTMLElement;
                      io!.unobserve(figure);
                      void renderInto(figure, sourceOf(figure));
                  }
              },
              { rootMargin }
          )
        : null;

    function scan(within: ParentNode = root): void {
        const candidates = [
            ...within.querySelectorAll(FIGURE_SELECTOR),
            ...within.querySelectorAll(BARE_SELECTOR),
        ];
        for (const candidate of candidates) {
            const figure = toFigure(candidate);
            if (!figure || claimed.has(figure)) continue;
            claimed.add(figure);
            if (io) io.observe(figure);
            else void renderInto(figure, sourceOf(figure));
        }
    }

    // --- SPA navigation ---------------------------------------------------
    // @sigx/ssg swaps page content client-side and dispatches no navigation
    // event, so there is nothing to listen for — watch the app subtree instead.
    // `claimed` makes the re-scan idempotent, including on back-navigation.
    const appRoot = (root instanceof Document ? root : document).querySelector('#app') ?? document.body;
    const mo = new MutationObserver((records) => {
        for (const record of records) {
            for (const node of record.addedNodes) {
                if (!isElement(node)) continue;
                if (node.matches(FIGURE_SELECTOR) || node.matches(BARE_SELECTOR)) scan(node.parentNode ?? node);
                else scan(node);
            }
        }
    });
    if (appRoot) mo.observe(appRoot, { childList: true, subtree: true });

    // --- Theme changes ----------------------------------------------------
    // Re-render everything already on screen when the palette flips.
    const unwatchTheme = watchTheme(() => {
        for (const [figure, entry] of rendered) {
            // Pages left behind by an SPA navigation are detached; drop them
            // instead of rendering into a tree nobody can see.
            if (!figure.isConnected) {
                rendered.delete(figure);
                continue;
            }
            void renderInto(figure, entry.source);
        }
    });

    scan();

    activeDispose = () => {
        io?.disconnect();
        mo.disconnect();
        unwatchTheme();
        rendered.clear();
        // WeakSet has no `clear()` — swap it out so a fresh install re-claims
        // the figures still on the page.
        claimed = new WeakSet<Element>();
        activeDispose = null;
    };
    return activeDispose;
}

/**
 * Tear down the installed enhancer, whether it was installed explicitly or by
 * importing this module. A no-op if nothing is installed.
 */
export function uninstallMermaid(): void {
    activeDispose?.();
}

// Auto-install, matching `@sigx/live-code/client`. A site that needs options
// calls `configureMermaid()` from a module imported *before* this one.
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => installMermaid(), { once: true });
    } else {
        installMermaid();
    }
}

export { configureMermaid, getMermaidConfig, type MermaidOptions };
