/**
 * `<Mermaid>` — a diagram as a sigx component, for `.tsx` pages and plain sigx
 * apps (the MDX fence path is `@sigx/mermaid/ssg` + `@sigx/mermaid/client`).
 *
 * The SVG only ever exists in the browser: mermaid needs real text metrics, so
 * there is nothing to render server-side. The diagram source is emitted as a
 * `<pre>` and only hidden once the SVG lands — the same graceful-degradation
 * contract the client enhancer uses, so a diagram that never renders (no JS,
 * or a syntax error) still shows its definition instead of a blank frame.
 */

import { component, mergeProps, onUnmounted, watch, type Define } from 'sigx';
import { renderDiagram, watchTheme } from './render';
import type { MermaidOptions } from './config';

/**
 * Props are declared with `Define.*` rather than a plain interface so the
 * framework can see which are the component's own and which are host
 * attributes.
 *
 * `WithAttrs` because the figure forwards everything it doesn't consume — `id`,
 * `style`, `data-*`, `aria-*`, DOM event handlers — and because `title` is
 * exactly the collision it exists for: here it is a caption, not the HTML
 * tooltip attribute, so the component's own declaration has to win.
 *
 * Declaring `Attrs` is a promise to actually forward them; see `mergeProps`
 * below. A type that accepts an attribute and then drops it is the failure mode
 * the opt-in exists to prevent.
 */
export type MermaidProps = Define.WithAttrs<
    /** The diagram definition, e.g. `graph TD; A-->B;`. */
    & Define.Prop<'code', string, true>
    /** Rendered as a `<figcaption>` and used as the SVG's accessible name. */
    & Define.Prop<'title', string>
    /** Per-instance overrides, merged over the global `configureMermaid()` options. */
    & Define.Prop<'options', MermaidOptions>
    /** Render on mount instead of waiting for the figure to scroll into view. */
    & Define.Prop<'eager', boolean>
>;

export default component<MermaidProps>(({ props, signal, onMounted }) => {
    const state = signal<{ svg: string; error: string | null }>({ svg: '', error: null });

    let figure: HTMLElement | null = null;
    let output: HTMLElement | null = null;
    let observer: IntersectionObserver | null = null;
    let unwatchTheme: (() => void) | null = null;
    /** Bumped per draw; a late resolve from a superseded run is discarded. */
    let generation = 0;

    async function draw(): Promise<void> {
        const run = ++generation;
        const source = props.code?.trim();
        if (!source) return;

        try {
            const { svg, bindFunctions } = await renderDiagram(source, props.options);
            if (run !== generation) return;
            state.error = null;
            state.svg = svg;
            // mermaid's click handlers attach to the inserted nodes, which only
            // exist after the signal flush paints them.
            requestAnimationFrame(() => {
                if (run === generation && output) bindFunctions?.(output);
            });
        } catch (error) {
            if (run !== generation) return;
            state.svg = '';
            state.error = error instanceof Error ? error.message : String(error);
        }
    }

    onMounted(() => {
        if (props.eager || typeof IntersectionObserver !== 'function' || !figure) {
            void draw();
        } else {
            observer = new IntersectionObserver(
                (entries) => {
                    if (!entries.some((entry) => entry.isIntersecting)) return;
                    observer?.disconnect();
                    observer = null;
                    void draw();
                },
                { rootMargin: '200px' }
            );
            observer.observe(figure);
        }

        // Only re-draw what is already rendered — a diagram still waiting to
        // scroll into view picks up the current theme when it finally draws.
        unwatchTheme = watchTheme(() => {
            if (state.svg) void draw();
        });
    });

    // A router that reuses this instance for a new route hands us a new `code`
    // with no remount, and the old SVG would sit there looking authoritative.
    // Skips the not-yet-drawn case, which the observer still owns.
    watch(
        () => props.code,
        () => {
            if (state.svg || state.error) void draw();
        }
    );

    onUnmounted(() => {
        generation++;
        observer?.disconnect();
        observer = null;
        unwatchTheme?.();
        unwatchTheme = null;
    });

    /**
     * Everything the component doesn't consume lands on the `<figure>` — `id`,
     * `style`, `data-*`, `aria-*`, event handlers. `mergeProps` composes `class`
     * rather than letting either side win, so a caller's class is added to
     * `sigx-mermaid` instead of replacing it.
     *
     * `title` is stripped deliberately: it is this component's caption prop, and
     * forwarding it would also set the HTML tooltip attribute on the figure.
     */
    const figureProps = mergeProps(
        () => {
            const { code: _code, title: _title, options: _options, eager: _eager, ...rest } = props;
            return rest;
        },
        () => ({
            class: 'sigx-mermaid',
            'data-mermaid-state': state.error ? 'error' : state.svg ? 'ready' : 'pending',
            ref: (el: HTMLElement | null) => {
                figure = el;
            },
        })
    );

    return () => {
        return (
            <figure {...figureProps}>
                {/* A bare `<pre>`, matching the shell the ssg plugins emit —
                    deliberately not `<pre><code>`, which pipeline tooling
                    treats as a code block to claim. */}
                <pre class="sigx-mermaid-source" hidden={Boolean(state.svg)}>
                    {props.code}
                </pre>
                {state.svg ? (
                    <div
                        class="sigx-mermaid-output"
                        role={props.title ? 'img' : undefined}
                        aria-label={props.title}
                        // mermaid hands back an SVG string; `prop:` is sigx's
                        // typed escape hatch for setting a DOM property directly.
                        prop:innerHTML={state.svg}
                        ref={(el: HTMLElement | null) => {
                            output = el;
                        }}
                    />
                ) : null}
                {state.error ? <div class="sigx-mermaid-error">{state.error}</div> : null}
                {props.title ? <figcaption class="sigx-mermaid-caption">{props.title}</figcaption> : null}
            </figure>
        );
    };
});
