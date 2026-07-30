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

/**
 * mermaid theme variables — `primaryColor`, `lineColor`, `fontFamily`, … See
 * mermaid's theming docs for the full set. Values are plain CSS colours.
 */
export type MermaidThemeVariables = Record<string, string>;

/**
 * One colour scheme's appearance: which mermaid theme, and what to override in
 * it. A bare string is shorthand for `{ theme }`.
 *
 * Pair `variables` with `theme: 'base'` — `base` is the theme mermaid intends
 * to be recoloured, and the others largely ignore overrides.
 */
export interface MermaidSchemeTheme {
    theme: MermaidThemeName;
    /**
     * Overrides for this scheme. A function is evaluated at render time, so it
     * can read live values — CSS custom properties, a store — and picks up
     * changes on a theme flip:
     *
     * ```ts
     * variables: () => ({
     *     primaryColor: getComputedStyle(document.documentElement)
     *         .getPropertyValue('--b1').trim(),
     * })
     * ```
     */
    variables?: MermaidThemeVariables | (() => MermaidThemeVariables);
}

/** What to render as, per colour scheme. */
export interface MermaidThemes {
    light: MermaidThemeName | MermaidSchemeTheme;
    dark: MermaidThemeName | MermaidSchemeTheme;
}

/** Normalize the string shorthand into the object form. */
export function toSchemeTheme(value: MermaidThemeName | MermaidSchemeTheme): MermaidSchemeTheme {
    return typeof value === 'string' ? { theme: value } : value;
}

/** Resolve a scheme's variables, calling the function form if that's what it is. */
export function resolveThemeVariables(scheme: MermaidSchemeTheme): MermaidThemeVariables {
    const { variables } = scheme;
    if (!variables) return {};
    return typeof variables === 'function' ? variables() : variables;
}

export interface MermaidOptions {
    /**
     * Appearance per colour scheme — a mermaid theme name, or a name plus
     * `variables` to recolour it to match the site.
     *
     * ```ts
     * themes: {
     *     light: { theme: 'base', variables: { primaryColor: '#fff' } },
     *     dark: 'dark',
     * }
     * ```
     *
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
     * Extra mermaid config, merged into `mermaid.initialize()` after the
     * options above. Use for `flowchart`, `sequence`, `fontFamily`, …
     *
     * `themeVariables` here applies to *both* schemes; per-scheme overrides in
     * `themes` win over it. Prefer `themes` unless a value is genuinely
     * scheme-independent.
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
 * Merge two mermaid config objects. `themeVariables` is merged rather than
 * replaced — a plain spread means the second caller to set any variable at all
 * silently discards every variable the first one set.
 */
export function mergeMermaidConfig(
    base: Record<string, unknown> | undefined,
    extra: Record<string, unknown> | undefined
): Record<string, unknown> {
    const merged = { ...base, ...extra };
    const baseVars = base?.themeVariables;
    const extraVars = extra?.themeVariables;
    if (baseVars && extraVars) {
        merged.themeVariables = { ...(baseVars as object), ...(extraVars as object) };
    }
    return merged;
}

/**
 * Set global mermaid options. Merges into (does not replace) previous calls,
 * so several modules can each contribute a slice.
 */
export function configureMermaid(options: MermaidOptions): void {
    current = {
        ...current,
        ...options,
        themes: { ...current.themes, ...options.themes },
        config: mergeMermaidConfig(current.config, options.config),
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
