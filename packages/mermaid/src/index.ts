/**
 * @sigx/mermaid — mermaid diagrams for sigx.
 *
 * Three entry points:
 *
 * - `@sigx/mermaid` (this one) — the `<Mermaid>` component and the rendering
 *   primitives, for `.tsx` pages and plain sigx apps.
 * - `@sigx/mermaid/client` — side-effect module that enhances ` ```mermaid `
 *   fences on a statically-rendered page.
 * - `@sigx/mermaid/ssg` — `rehypeMermaid`, the `@sigx/ssg` markdown plugin.
 *
 * Plus `@sigx/mermaid/styles` for the stylesheet.
 */

export { default as Mermaid, type MermaidProps } from './Mermaid';

export {
    configureMermaid,
    getMermaidConfig,
    resetMermaidConfig,
    mergeMermaidConfig,
    type MermaidOptions,
    type MermaidSchemeTheme,
    type MermaidThemeName,
    type MermaidThemes,
    type MermaidThemeVariables,
} from './config';

export {
    loadMermaid,
    renderDiagram,
    resolveColorScheme,
    resolveTheme,
    resolveSchemeTheme,
    defaultThemeVariables,
    pageBackgroundColor,
    watchTheme,
    resetMermaidLoader,
    type RenderResult,
} from './render';
