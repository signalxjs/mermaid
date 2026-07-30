/**
 * Shared, module-global mermaid configuration.
 *
 * Lives in its own module because `@sigx/mermaid/client` auto-installs on
 * import: a site that wants non-default options imports a small config module
 * *before* the client entry (the same ordering `@sigx/live-code` requires for
 * `configurePlayground`), and both modules land on this one shared object.
 *
 * ```ts
 * // ssg.config.ts
 * clientImports: ['./src/mermaid-config', '@sigx/mermaid/client']
 * ```
 */

/**
 * A mermaid theme name. The four built-ins are listed for autocomplete; any
 * string is accepted so a custom registered theme still typechecks.
 */
export type MermaidThemeName = 'default' | 'base' | 'dark' | 'forest' | 'neutral' | (string & {});

/** Which mermaid theme to use in each colour scheme. */
export interface MermaidThemes {
    light: MermaidThemeName;
    dark: MermaidThemeName;
}

export interface MermaidOptions {
    /**
     * Theme per colour scheme.
     * @default { light: 'default', dark: 'dark' }
     */
    themes?: Partial<MermaidThemes>;

    /**
     * mermaid's `securityLevel`. Diagram source on a docs site is authored
     * content, but it is still content — `'strict'` keeps mermaid from
     * emitting the raw HTML and click handlers a compromised page would want.
     * Raise it deliberately.
     * @default 'strict'
     */
    securityLevel?: 'strict' | 'loose' | 'antiscript' | 'sandbox';

    /**
     * Extra mermaid config, shallow-merged into `mermaid.initialize()` after
     * the options above. Use for `flowchart`, `sequence`, `fontFamily`, …
     */
    config?: Record<string, unknown>;

    /**
     * Override colour-scheme detection. Return `'light'` or `'dark'`; the
     * default reads `data-theme`, then the computed `color-scheme`, then a
     * `.dark` class, then `prefers-color-scheme`.
     */
    resolveColorScheme?: () => 'light' | 'dark';
}

const DEFAULT_THEMES: MermaidThemes = { light: 'default', dark: 'dark' };

let current: MermaidOptions = {};

/**
 * Set global mermaid options. Merges into (does not replace) previous calls,
 * so several modules can each contribute a slice.
 */
export function configureMermaid(options: MermaidOptions): void {
    current = {
        ...current,
        ...options,
        themes: { ...current.themes, ...options.themes },
        config: { ...current.config, ...options.config },
    };
}

/** Global options with every default filled in — nothing here is optional. */
export interface ResolvedMermaidOptions extends MermaidOptions {
    themes: MermaidThemes;
    securityLevel: NonNullable<MermaidOptions['securityLevel']>;
    config: Record<string, unknown>;
}

/** The current global options, with defaults filled in. */
export function getMermaidConfig(): ResolvedMermaidOptions {
    return {
        ...current,
        themes: { ...DEFAULT_THEMES, ...current.themes },
        securityLevel: current.securityLevel ?? 'strict',
        config: current.config ?? {},
    };
}

/** Reset to defaults. Exported for tests. */
export function resetMermaidConfig(): void {
    current = {};
}
