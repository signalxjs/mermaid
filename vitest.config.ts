import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

// `import.meta.dirname`, not `__dirname`: Vite's current config loader injects
// `__dirname`, but the `native` loader — slated to become the default — does
// not, and warns about it today.
const dirname = import.meta.dirname;

// JSX must compile to the sigx automatic runtime (the same settings the library
// build uses), so tests can import the TSX component.
export default defineConfig({
    oxc: {
        jsx: {
            runtime: 'automatic',
            importSource: 'sigx',
        },
    },
    test: {
        // The client enhancer and the component are DOM-driven end to end.
        environment: 'happy-dom',
        include: ['packages/*/src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['**/node_modules/**'],
        globals: true,
        passWithNoTests: true,
    },
    resolve: {
        alias: {
            '@sigx/mermaid': resolve(dirname, 'packages/mermaid/src/index.ts'),
        },
    },
});
