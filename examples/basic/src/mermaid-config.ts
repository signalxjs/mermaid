/**
 * Per-scheme mermaid theming, driven by the site's own CSS custom properties.
 *
 * Imported *before* `@sigx/mermaid/client` in ssg.config.ts — the client
 * installs itself on import, so configuration has to land first.
 *
 * `variables` is a function, so it is evaluated at render time rather than
 * now: the values come from `getComputedStyle`, which returns the *current*
 * palette, and diagrams re-render on a theme flip.
 */

import { configureMermaid } from '@sigx/mermaid';

/** Read a custom property off `<html>`. */
const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Map the site's tokens onto mermaid's theme variables. */
const fromSiteTokens = () => ({
    background: cssVar('--bg'),
    primaryColor: cssVar('--surface'),
    primaryTextColor: cssVar('--fg'),
    primaryBorderColor: cssVar('--border'),
    lineColor: cssVar('--border'),
    secondaryColor: cssVar('--surface'),
    tertiaryColor: cssVar('--bg'),
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',

    // mermaid's own themes leave the edge-label chip a light grey in both
    // schemes, which reads as a highlighter smear over a dark diagram. The
    // page background makes the label sit on the canvas instead.
    edgeLabelBackground: cssVar('--bg'),
});

configureMermaid({
    // `base` is the theme mermaid intends to be recoloured; the others largely
    // ignore variable overrides.
    themes: {
        light: { theme: 'base', variables: fromSiteTokens },
        dark: { theme: 'base', variables: fromSiteTokens },
    },
});
