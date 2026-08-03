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
 * (see `installCodeCopy` in `@sigx/ssg`'s client):
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
    /**
     * Where to look for diagrams — both for the initial scan and for the
     * observer that catches diagrams added later. Diagrams outside it are left
     * alone. Defaults to the whole document, in which case the observer
     * narrows to `#app` (falling back to `<body>`).
     */
    root?: ParentNode;
    /**
     * How far outside the viewport to start rendering.
     * @default '200px'
     */
    rootMargin?: string;
}

/** Selector for shells emitted by `remarkMermaid` / `rehypeMermaid`. */
const FIGURE_SELECTOR = '[data-sigx-mermaid]';
/** Selector for bare fences — the no-plugin path. */
const BARE_SELECTOR = 'pre > code.language-mermaid';

/** Figures already claimed by an observer, so a re-scan never doubles up. */
let claimed = new WeakSet<Element>();

/**
 * The source of the most recent render *request* per figure.
 *
 * Element identity is not enough to decide whether a figure is up to date.
 * sigx patches the DOM in place across a client-side navigation: the `<figure>`
 * elements of the outgoing page are reused for the incoming one, same objects
 * with new text inside. Keyed only on identity, the enhancer sees "already
 * claimed" and leaves the previous page's SVG sitting above the new page's
 * source. Comparing the source catches that; `@sigx/live-code` keeps a `sig`
 * field for the same reason.
 */
let lastRequested = new WeakMap<HTMLElement, string>();

/** Rendered diagrams, kept so a light/dark toggle can re-render them. */
const rendered = new Map<HTMLElement, { source: string; output: HTMLElement }>();

/** Disposer for the currently-installed enhancer, if any. */
let activeDispose: (() => void) | null = null;

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
    // Record before awaiting, so a re-scan mid-render doesn't queue a duplicate.
    lastRequested.set(figure, source);
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
            if (!figure) continue;

            if (!claimed.has(figure)) {
                claimed.add(figure);
                if (io) io.observe(figure);
                else void renderInto(figure, sourceOf(figure));
                continue;
            }

            // Already claimed — but a navigation may have re-used this very
            // element for a different diagram. Only the source can tell.
            const source = sourceOf(figure);
            if (lastRequested.has(figure) && lastRequested.get(figure) !== source) {
                void renderInto(figure, source);
            }
        }
    }

    // --- SPA navigation ---------------------------------------------------
    // @sigx/ssg swaps page content client-side and dispatches no navigation
    // event, so there is nothing to listen for — watch the app subtree instead.
    //
    // `characterData` matters as much as `childList` here: patching a reused
    // figure rewrites the text inside its <code>, which is a characterData
    // mutation and nothing else. Without it a navigation between two pages
    // whose layouts match can go completely unnoticed.
    //
    // Batched into a frame and re-scanning wholesale, because a patch arrives
    // as a burst of small mutations and per-record work would repeat the same
    // query dozens of times. `claimed` + `lastRequested` make it idempotent.
    // An explicit non-document `root` is a scoping instruction: observe exactly
    // it, or the enhancer would happily claim diagrams elsewhere on the page
    // that the caller meant to keep out. Only the default document root falls
    // back to hunting for #app.
    const observeRoot =
        root instanceof Document
            ? (root.querySelector('#app') ?? root.body)
            : (root as Element | DocumentFragment);
    let scanScheduled = 0;
    const mo = new MutationObserver(() => {
        if (scanScheduled) return;
        scanScheduled = requestAnimationFrame(() => {
            scanScheduled = 0;
            scan();
        });
    });
    if (observeRoot) mo.observe(observeRoot, { childList: true, subtree: true, characterData: true });

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
        if (scanScheduled) cancelAnimationFrame(scanScheduled);
        rendered.clear();
        // WeakSet/WeakMap have no `clear()` — swap them out so a fresh install
        // re-claims the figures still on the page.
        claimed = new WeakSet<Element>();
        lastRequested = new WeakMap<HTMLElement, string>();
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
