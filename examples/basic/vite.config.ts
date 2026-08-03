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
    // mermaid is imported lazily at runtime, so Vite's dependency scanner
    // never sees it — name it for the optimizer explicitly. Without this, dev
    // serves mermaid's CJS dependencies raw (dayjs resolves to a UMD build
    // with no ESM default) and every diagram fails to render in dev.
    optimizeDeps: {
        include: ['mermaid'],
    },
});
