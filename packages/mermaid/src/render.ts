/**
 * The rendering core, shared by the `<Mermaid>` component and the
 * `@sigx/mermaid/client` progressive enhancer.
 *
 * mermaid is loaded lazily and exactly once: it drags in d3, cytoscape and
 * katex, so a page with no diagrams must never pay for it. Everything here is
 * browser-only — mermaid needs real text metrics (`getBBox`), which no
 * server-side DOM shim implements faithfully.
 */

import { getMermaidConfig, type MermaidOptions, type MermaidThemes } from './config';

/** The slice of mermaid's API this package uses. */
interface MermaidApi {
    initialize(config: Record<string, unknown>): void;
    render(
        id: string,
        text: string,
        container?: Element
    ): Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
}

let mermaidPromise: Promise<MermaidApi> | null = null;

/**
 * Load mermaid, once. The in-flight promise is memoized (not just the result),
 * so N diagrams entering the viewport in the same frame trigger one import
 * rather than N.
 */
export function loadMermaid(): Promise<MermaidApi> {
    if (!mermaidPromise) {
        mermaidPromise = import('mermaid').then((m) => (m.default ?? m) as unknown as MermaidApi);
    }
    return mermaidPromise;
}

/** Drop the memoized loader. Exported for tests. */
export function resetMermaidLoader(): void {
    mermaidPromise = null;
    renderQueue = Promise.resolve();
    seq = 0;
}

/** Perceived lightness of an `rgb()`/`rgba()` string, or null if unreadable. */
function luminanceOf(color: string | undefined): number | null {
    if (!color) return null;
    const parts = /^rgba?\(([^)]+)\)/.exec(color);
    if (!parts) return null;
    const [r, g, b, a] = parts[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    // Fully transparent: this element contributes nothing, keep looking upward.
    if (Number.isFinite(a) && a === 0) return null;
    if (![r, g, b].every(Number.isFinite)) return null;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Detect the page's colour scheme, most explicit signal first:
 *
 * 1. an explicit `resolveColorScheme` option;
 * 2. `data-theme="light|dark"` on `<html>` — the literal daisyUI/ssg values;
 * 3. the *computed* `color-scheme` — daisyUI sets this per theme, so it
 *    resolves named themes like `night` or `cupcake` that step 2 can't;
 * 4. a `.dark` class on `<html>` — the Tailwind convention;
 * 5. the page's actual background colour.
 *
 * Step 5 replaces the obvious `prefers-color-scheme` fallback, which is wrong
 * often enough to matter: a page that has *not* opted into dark mode renders
 * light no matter what the OS prefers, so keying off the OS puts a dark diagram
 * on a white page. Reading the background instead answers the question that is
 * actually being asked — "is this diagram about to sit on something dark?" —
 * and it works whether the site themes itself with `data-theme`, a class, or a
 * bare `@media (prefers-color-scheme: dark)` block that sets no `color-scheme`.
 * A page with no background at all is canvas white, hence light.
 */
export function resolveColorScheme(options?: MermaidOptions): 'light' | 'dark' {
    const override = options?.resolveColorScheme ?? getMermaidConfig().resolveColorScheme;
    if (override) return override();
    if (typeof document === 'undefined') return 'light';

    const root = document.documentElement;

    const dataTheme = root.getAttribute('data-theme');
    if (dataTheme === 'dark' || dataTheme === 'light') return dataTheme;

    // `getComputedStyle` is unavailable in some minimal DOM shims — never let
    // detection throw, the diagram is more important than its palette.
    try {
        const scheme = getComputedStyle(root).colorScheme;
        // `color-scheme: light dark` means "follow the system" — it is not a
        // choice, so fall through rather than picking whichever is listed first.
        if (scheme && scheme !== 'normal' && !(scheme.includes('light') && scheme.includes('dark'))) {
            if (scheme.includes('dark')) return 'dark';
            if (scheme.includes('light')) return 'light';
        }
    } catch {
        /* fall through */
    }

    if (root.classList.contains('dark')) return 'dark';

    try {
        for (const element of [document.body, root]) {
            const luminance = luminanceOf(element && getComputedStyle(element).backgroundColor);
            if (luminance !== null) return luminance < 0.5 ? 'dark' : 'light';
        }
    } catch {
        /* fall through */
    }

    return 'light';
}

/** The mermaid theme name for the page's current colour scheme. */
export function resolveTheme(options?: MermaidOptions): string {
    // `getMermaidConfig().themes` is always complete; a per-call override may
    // name only one scheme.
    const themes: MermaidThemes = { ...getMermaidConfig().themes, ...options?.themes };
    return resolveColorScheme(options) === 'dark' ? themes.dark : themes.light;
}

/**
 * Call `onChange` whenever the resolved mermaid theme changes — a daisyUI
 * `data-theme` flip, a Tailwind `.dark` toggle, or the OS switching schemes.
 *
 * Coalesced into one animation frame (a theme toggle typically rewrites
 * several attributes) and filtered on the *resolved* theme, so switching
 * between two light daisyUI themes doesn't re-render every diagram for nothing.
 *
 * Returns a disposer.
 */
export function watchTheme(onChange: (theme: string) => void): () => void {
    if (typeof document === 'undefined') return () => {};

    let pending = 0;
    let last = resolveTheme();

    const check = (): void => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
            pending = 0;
            const theme = resolveTheme();
            if (theme === last) return;
            last = theme;
            onChange(theme);
        });
    };

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class', 'style'],
    });

    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener('change', check);

    return () => {
        observer.disconnect();
        media?.removeEventListener('change', check);
        if (pending) cancelAnimationFrame(pending);
    };
}

let seq = 0;

/**
 * mermaid keeps its config in module-global state and `render()` mutates the
 * document while it measures, so two concurrent renders can pick up each
 * other's theme. Serialize them — rendering is fast, and diagrams arrive in
 * viewport order anyway.
 */
let renderQueue: Promise<unknown> = Promise.resolve();

export interface RenderResult {
    svg: string;
    /** Attaches mermaid's `click` interactions. Call it on the inserted node. */
    bindFunctions?: (element: Element) => void;
}

/**
 * Render one diagram to an SVG string. Rejects with mermaid's parse error if
 * the source is invalid — callers are expected to surface it and leave the
 * original source visible.
 */
export function renderDiagram(source: string, options?: MermaidOptions): Promise<RenderResult> {
    const run = async (): Promise<RenderResult> => {
        const mermaid = await loadMermaid();
        const opts = getMermaidConfig();

        mermaid.initialize({
            startOnLoad: false,
            securityLevel: options?.securityLevel ?? opts.securityLevel,
            theme: resolveTheme(options),
            ...opts.config,
            ...options?.config,
        });

        const id = `sigx-mermaid-${++seq}`;
        try {
            return await mermaid.render(id, source);
        } finally {
            // A failed render leaves mermaid's measuring node parked in the
            // body; without this the page accumulates one orphan per bad
            // diagram (and the id collides on a re-theme re-render).
            document.getElementById(id)?.remove();
            document.getElementById(`d${id}`)?.remove();
        }
    };

    const result = renderQueue.then(run, run);
    // Keep the chain alive after a rejection, but don't leave it unhandled.
    renderQueue = result.catch(() => undefined);
    return result;
}
