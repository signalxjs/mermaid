import { defineSSGConfig } from '@sigx/ssg';
import { rehypeMermaid } from '@sigx/mermaid/ssg';

export default defineSSGConfig({
    site: {
        title: '@sigx/mermaid example',
        description: 'Mermaid diagrams in an @sigx/ssg site',
        url: 'https://mermaid.example',
    },

    markdown: {
        // The two halves of the integration.
        //
        // `skipLanguages` is what makes this possible at all: shiki would
        // otherwise claim the fence and replace it with highlighted markup,
        // leaving nothing for the rehype plugin to find. Site rehype plugins
        // run *after* shiki, so the ordering works out.
        shiki: { skipLanguages: ['mermaid'] },
        rehypePlugins: [rehypeMermaid],
    },

    // The mermaid stylesheet is cosmetic; the client entry is what renders
    // diagrams. global.css declares `color-scheme`, which is how @sigx/mermaid
    // decides between the light and dark mermaid themes.
    //
    // mermaid-config must come BEFORE the client entry — the client installs
    // itself on import, so configuration has to be in place first.
    clientImports: [
        '@sigx/ssg/styles.css',
        './src/styles/global.css',
        '@sigx/mermaid/styles',
        './src/mermaid-config',
        '@sigx/mermaid/client',
    ],
});
