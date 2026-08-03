import { describe, it, expect } from 'vitest';
import { remarkMermaid, rehypeMermaid } from '../ssg';

/** Minimal hast builders — enough to stand in for what rehype hands the plugin. */
const text = (value: string) => ({ type: 'text', value }) as any;
const el = (tagName: string, properties: Record<string, unknown>, children: any[], data?: unknown) =>
    ({ type: 'element', tagName, properties, children, ...(data ? { data } : {}) }) as any;

const fence = (lang: string, source: string, meta?: string) =>
    el('pre', {}, [el('code', { className: [`language-${lang}`] }, [text(source)], meta ? { meta } : undefined)]);

const root = (children: any[]) => ({ type: 'root', children }) as any;

/** Minimal mdast builders — enough to stand in for what remark hands the plugin. */
const code = (lang: string | null, value: string, meta?: string) =>
    ({ type: 'code', lang, meta: meta ?? null, value }) as any;

const parent = (type: string, children: any[]) => ({ type, children }) as any;

/** Depth-first search for the first element with `tagName`. */
function find(node: any, tagName: string): any {
    if (node?.type === 'element' && node.tagName === tagName) return node;
    for (const child of node?.children ?? []) {
        const hit = find(child, tagName);
        if (hit) return hit;
    }
    return null;
}

function textOf(node: any): string {
    if (node?.type === 'text') return node.value;
    return (node?.children ?? []).map(textOf).join('');
}

describe('remarkMermaid', () => {
    it('claims a mermaid fence through data.hName/hProperties/hChildren', () => {
        const node = code('mermaid', 'graph TD;\n  A-->B;');
        const tree = root([node]);

        remarkMermaid()(tree);

        expect(node.data.hName).toBe('figure');
        expect(node.data.hProperties).toEqual({ className: ['sigx-mermaid'], 'data-sigx-mermaid': '' });

        const pre = find({ children: node.data.hChildren }, 'pre');
        expect(pre.properties.className).toEqual(['sigx-mermaid-source']);
        // mdast `value` carries the fence body with no trailing newline, and
        // the plugin must emit it verbatim — the shell has to come out byte
        // identical to the rehype plugin's.
        expect(textOf(pre)).toBe('graph TD;\n  A-->B;');
    });

    it('leaves other languages alone', () => {
        const node = code('ts', 'const a = 1;');
        remarkMermaid()(root([node]));

        expect(node.data).toBeUndefined();
    });

    it('leaves a code block with no language alone', () => {
        const node = code(null, 'plain');
        remarkMermaid()(root([node]));

        expect(node.data).toBeUndefined();
    });

    it('lifts `title="…"` out of the fence meta into a caption and a property', () => {
        const node = code('mermaid', 'graph TD;', 'title="Request flow"');
        remarkMermaid()(root([node]));

        expect(node.data.hProperties['data-mermaid-title']).toBe('Request flow');
        const caption = find({ children: node.data.hChildren }, 'figcaption');
        expect(caption.properties.className).toEqual(['sigx-mermaid-caption']);
        expect(textOf(caption)).toBe('Request flow');
    });

    it("accepts the single-quoted meta form, title='…'", () => {
        const node = code('mermaid', 'graph TD;', "title='Request flow'");
        remarkMermaid()(root([node]));

        expect(node.data.hProperties['data-mermaid-title']).toBe('Request flow');
    });

    it('emits no caption when the fence has no title', () => {
        const node = code('mermaid', 'graph TD;');
        remarkMermaid()(root([node]));

        expect(find({ children: node.data.hChildren }, 'figcaption')).toBeNull();
        expect(node.data.hProperties['data-mermaid-title']).toBeUndefined();
    });

    it('claims fences nested inside other nodes', () => {
        const node = code('mermaid', 'graph TD;');
        const tree = root([parent('blockquote', [parent('listItem', [node])])]);

        remarkMermaid()(tree);

        expect(node.data.hName).toBe('figure');
    });

    it('claims every fence in the document, not just the first', () => {
        const first = code('mermaid', 'graph TD;');
        const other = code('ts', 'x');
        const second = code('mermaid', 'pie title P');

        remarkMermaid()(root([first, other, second]));

        expect(first.data.hName).toBe('figure');
        expect(other.data).toBeUndefined();
        expect(second.data.hName).toBe('figure');
    });

    it('honours a custom language and className', () => {
        const claimed = code('mmd', 'graph TD;');
        const ignored = code('mermaid', 'graph TD;');

        remarkMermaid({ language: 'mmd', className: 'diagram' })(root([claimed, ignored]));

        expect(claimed.data.hName).toBe('figure');
        expect(claimed.data.hProperties.className).toEqual(['diagram']);
        expect(ignored.data).toBeUndefined();
    });

    it('preserves data another plugin already put on the node', () => {
        const node = code('mermaid', 'graph TD;');
        node.data = { foo: 1 };

        remarkMermaid()(root([node]));

        expect(node.data.foo).toBe(1);
        expect(node.data.hName).toBe('figure');
    });
});

describe('rehypeMermaid', () => {
    it('replaces a mermaid fence with a figure carrying the source', () => {
        const tree = root([fence('mermaid', 'graph TD;\n  A-->B;\n')]);

        rehypeMermaid()(tree);

        const figure = tree.children[0];
        expect(figure.tagName).toBe('figure');
        expect(figure.properties.className).toEqual(['sigx-mermaid']);
        expect(figure.properties['data-sigx-mermaid']).toBe('');

        const pre = find(figure, 'pre');
        expect(pre.properties.className).toEqual(['sigx-mermaid-source']);
        // The trailing newline the HTML stage leaves on a fence would show up
        // as a blank line in the fallback, and mermaid does not need it.
        expect(textOf(pre)).toBe('graph TD;\n  A-->B;');
    });

    it('leaves other languages alone', () => {
        const tree = root([fence('ts', 'const a = 1;')]);

        rehypeMermaid()(tree);

        expect(tree.children[0].tagName).toBe('pre');
        expect(find(tree, 'figure')).toBeNull();
    });

    it('leaves a fence with no language alone', () => {
        const tree = root([el('pre', {}, [el('code', {}, [text('plain')])])]);

        rehypeMermaid()(tree);

        expect(tree.children[0].tagName).toBe('pre');
    });

    it('accepts a string className, not just an array', () => {
        const tree = root([el('pre', {}, [el('code', { className: 'language-mermaid' }, [text('graph TD;')])])]);

        rehypeMermaid()(tree);

        expect(tree.children[0].tagName).toBe('figure');
    });

    it('lifts `title="…"` out of the fence meta into a caption and a data attribute', () => {
        const tree = root([fence('mermaid', 'graph TD;', 'title="Request flow"')]);

        rehypeMermaid()(tree);

        const figure = tree.children[0];
        expect(figure.properties['data-mermaid-title']).toBe('Request flow');
        const caption = find(figure, 'figcaption');
        expect(textOf(caption)).toBe('Request flow');
    });

    it('emits no caption when the fence has no title', () => {
        const tree = root([fence('mermaid', 'graph TD;')]);

        rehypeMermaid()(tree);

        expect(find(tree.children[0], 'figcaption')).toBeNull();
        expect(tree.children[0].properties['data-mermaid-title']).toBeUndefined();
    });

    it('transforms fences nested inside other elements', () => {
        const tree = root([el('blockquote', {}, [el('div', {}, [fence('mermaid', 'graph TD;')])])]);

        rehypeMermaid()(tree);

        const div = find(tree, 'div');
        expect(div.children[0].tagName).toBe('figure');
    });

    it('transforms every fence on the page, not just the first', () => {
        const tree = root([fence('mermaid', 'graph TD;'), fence('ts', 'x'), fence('mermaid', 'pie title P')]);

        rehypeMermaid()(tree);

        expect(tree.children.map((c: any) => c.tagName)).toEqual(['figure', 'pre', 'figure']);
    });

    it('honours a custom language and className', () => {
        const tree = root([fence('mmd', 'graph TD;')]);

        rehypeMermaid({ language: 'mmd', className: 'diagram' })(tree);

        expect(tree.children[0].tagName).toBe('figure');
        expect(tree.children[0].properties.className).toEqual(['diagram']);
    });
});

describe('remarkMermaid and rehypeMermaid emit the same shell', () => {
    it('produces identical figure properties and children for the same fence', () => {
        const mdast = code('mermaid', 'graph TD;\n  A-->B;', 'title="Flow"');
        remarkMermaid()(root([mdast]));

        const hast = root([fence('mermaid', 'graph TD;\n  A-->B;\n', 'title="Flow"')]);
        rehypeMermaid()(hast);
        const figure = hast.children[0];

        expect(mdast.data.hProperties).toEqual(figure.properties);
        expect(mdast.data.hChildren).toEqual(figure.children);
    });
});
