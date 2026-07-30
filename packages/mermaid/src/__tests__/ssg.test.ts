import { describe, it, expect } from 'vitest';
import { rehypeMermaid } from '../ssg';

/** Minimal hast builders — enough to stand in for what rehype hands the plugin. */
const text = (value: string) => ({ type: 'text', value }) as any;
const el = (tagName: string, properties: Record<string, unknown>, children: any[], data?: unknown) =>
    ({ type: 'element', tagName, properties, children, ...(data ? { data } : {}) }) as any;

const fence = (lang: string, source: string, meta?: string) =>
    el('pre', {}, [el('code', { className: [`language-${lang}`] }, [text(source)], meta ? { meta } : undefined)]);

const root = (children: any[]) => ({ type: 'root', children }) as any;

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
        // The trailing newline mdast leaves on a fence would show up as a blank
        // line in the fallback, and mermaid does not need it.
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
