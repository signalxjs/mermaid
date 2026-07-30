import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

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
            '@sigx/mermaid': resolve(__dirname, 'packages/mermaid/src/index.ts'),
        },
    },
});
