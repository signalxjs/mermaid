import { defineConfig } from 'vite';
import sigx from '@sigx/vite';
import { ssgPlugin } from '@sigx/ssg/vite';

export default defineConfig({
    plugins: [sigx(), ssgPlugin()],
    oxc: {
        jsx: {
            runtime: 'automatic',
            importSource: 'sigx',
        },
    },
    // mermaid drags in d3, cytoscape and katex. Excluding it from dependency
    // pre-bundling keeps the dev-server cold start fast; it is dynamically
    // imported at runtime either way, so it still lands in its own chunk.
    optimizeDeps: {
        exclude: ['mermaid'],
    },
});
