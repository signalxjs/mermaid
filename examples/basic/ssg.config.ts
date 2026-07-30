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

    // The stylesheet is cosmetic; the client entry is what renders diagrams.
    clientImports: ['@sigx/ssg/styles.css', '@sigx/mermaid/styles', '@sigx/mermaid/client'],
});
