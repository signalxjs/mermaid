import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const initialize = vi.fn();
const render = vi.fn(async (_id: string, text: string) => ({
    svg: `<svg data-source="${text.replace(/"/g, '&quot;')}"><g/></svg>`,
    bindFunctions: vi.fn(),
}));

// mermaid is a peer that only ever runs in a browser; the real thing needs
// `getBBox`, which no DOM shim implements. What matters here is the DOM
// contract around it, so stub the library itself.
vi.mock('mermaid', () => ({ default: { initialize, render } }));

import { installMermaid, uninstallMermaid } from '../client';
import { resetMermaidConfig } from '../config';
import { resetMermaidLoader } from '../render';

/** Let the dynamic import, the render promise and the DOM writes all settle. */
async function settle(): Promise<void> {
    for (let i = 0; i < 8; i++) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * happy-dom ships an IntersectionObserver that never fires, so the lazy path
 * would silently render nothing. This stub records what is observed and lets a
 * test decide when things come into view — `autoIntersect` covers the common
 * case of "assume it's on screen".
 */
class FakeIntersectionObserver {
    static instances: FakeIntersectionObserver[] = [];
    static autoIntersect = true;

    readonly observed = new Set<Element>();

    constructor(private readonly callback: IntersectionObserverCallback) {
        FakeIntersectionObserver.instances.push(this);
    }

    observe(target: Element): void {
        this.observed.add(target);
        if (FakeIntersectionObserver.autoIntersect) this.intersect(target);
    }

    unobserve(target: Element): void {
        this.observed.delete(target);
    }

    disconnect(): void {
        this.observed.clear();
    }

    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }

    /** Report `target` as on-screen. */
    intersect(target: Element): void {
        this.callback(
            [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
        );
    }
}

const RealIntersectionObserver = globalThis.IntersectionObserver;

const FIGURE = `
<figure class="sigx-mermaid" data-sigx-mermaid>
  <pre class="sigx-mermaid-source">graph TD; A--&gt;B;</pre>
</figure>`;

const BARE_FENCE = `<pre><code class="language-mermaid">graph TD; A--&gt;B;</code></pre>`;

describe('installMermaid', () => {
    beforeEach(() => {
        FakeIntersectionObserver.instances = [];
        FakeIntersectionObserver.autoIntersect = true;
        globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;

        // The module auto-installs on import; start every test from nothing.
        uninstallMermaid();
        resetMermaidConfig();
        resetMermaidLoader();
        initialize.mockClear();
        render.mockClear();
        render.mockImplementation(async (_id: string, text: string) => ({
            svg: `<svg data-source="${text.replace(/"/g, '&quot;')}"><g/></svg>`,
            bindFunctions: vi.fn(),
        }));
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.className = '';
        document.body.innerHTML = '';
    });

    afterEach(() => {
        uninstallMermaid();
        globalThis.IntersectionObserver = RealIntersectionObserver;
    });

    it('waits for the diagram to scroll into view before loading mermaid', async () => {
        FakeIntersectionObserver.autoIntersect = false;
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;

        installMermaid();
        await settle();

        // Claimed and observed, but nothing rendered — mermaid is ~200 kB
        // gzipped and must not load for a diagram nobody has scrolled to.
        expect(render).not.toHaveBeenCalled();
        const figure = document.querySelector<HTMLElement>('[data-sigx-mermaid]')!;
        const observer = FakeIntersectionObserver.instances[0];
        expect(observer.observed.has(figure)).toBe(true);

        observer.intersect(figure);
        await settle();

        expect(render).toHaveBeenCalledTimes(1);
        expect(figure.getAttribute('data-mermaid-state')).toBe('ready');
    });

    it('renders a figure shell and hides the source', async () => {
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;

        installMermaid();
        await settle();

        const figure = document.querySelector<HTMLElement>('[data-sigx-mermaid]')!;
        expect(figure.getAttribute('data-mermaid-state')).toBe('ready');
        expect(figure.querySelector('.sigx-mermaid-output svg')).not.toBeNull();

        const source = figure.querySelector<HTMLElement>('.sigx-mermaid-source')!;
        expect(source.hidden).toBe(true);
        // Hidden, not removed — it is the fallback and the re-theme source.
        expect(source.textContent).toContain('graph TD');
    });

    it('claims a bare fence too, wrapping it in place', async () => {
        document.body.innerHTML = `<div id="app">${BARE_FENCE}</div>`;
        const pre = document.querySelector('pre')!;

        installMermaid();
        await settle();

        const figure = document.querySelector<HTMLElement>('[data-sigx-mermaid]')!;
        expect(figure.tagName).toBe('FIGURE');
        // The original <pre> is moved, not re-created.
        expect(figure.contains(pre)).toBe(true);
        expect(figure.querySelector('.sigx-mermaid-output svg')).not.toBeNull();
    });

    it('wrapping a bare fence does not feed the SPA observer back into itself', async () => {
        // Regression: wrapping mutates #app, which wakes the MutationObserver,
        // which re-scans and finds the same `language-mermaid` <code> — now
        // inside the figure. Without an ancestor check that wraps it again,
        // forever, at 100% CPU.
        document.body.innerHTML = `<div id="app">${BARE_FENCE}</div>`;

        installMermaid();
        await settle();

        // An unrelated mutation gives the observer another chance to misfire.
        document.querySelector('#app')!.append(document.createElement('span'));
        await settle();

        expect(document.querySelectorAll('[data-sigx-mermaid]').length).toBe(1);
        expect(document.querySelectorAll('pre').length).toBe(1);
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('never renders over the server markup — the SVG is a sibling', async () => {
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;

        installMermaid();
        await settle();

        const figure = document.querySelector<HTMLElement>('[data-sigx-mermaid]')!;
        expect(figure.querySelectorAll('.sigx-mermaid-source').length).toBe(1);
        expect(figure.querySelectorAll('.sigx-mermaid-output').length).toBe(1);
    });

    it('is idempotent — installing twice yields one SVG', async () => {
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;

        installMermaid();
        installMermaid();
        await settle();

        expect(document.querySelectorAll('.sigx-mermaid-output').length).toBe(1);
        expect(document.querySelectorAll('svg').length).toBe(1);
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('leaves the source visible and reports the message when a diagram fails', async () => {
        render.mockRejectedValueOnce(new Error('Parse error on line 1'));
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        installMermaid();
        await settle();

        const figure = document.querySelector<HTMLElement>('[data-sigx-mermaid]')!;
        expect(figure.getAttribute('data-mermaid-state')).toBe('error');
        expect(figure.querySelector<HTMLElement>('.sigx-mermaid-source')!.hidden).toBe(false);
        expect(figure.querySelector('.sigx-mermaid-output')!.textContent).toContain('Parse error on line 1');

        consoleError.mockRestore();
    });

    it('renders diagrams added by an SPA navigation', async () => {
        document.body.innerHTML = `<div id="app"></div>`;
        installMermaid();
        await settle();

        // What @sigx/ssg's client-side navigation does: swap the app subtree.
        // It dispatches no event, so the enhancer has to notice on its own.
        document.querySelector('#app')!.innerHTML = FIGURE;
        await settle();

        expect(document.querySelectorAll('.sigx-mermaid-output svg').length).toBe(1);
    });

    it('re-renders a figure the router patched in place with a new diagram', async () => {
        // Regression, caught in a real browser: sigx patches the DOM across a
        // client-side navigation rather than replacing it, so the outgoing
        // page's <figure> elements are re-used for the incoming page — same
        // element objects, new text in the source <pre>. Keyed on element identity
        // alone the enhancer says "already claimed" and the previous page's
        // SVG sits above the new page's source.
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;
        installMermaid();
        await settle();

        const figure = document.querySelector<HTMLElement>('[data-sigx-mermaid]')!;
        expect(render).toHaveBeenCalledTimes(1);
        expect(figure.querySelector('svg')!.getAttribute('data-source')).toContain('graph TD');

        // The patch: same <figure>, same <pre>, different text.
        figure.querySelector('.sigx-mermaid-source')!.textContent = 'pie title Other';
        await settle();

        expect(render).toHaveBeenCalledTimes(2);
        expect(render).toHaveBeenLastCalledWith(expect.any(String), 'pie title Other');
        expect(figure.querySelectorAll('.sigx-mermaid-output').length).toBe(1);
        expect(figure.querySelector('svg')!.getAttribute('data-source')).toBe('pie title Other');
    });

    it('leaves a patched-but-unchanged figure alone', async () => {
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;
        installMermaid();
        await settle();

        const figure = document.querySelector<HTMLElement>('[data-sigx-mermaid]')!;
        const source = figure.querySelector('.sigx-mermaid-source')!;
        // A patch that rewrites the same text must not cost a re-render.
        source.replaceChildren(document.createTextNode(source.textContent ?? ''));
        await settle();

        expect(render).toHaveBeenCalledTimes(1);
    });

    it('does not double-render when a navigation re-inserts the same markup', async () => {
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;
        installMermaid();
        await settle();
        expect(render).toHaveBeenCalledTimes(1);

        // Back-navigation: the same figure element, re-appended.
        const app = document.querySelector('#app')!;
        const figure = app.querySelector('[data-sigx-mermaid]')!;
        app.append(figure);
        await settle();

        expect(render).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('.sigx-mermaid-output').length).toBe(1);
    });

    it('re-renders with the dark theme when the page toggles', async () => {
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;
        installMermaid();
        await settle();

        expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'default' }));

        document.documentElement.setAttribute('data-theme', 'dark');
        await settle();

        expect(initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
        expect(render).toHaveBeenCalledTimes(2);
        // Still exactly one output node — a re-theme replaces, never appends.
        expect(document.querySelectorAll('.sigx-mermaid-output').length).toBe(1);
    });

    it('initializes mermaid with securityLevel "strict" by default', async () => {
        document.body.innerHTML = `<div id="app">${FIGURE}</div>`;
        installMermaid();
        await settle();

        expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: 'strict' }));
    });

    it('confines itself to an explicit root, initially and on later mutations', async () => {
        document.body.innerHTML = `<div id="app"><div id="inside"></div><div id="outside"></div></div>`;
        const inside = document.querySelector<HTMLElement>('#inside')!;
        const outside = document.querySelector<HTMLElement>('#outside')!;

        installMermaid({ root: inside });
        await settle();

        // A diagram added outside the given root is not the caller's problem.
        outside.innerHTML = FIGURE;
        await settle();
        expect(render).not.toHaveBeenCalled();

        inside.innerHTML = FIGURE;
        await settle();
        expect(render).toHaveBeenCalledTimes(1);
        expect(outside.querySelector('.sigx-mermaid-output')).toBeNull();
    });

    it('stops responding once disposed', async () => {
        document.body.innerHTML = `<div id="app"></div>`;
        const dispose = installMermaid();
        await settle();
        dispose();

        document.querySelector('#app')!.innerHTML = FIGURE;
        await settle();

        expect(render).not.toHaveBeenCalled();
    });
});
