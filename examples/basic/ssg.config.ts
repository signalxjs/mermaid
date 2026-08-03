import { defineSSGConfig } from '@sigx/ssg';
import { remarkMermaid } from '@sigx/mermaid/ssg';

export default defineSSGConfig({
    site: {
        title: '@sigx/mermaid example',
        description: 'Mermaid diagrams in an @sigx/ssg site',
        url: 'https://mermaid.example',
    },

    markdown: {
        // remarkMermaid claims ` ```mermaid ` fences on the markdown tree,
        // before HTML conversion — nothing downstream of it ever sees the
        // fence, so no other pipeline configuration is needed.
        remarkPlugins: [remarkMermaid],
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
