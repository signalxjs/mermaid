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

import { component, onUnmounted } from 'sigx';
import { renderDiagram, watchTheme } from './render';
import type { MermaidOptions } from './config';

export interface MermaidProps {
    /** The diagram definition, e.g. `graph TD; A-->B;`. */
    code: string;
    /** Rendered as a `<figcaption>` and used as the SVG's accessible name. */
    title?: string;
    /** Extra classes on the `<figure>`. */
    class?: string;
    /** Per-instance overrides, merged over the global `configureMermaid()` options. */
    options?: MermaidOptions;
    /**
     * Render on mount instead of waiting for the figure to scroll into view.
     * @default false
     */
    eager?: boolean;
}

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

    onUnmounted(() => {
        generation++;
        observer?.disconnect();
        observer = null;
        unwatchTheme?.();
        unwatchTheme = null;
    });

    return () => {
        const status = state.error ? 'error' : state.svg ? 'ready' : 'pending';
        return (
            <figure
                class={`sigx-mermaid${props.class ? ` ${props.class}` : ''}`}
                data-mermaid-state={status}
                ref={(el: HTMLElement | null) => {
                    figure = el;
                }}
            >
                <pre class="sigx-mermaid-source" hidden={Boolean(state.svg)}>
                    <code>{props.code}</code>
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
