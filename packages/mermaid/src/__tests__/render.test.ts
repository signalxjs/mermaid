import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureMermaid, resetMermaidConfig } from '../config';
import { resolveColorScheme, resolveTheme, watchTheme, resetMermaidLoader } from '../render';

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
        // No `.dark` class and happy-dom reports no dark preference.
        expect(resolveColorScheme()).toBe('light');

        document.documentElement.classList.add('dark');
        expect(resolveColorScheme()).toBe('dark');
    });

    it('falls back to a Tailwind-style .dark class', () => {
        document.documentElement.classList.add('dark');
        expect(resolveColorScheme()).toBe('dark');
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
