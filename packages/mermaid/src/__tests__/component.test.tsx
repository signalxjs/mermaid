import { describe, it, expect, beforeEach, vi } from 'vitest';

const initialize = vi.fn();
const render = vi.fn(async (_id: string, text: string) => ({ svg: `<svg data-source="${text}"></svg>` }));
vi.mock('mermaid', () => ({ default: { initialize, render } }));

import { render as mount } from 'sigx';
import Mermaid from '../Mermaid';
import { resetMermaidConfig } from '../config';
import { resetMermaidLoader } from '../render';

async function settle(): Promise<void> {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
}

describe('<Mermaid>', () => {
    let host: HTMLElement;

    beforeEach(() => {
        resetMermaidConfig();
        resetMermaidLoader();
        initialize.mockClear();
        render.mockClear();
        document.body.innerHTML = '<div id="host"></div>';
        host = document.querySelector('#host')!;
    });

    it('renders the source as a fallback before the SVG exists', () => {
        mount(<Mermaid code="graph TD; A-->B;" />, host);

        const figure = host.querySelector<HTMLElement>('figure.sigx-mermaid')!;
        expect(figure.getAttribute('data-mermaid-state')).toBe('pending');
        expect(figure.querySelector('.sigx-mermaid-source')!.textContent).toBe('graph TD; A-->B;');
    });

    it('forwards host attributes onto the figure', async () => {
        // Declaring Define.Attrs is a promise to forward what the component
        // doesn't consume. A type that accepts an attribute then drops it is
        // exactly the failure the opt-in exists to prevent.
        mount(
            <Mermaid
                code="graph TD; A-->B;"
                id="diagram-1"
                data-testid="arch"
                aria-describedby="caption-1"
                eager
            />,
            host
        );
        await settle();

        const figure = host.querySelector<HTMLElement>('figure.sigx-mermaid')!;
        expect(figure.id).toBe('diagram-1');
        expect(figure.getAttribute('data-testid')).toBe('arch');
        expect(figure.getAttribute('aria-describedby')).toBe('caption-1');
    });

    it('composes a caller class with its own instead of replacing it', async () => {
        mount(<Mermaid code="graph TD; A-->B;" class="my-diagram" eager />, host);
        await settle();

        const figure = host.querySelector<HTMLElement>('figure')!;
        expect(figure.classList.contains('sigx-mermaid')).toBe(true);
        expect(figure.classList.contains('my-diagram')).toBe(true);
    });

    it('treats `title` as a caption, not the HTML tooltip attribute', async () => {
        // The collision Define.WithAttrs exists for: the component's own
        // declaration wins, so `title` must not leak onto the figure.
        mount(<Mermaid code="graph TD; A-->B;" title="Architecture" eager />, host);
        await settle();

        const figure = host.querySelector<HTMLElement>('figure')!;
        expect(figure.querySelector('figcaption')!.textContent).toBe('Architecture');
        expect(figure.hasAttribute('title')).toBe(false);
    });

    it('does not leak its own props onto the figure', async () => {
        mount(<Mermaid code="graph TD; A-->B;" eager options={{ securityLevel: 'loose' }} />, host);
        await settle();

        const figure = host.querySelector<HTMLElement>('figure')!;
        for (const own of ['code', 'eager', 'options']) {
            expect(figure.hasAttribute(own)).toBe(false);
        }
    });

    it('renders the diagram and hides the source once the SVG lands', async () => {
        mount(<Mermaid code="graph TD; A-->B;" eager />, host);
        await settle();

        const figure = host.querySelector<HTMLElement>('figure')!;
        expect(figure.getAttribute('data-mermaid-state')).toBe('ready');
        expect(figure.querySelector('.sigx-mermaid-output svg')).not.toBeNull();
        expect(figure.querySelector<HTMLElement>('.sigx-mermaid-source')!.hidden).toBe(true);
    });
});
