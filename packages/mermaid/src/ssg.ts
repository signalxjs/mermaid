/**
 * `@sigx/ssg` integration — a rehype plugin that turns a ` ```mermaid ` fence
 * into an accessible, client-enhanceable shell.
 *
 * This works because `@sigx/ssg` leaves the seam open on purpose:
 * `markdown.shiki.skipLanguages` makes the highlighter skip a language, so the
 * raw `<pre><code class="language-mermaid">` survives, and site-supplied
 * `rehypePlugins` run *after* shiki — so this plugin sees it.
 *
 * ```ts
 * // ssg.config.ts
 * import { rehypeMermaid } from '@sigx/mermaid/ssg';
 *
 * export default defineSSGConfig({
 *   markdown: {
 *     shiki: { skipLanguages: ['mermaid'] },
 *     rehypePlugins: [rehypeMermaid],
 *   },
 *   clientImports: ['@sigx/mermaid/styles', '@sigx/mermaid/client'],
 * });
 * ```
 *
 * The plugin is optional: `@sigx/mermaid/client` also claims a bare
 * `pre > code.language-mermaid`. What the shell adds is a stable class hook, a
 * `<figcaption>` from the fence's `title=` meta, and a reserved box so the page
 * doesn't jump when the SVG lands.
 *
 * It does **not** render anything. Build-time SVG needs real text metrics
 * (`getBBox`), which means a headless browser — see the README.
 */

// Minimal structural hast types. Depending on `@types/hast` would leak a type
// dependency into consumers' `.d.ts` resolution for a tree this simple.
interface HastText {
    type: 'text';
    value: string;
}

interface HastElement {
    type: 'element';
    tagName: string;
    properties?: Record<string, unknown>;
    children: HastNode[];
    data?: { meta?: string | null };
}

type HastNode = HastElement | HastText | { type: string; children?: HastNode[] };

interface HastParent {
    children: HastNode[];
}

export interface RehypeMermaidOptions {
    /**
     * Fence language this plugin claims. Must also appear in
     * `markdown.shiki.skipLanguages`, or shiki gets there first.
     * @default 'mermaid'
     */
    language?: string;
    /** Class on the emitted `<figure>`. @default 'sigx-mermaid' */
    className?: string;
}

function isElement(node: HastNode): node is HastElement {
    return node.type === 'element';
}

/** `class` may be a string or an array, depending on who built the tree. */
function classList(node: HastElement): string[] {
    const raw = node.properties?.className;
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string') return raw.split(/\s+/);
    return [];
}

function textOf(node: HastNode): string {
    if (node.type === 'text') return (node as HastText).value;
    const children = (node as HastElement).children;
    return children ? children.map(textOf).join('') : '';
}

/**
 * Read `title="…"` (or `title='…'`) out of the fence meta —
 * ` ```mermaid title="Request flow" `.
 */
function titleFromMeta(meta: string | null | undefined): string | null {
    if (!meta) return null;
    const match = /\btitle=(?:"([^"]*)"|'([^']*)')/.exec(meta);
    return match ? (match[1] ?? match[2] ?? null) : null;
}

/** Depth-first walk that lets the visitor replace a node in its parent. */
function walk(node: HastNode, parent: HastParent | null, visit: (n: HastNode, p: HastParent | null) => void): void {
    const children = (node as HastElement).children;
    if (children) {
        // Index loop, not `for…of`: the visitor replaces entries in this array
        // as it goes (replace-in-place only, so the length never shifts).
        for (let i = 0; i < children.length; i++) walk(children[i], node as HastParent, visit);
    }
    visit(node, parent);
}

/**
 * Rehype plugin. Usable bare (`rehypePlugins: [rehypeMermaid]`) or configured
 * (`rehypePlugins: [[rehypeMermaid, { language: 'mmd' }]]`).
 */
export function rehypeMermaid(options: RehypeMermaidOptions = {}) {
    const language = options.language ?? 'mermaid';
    const className = options.className ?? 'sigx-mermaid';
    const languageClass = `language-${language}`;

    return function transformer(tree: HastNode): void {
        walk(tree, null, (node, parent) => {
            if (!parent || !isElement(node) || node.tagName !== 'pre') return;

            const code = node.children.find((child) => isElement(child) && child.tagName === 'code');
            if (!code || !isElement(code) || !classList(code).includes(languageClass)) return;

            const source = textOf(code).replace(/\n$/, '');
            const title = titleFromMeta(code.data?.meta);

            const pre: HastElement = {
                type: 'element',
                tagName: 'pre',
                properties: { className: ['sigx-mermaid-source'] },
                children: [
                    {
                        type: 'element',
                        tagName: 'code',
                        properties: {},
                        children: [{ type: 'text', value: source }],
                    },
                ],
            };

            const children: HastNode[] = [pre];
            if (title) {
                children.push({
                    type: 'element',
                    tagName: 'figcaption',
                    properties: { className: ['sigx-mermaid-caption'] },
                    children: [{ type: 'text', value: title }],
                });
            }

            // Deliberately no `data-mermaid-state`: the client sets it when it
            // claims the figure. `pending` is a statement about JavaScript
            // being on the case, which the server cannot make — emitted
            // statically it would tell a no-JS reader the diagram is loading
            // forever, and hold open any space reserved for it.
            const figure: HastElement = {
                type: 'element',
                tagName: 'figure',
                properties: {
                    className: [className],
                    'data-sigx-mermaid': '',
                    ...(title ? { 'data-mermaid-title': title } : {}),
                },
                children,
            };

            const index = parent.children.indexOf(node);
            if (index !== -1) parent.children[index] = figure;
        });
    };
}

/**
 * Drop-in contribution for an `@sigx/ssg` **theme** — spread into the theme's
 * `ThemeConfig` and every site using that theme gets diagrams. `applyThemeConfig`
 * merges `markdown.rehypePlugins` and prepends `css` to `clientImports`.
 *
 * Note the caller still owns `markdown.shiki.skipLanguages`: a theme cannot
 * contribute it, because `ThemeConfig.markdown` only carries plugin arrays.
 */
export const mermaidThemeContribution = {
    markdown: { rehypePlugins: [rehypeMermaid] },
    css: ['@sigx/mermaid/styles', '@sigx/mermaid/client'],
} as const;

export default rehypeMermaid;
