import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    configureMermaid,
    getMermaidConfig,
    mergeMermaidConfig,
    resetMermaidConfig,
    resolveThemeVariables,
} from '../config';
import {
    defaultThemeVariables,
    pageBackgroundColor,
    resolveColorScheme,
    resolveSchemeTheme,
    resolveTheme,
    watchTheme,
    resetMermaidLoader,
} from '../render';

function setComputedColorScheme(value: string | null): void {
    // happy-dom resolves `color-scheme` from the inline style, which is exactly
    // how daisyUI sets it per theme.
    if (value === null) document.documentElement.style.removeProperty('color-scheme');
    else document.documentElement.style.setProperty('color-scheme', value);
}

describe('resolveColorScheme', () => {
    beforeEach(() => {
        resetMermaidConfig();
        resetMermaidLoader();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.className = '';
        document.documentElement.style.removeProperty('background-color');
        document.body.style.removeProperty('background-color');
        setComputedColorScheme(null);
    });

    it('honours an explicit data-theme of "dark" or "light"', () => {
        document.documentElement.setAttribute('data-theme', 'dark');
        expect(resolveColorScheme()).toBe('dark');

        document.documentElement.setAttribute('data-theme', 'light');
        expect(resolveColorScheme()).toBe('light');
    });

    it('falls back to the computed color-scheme for named themes', () => {
        // `night` is a daisyUI dark theme — the name alone tells us nothing,
        // but daisyUI sets `color-scheme: dark` alongside it.
        document.documentElement.setAttribute('data-theme', 'night');
        setComputedColorScheme('dark');
        expect(resolveColorScheme()).toBe('dark');

        document.documentElement.setAttribute('data-theme', 'cupcake');
        setComputedColorScheme('light');
        expect(resolveColorScheme()).toBe('light');
    });

    it('treats "light dark" as "follow the system", not as a choice', () => {
        setComputedColorScheme('light dark');
        // Nothing else says dark, and the page has no background — light.
        expect(resolveColorScheme()).toBe('light');

        document.documentElement.classList.add('dark');
        expect(resolveColorScheme()).toBe('dark');
    });

    it('falls back to a Tailwind-style .dark class', () => {
        document.documentElement.classList.add('dark');
        expect(resolveColorScheme()).toBe('dark');
    });

    it('falls back to the page background when nothing is declared', () => {
        // A site that themes itself with a bare
        // `@media (prefers-color-scheme: dark)` block declares no color-scheme
        // and sets no class — the painted background is the only signal.
        document.body.style.backgroundColor = 'rgb(17, 17, 17)';
        expect(resolveColorScheme()).toBe('dark');

        document.body.style.backgroundColor = 'rgb(250, 250, 250)';
        expect(resolveColorScheme()).toBe('light');
    });

    it('looks past a transparent body to the html background', () => {
        document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
        document.documentElement.style.backgroundColor = 'rgb(10, 10, 10)';
        expect(resolveColorScheme()).toBe('dark');
    });

    it('calls an unstyled page light, whatever the OS prefers', () => {
        // Regression: this used to fall through to `prefers-color-scheme`, so
        // a plain white page on a machine in dark mode got mermaid's dark
        // theme — black nodes on white paper.
        const matchMediaSpy = vi
            .spyOn(globalThis, 'matchMedia')
            .mockReturnValue({ matches: true } as unknown as MediaQueryList);

        expect(resolveColorScheme()).toBe('light');
        expect(matchMediaSpy).not.toHaveBeenCalled();

        matchMediaSpy.mockRestore();
    });

    it('lets configureMermaid override detection entirely', () => {
        document.documentElement.setAttribute('data-theme', 'light');
        configureMermaid({ resolveColorScheme: () => 'dark' });
        expect(resolveColorScheme()).toBe('dark');
    });
});

describe('resolveTheme', () => {
    beforeEach(() => {
        resetMermaidConfig();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.className = '';
        document.documentElement.style.removeProperty('background-color');
        document.body.style.removeProperty('background-color');
        setComputedColorScheme(null);
    });

    it('maps the colour scheme onto mermaid theme names', () => {
        expect(resolveTheme()).toBe('default');
        document.documentElement.setAttribute('data-theme', 'dark');
        expect(resolveTheme()).toBe('dark');
    });

    it('uses configured themes', () => {
        configureMermaid({ themes: { light: 'neutral', dark: 'forest' } });
        expect(resolveTheme()).toBe('neutral');
        document.documentElement.setAttribute('data-theme', 'dark');
        expect(resolveTheme()).toBe('forest');
    });

    it('accepts a per-call override for one scheme only', () => {
        configureMermaid({ themes: { light: 'neutral', dark: 'forest' } });
        expect(resolveTheme({ themes: { light: 'base' } })).toBe('base');
        document.documentElement.setAttribute('data-theme', 'dark');
        // The un-overridden half still comes from the global config.
        expect(resolveTheme({ themes: { light: 'base' } })).toBe('forest');
    });
});

describe('watchTheme', () => {
    let dispose: (() => void) | null = null;

    beforeEach(() => {
        resetMermaidConfig();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.className = '';
        document.documentElement.style.removeProperty('background-color');
        document.body.style.removeProperty('background-color');
        setComputedColorScheme(null);
        vi.useFakeTimers();
    });

    afterEach(() => {
        dispose?.();
        dispose = null;
        vi.useRealTimers();
    });

    /** MutationObserver delivers on a microtask; rAF is faked to a timer. */
    async function settle(): Promise<void> {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(50);
    }

    it('fires when the resolved theme changes', async () => {
        const onChange = vi.fn();
        dispose = watchTheme(onChange);

        document.documentElement.setAttribute('data-theme', 'dark');
        await settle();

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('dark');
    });

    it('stays quiet when the attribute changes but the theme does not', async () => {
        const onChange = vi.fn();
        dispose = watchTheme(onChange);

        // Two different *light* themes resolve to the same mermaid theme, so
        // there is nothing to re-render.
        document.documentElement.setAttribute('data-theme', 'cupcake');
        setComputedColorScheme('light');
        await settle();

        expect(onChange).not.toHaveBeenCalled();
    });

    it('coalesces a burst of attribute writes into one callback', async () => {
        const onChange = vi.fn();
        dispose = watchTheme(onChange);

        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
        setComputedColorScheme('dark');
        await settle();

        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('fires on a light/dark flip even when both schemes name the same theme', async () => {
        // Regression, caught in a real browser: per-scheme variables are
        // normally written with `theme: 'base'` on both sides, so comparing
        // theme names alone saw no change and the diagram kept the old palette.
        configureMermaid({
            themes: {
                light: { theme: 'base', variables: { primaryColor: '#fff' } },
                dark: { theme: 'base', variables: { primaryColor: '#000' } },
            },
        });
        const onChange = vi.fn();
        dispose = watchTheme(onChange);

        document.documentElement.setAttribute('data-theme', 'dark');
        await settle();

        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('fires when a `variables` function starts returning different colours', async () => {
        // A daisyUI swap between two *light* themes: same scheme, same mermaid
        // theme, different CSS custom properties.
        let colour = '#111';
        configureMermaid({ themes: { light: { theme: 'base', variables: () => ({ primaryColor: colour }) } } });
        const onChange = vi.fn();
        dispose = watchTheme(onChange);

        colour = '#222';
        document.documentElement.setAttribute('data-theme', 'garden');
        await settle();

        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('stops firing once disposed', async () => {
        const onChange = vi.fn();
        dispose = watchTheme(onChange);
        dispose();
        dispose = null;

        document.documentElement.setAttribute('data-theme', 'dark');
        await settle();

        expect(onChange).not.toHaveBeenCalled();
    });
});

describe('theme variables', () => {
    beforeEach(() => {
        resetMermaidConfig();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.className = '';
        document.documentElement.style.removeProperty('background-color');
        document.body.style.removeProperty('background-color');
        setComputedColorScheme(null);
    });

    it('accepts the string shorthand and the object form side by side', () => {
        configureMermaid({
            themes: { light: 'neutral', dark: { theme: 'base', variables: { primaryColor: '#000' } } },
        });

        expect(resolveSchemeTheme()).toEqual({ theme: 'neutral' });

        document.documentElement.setAttribute('data-theme', 'dark');
        expect(resolveSchemeTheme()).toEqual({ theme: 'base', variables: { primaryColor: '#000' } });
    });

    it('evaluates a `variables` function at resolve time, not at config time', () => {
        let colour = '#111';
        configureMermaid({ themes: { light: { theme: 'base', variables: () => ({ primaryColor: colour }) } } });

        expect(resolveThemeVariables(resolveSchemeTheme())).toEqual({ primaryColor: '#111' });

        // The point of the function form: a CSS custom property or a store can
        // change after configuration and the next render must see it.
        colour = '#222';
        expect(resolveThemeVariables(resolveSchemeTheme())).toEqual({ primaryColor: '#222' });
    });

    it('resolveTheme still reports just the theme name', () => {
        configureMermaid({ themes: { light: { theme: 'base', variables: { primaryColor: '#000' } } } });
        expect(resolveTheme()).toBe('base');
    });
});

describe('mergeMermaidConfig', () => {
    it('merges themeVariables instead of replacing them', () => {
        // Two modules each contributing a slice of the palette must not
        // silently erase each other.
        const merged = mergeMermaidConfig(
            { themeVariables: { primaryColor: '#111', lineColor: '#222' }, fontFamily: 'serif' },
            { themeVariables: { lineColor: '#333' } }
        );

        expect(merged).toEqual({
            themeVariables: { primaryColor: '#111', lineColor: '#333' },
            fontFamily: 'serif',
        });
    });

    it('survives either side being absent', () => {
        expect(mergeMermaidConfig(undefined, { a: 1 })).toEqual({ a: 1 });
        expect(mergeMermaidConfig({ a: 1 }, undefined)).toEqual({ a: 1 });
        expect(mergeMermaidConfig(undefined, undefined)).toEqual({});
    });

    it('accumulates across repeated configureMermaid calls', () => {
        configureMermaid({ config: { themeVariables: { primaryColor: '#111' } } });
        configureMermaid({ config: { themeVariables: { lineColor: '#222' } } });

        expect(getMermaidConfig().config).toEqual({
            themeVariables: { primaryColor: '#111', lineColor: '#222' },
        });
    });
});


describe('defaultThemeVariables', () => {
    beforeEach(() => {
        resetMermaidConfig();
        document.documentElement.style.removeProperty('background-color');
        document.body.style.removeProperty('background-color');
    });

    it('sets edgeLabelBackground from the page background', () => {
        // mermaid hardcodes a light grey here in every built-in theme,
        // including the dark ones, so an edge label lands as a highlighter
        // smear across a dark diagram.
        document.body.style.backgroundColor = 'rgb(13, 17, 23)';
        expect(defaultThemeVariables()).toEqual({ edgeLabelBackground: 'rgb(13, 17, 23)' });
    });

    it('stays out of the way when no background is painted', () => {
        // Canvas white, which is what mermaid's own default already assumes.
        expect(defaultThemeVariables()).toEqual({});
        expect(pageBackgroundColor()).toBeNull();
    });

    it('looks past a transparent body to the html background', () => {
        document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
        document.documentElement.style.backgroundColor = 'rgb(255, 255, 255)';
        expect(pageBackgroundColor()).toBe('rgb(255, 255, 255)');
    });
});
