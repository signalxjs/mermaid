/**
 * Markdown-pipeline plugins that turn a ` ```mermaid ` fence into an
 * accessible, client-enhanceable shell — the `<figure data-sigx-mermaid>` that
 * `@sigx/mermaid/client` later upgrades to an SVG.
 *
 * Two plugins, one emitted shell. They differ only in which stage of the
 * pipeline hands them the tree:
 *
 * - `remarkMermaid` runs on the **markdown** tree (mdast). It claims the fence
 *   before HTML conversion, so nothing downstream of it ever sees the fence.
 * - `rehypeMermaid` runs on the **HTML** tree (hast). It claims whatever
 *   `<pre><code class="language-mermaid">` is still in the tree when it runs —
 *   what reaches it is decided by the plugins ordered before it.
 *
 * With `@sigx/ssg`:
 *
 * ```ts
 * // ssg.config.ts
 * import { remarkMermaid } from '@sigx/mermaid/ssg';
 *
 * export default defineSSGConfig({
 *   markdown: { remarkPlugins: [remarkMermaid] },
 *   clientImports: ['@sigx/mermaid/styles', '@sigx/mermaid/client'],
 * });
 * ```
 *
 * The plugins are optional: `@sigx/mermaid/client` also claims a bare
 * `pre > code.language-mermaid`. What the shell adds is a stable class hook, a
 * `<figcaption>` from the fence's `title=` meta, and a reserved box so the page
 * doesn't jump when the SVG lands.
 *
 * Neither plugin renders anything. Build-time SVG needs real text metrics
 * (`getBBox`), which means a headless browser — see the README.
 */

// Minimal structural hast/mdast types. Depending on `@types/hast` or
// `@types/mdast` would leak a type dependency into consumers' `.d.ts`
// resolution for trees this simple.
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

interface MdastCode {
    type: 'code';
    lang?: string | null;
    meta?: string | null;
    value: string;
    data?: {
        hName?: string;
        hProperties?: Record<string, unknown>;
        hChildren?: HastNode[];
        [key: string]: unknown;
    };
}

type MdastNode = MdastCode | { type: string; children?: MdastNode[] };

export interface RemarkMermaidOptions {
    /** Fence language this plugin claims. @default 'mermaid' */
    language?: string;
    /** Class on the emitted `<figure>`. @default 'sigx-mermaid' */
    className?: string;
}

export interface RehypeMermaidOptions {
    /**
     * Fence language this plugin claims — matched as `language-<language>` on
     * the `<code>`, which must still be present when the plugin runs.
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

/**
 * The figure shell both plugins emit, built in one place so the two stages
 * stay byte-identical: `properties` for the `<figure>` itself, `children` for
 * the source `<pre>` and the optional `<figcaption>`.
 *
 * Deliberately no `data-mermaid-state`: the client sets it when it claims the
 * figure. `pending` is a statement about JavaScript being on the case, which
 * the build cannot make — emitted statically it would tell a no-JS reader the
 * diagram is loading forever, and hold open any space reserved for it.
 */
function figureParts(
    source: string,
    title: string | null,
    className: string
): { properties: Record<string, unknown>; children: HastNode[] } {
    // The source is a bare `<pre>`, deliberately not `<pre><code>`: the shell
    // must never look like a markdown fence, or downstream fence tooling in
    // the same pipeline mistakes the embedded source for a code block and
    // claims it out of the figure.
    const children: HastNode[] = [
        {
            type: 'element',
            tagName: 'pre',
            properties: { className: ['sigx-mermaid-source'] },
            children: [{ type: 'text', value: source }],
        },
    ];
    if (title) {
        children.push({
            type: 'element',
            tagName: 'figcaption',
            properties: { className: ['sigx-mermaid-caption'] },
            children: [{ type: 'text', value: title }],
        });
    }

    const properties: Record<string, unknown> = {
        className: [className],
        'data-sigx-mermaid': '',
        ...(title ? { 'data-mermaid-title': title } : {}),
    };
    return { properties, children };
}

/** Pre-order mdast walk; the visitor mutates nodes in place. */
function walkMdast(node: MdastNode, visit: (n: MdastNode) => void): void {
    visit(node);
    const children = (node as { children?: MdastNode[] }).children;
    if (children) for (const child of children) walkMdast(child, visit);
}

/** Depth-first hast walk that lets the visitor replace a node in its parent. */
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
 * remark plugin — claims fences on the markdown tree. Usable bare
 * (`remarkPlugins: [remarkMermaid]`) or configured
 * (`remarkPlugins: [[remarkMermaid, { language: 'mmd' }]]`).
 *
 * The claim is expressed through the node's `data.hName` / `hProperties` /
 * `hChildren`, the mdast-to-hast contract every remark-based pipeline honours,
 * so the HTML stage emits the figure shell instead of a `<pre><code>`.
 */
export function remarkMermaid(options: RemarkMermaidOptions = {}) {
    const language = options.language ?? 'mermaid';
    const className = options.className ?? 'sigx-mermaid';

    return function transformer(tree: MdastNode): void {
        walkMdast(tree, (node) => {
            if (node.type !== 'code') return;
            const code = node as MdastCode;
            if (code.lang !== language) return;

            const title = titleFromMeta(code.meta);
            // `value` is the fence body exactly — no trailing newline — and
            // `hChildren` bypasses the default code handler that would append
            // one, so the shell matches the rehype plugin's byte for byte.
            const { properties, children } = figureParts(code.value, title, className);
            code.data = { ...code.data, hName: 'figure', hProperties: properties, hChildren: children };
        });
    };
}

/**
 * rehype plugin — claims fences on the HTML tree. Usable bare
 * (`rehypePlugins: [rehypeMermaid]`) or configured
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

            // Strip the trailing newline the HTML stage appends to a fence —
            // it would show as a blank line in the fallback, and mermaid does
            // not need it.
            const source = textOf(code).replace(/\n$/, '');
            const title = titleFromMeta(code.data?.meta);

            const { properties, children } = figureParts(source, title, className);
            const figure: HastElement = { type: 'element', tagName: 'figure', properties, children };

            const index = parent.children.indexOf(node);
            if (index !== -1) parent.children[index] = figure;
        });
    };
}

/**
 * Drop-in contribution for an `@sigx/ssg` **theme** — spread into the theme's
 * `ThemeConfig` and every site using that theme gets diagrams, no site-level
 * configuration required. `applyThemeConfig` merges `markdown.remarkPlugins`
 * and prepends `css` to `clientImports`.
 */
export const mermaidThemeContribution = {
    markdown: { remarkPlugins: [remarkMermaid] },
    css: ['@sigx/mermaid/styles', '@sigx/mermaid/client'],
} as const;

export default rehypeMermaid;
