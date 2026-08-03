/**
 * End-to-end build test: builds `examples/basic` through the real @sigx/ssg
 * production pipeline and asserts on the emitted files.
 *
 * This is the only test that exercises the part unit tests cannot see — that
 * the plugin's figure shell survives the real markdown pipeline, MDX
 * compilation and SSR, that other fences come out untouched, and that mermaid
 * stays out of the entry chunk.
 *
 * Requires `packages/mermaid/dist` (the example resolves `@sigx/mermaid`
 * through the workspace link's exports map). CI builds first; the suite skips
 * with a notice otherwise.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const PKG_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const REPO_ROOT = path.resolve(PKG_ROOT, '../..');
const EXAMPLE_DIR = path.join(REPO_ROOT, 'examples', 'basic');
const DIST = path.join(EXAMPLE_DIR, 'dist');

const distBuilt = fs.existsSync(path.join(PKG_ROOT, 'dist', 'ssg.js'));
if (!distBuilt) {
    console.warn('[example-e2e] packages/mermaid/dist not built — skipping e2e build test (run `pnpm build` first)');
}

function read(...segments: string[]): string {
    return fs.readFileSync(path.join(DIST, ...segments), 'utf-8');
}

describe.skipIf(!distBuilt)('examples/basic — end-to-end production build', () => {
    let home = '';
    let second = '';

    beforeAll(async () => {
        fs.rmSync(DIST, { recursive: true, force: true });
        await execFileAsync(process.execPath, ['build.mjs'], { cwd: EXAMPLE_DIR, timeout: 300_000 });
        home = read('index.html');
        second = read('second', 'index.html');
    }, 320_000);

    it('emits the figure shell for a mermaid fence', () => {
        expect(home).toContain('<figure class="sigx-mermaid" data-sigx-mermaid=""');
        expect(home).toContain('class="sigx-mermaid-source"');
    });

    it('keeps the diagram source in the HTML as the no-JS fallback', () => {
        // Escaped, because it went through MDX and the SSR serializer — this is
        // the text the client enhancer reads back out.
        expect(home).toContain('Payment --&gt;|authorised| Confirm');
    });

    it('lifts the fence `title=` meta into a caption', () => {
        expect(home).toContain('<figcaption class="sigx-mermaid-caption">Checkout</figcaption>');
        expect(home).toContain('data-mermaid-title="Checkout"');
        // …and a fence without the meta gets none.
        expect(home.match(/sigx-mermaid-caption/g)?.length).toBe(2);
    });

    it('claims mermaid fences and nothing else', () => {
        // The page also has a .ts fence. It must come out untouched by us and
        // fully rendered by whatever the site uses for code — proof the plugin
        // does not over-claim.
        expect(home).toContain('code-window');
        const figure = /<figure class="sigx-mermaid"[\s\S]*?<\/figure>/.exec(home)?.[0] ?? '';
        expect(figure).not.toContain('code-window');
        expect(figure).not.toContain('language-mermaid');
    });

    it('renders every diagram on a page, and on other pages', () => {
        // flowchart + sequence + state + pie — but not the .ts fence.
        expect(home.match(/data-sigx-mermaid/g)?.length).toBe(4);
        expect(second).toContain('data-sigx-mermaid');
    });

    it('ships an invalid diagram as source rather than failing the build', () => {
        expect(second).toContain('this is not )( valid mermaid');
    });

    it('keeps mermaid out of the entry chunk', () => {
        const assets = fs.readdirSync(path.join(DIST, 'assets'));
        const mermaidChunk = assets.find((file) => /^mermaid.*\.js$/.test(file));
        expect(mermaidChunk, 'mermaid should be code-split into its own chunk').toBeDefined();
        // A page must not preload it: ~200 kB gzipped that only a reader who
        // scrolls to a diagram should ever pay for.
        expect(home).not.toContain(mermaidChunk!);
    });
});
