import { describe, it, expect, beforeEach, vi } from 'vitest';

const initialize = vi.fn();
const render = vi.fn(async () => ({ svg: '<svg/>' }));
vi.mock('mermaid', () => ({ default: { initialize, render } }));

import { configureMermaid, resetMermaidConfig } from '../config';
import { renderDiagram, resetMermaidLoader } from '../render';

/** The themeVariables mermaid was actually initialized with. */
const lastVariables = () =>
    (initialize.mock.calls.at(-1)?.[0] as { themeVariables?: Record<string, string> })?.themeVariables ?? {};

describe('theme variable precedence', () => {
    beforeEach(() => {
        resetMermaidConfig();
        resetMermaidLoader();
        initialize.mockClear();
        render.mockClear();
        document.body.style.backgroundColor = 'rgb(13, 17, 23)';
        document.documentElement.removeAttribute('data-theme');
    });

    it('applies the package default when nobody says otherwise', async () => {
        await renderDiagram('graph TD; A-->B;');
        expect(lastVariables().edgeLabelBackground).toBe('rgb(13, 17, 23)');
    });

    it('lets global config override the default', async () => {
        configureMermaid({ config: { themeVariables: { edgeLabelBackground: '#abcdef' } } });
        await renderDiagram('graph TD; A-->B;');
        expect(lastVariables().edgeLabelBackground).toBe('#abcdef');
    });

    it('lets a scheme override global config', async () => {
        // The body background is dark, so without this the *dark* scheme wins
        // and the light overrides below would never be consulted.
        document.documentElement.setAttribute('data-theme', 'light');
        configureMermaid({
            config: { themeVariables: { edgeLabelBackground: '#abcdef', primaryColor: '#111' } },
            themes: { light: { theme: 'base', variables: { edgeLabelBackground: '#fedcba' } } },
        });
        await renderDiagram('graph TD; A-->B;');

        expect(lastVariables().edgeLabelBackground).toBe('#fedcba');
        // …without losing the variables it didn't mention.
        expect(lastVariables().primaryColor).toBe('#111');
    });

    it('lets a per-call option override global config', async () => {
        configureMermaid({ config: { themeVariables: { primaryColor: '#111' } } });
        await renderDiagram('graph TD; A-->B;', { config: { themeVariables: { primaryColor: '#222' } } });

        expect(lastVariables().primaryColor).toBe('#222');
        // The package default survives underneath both.
        expect(lastVariables().edgeLabelBackground).toBe('rgb(13, 17, 23)');
    });
});
