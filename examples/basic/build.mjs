/**
 * Programmatic production build — the example (and the e2e test in
 * packages/mermaid) needs no CLI dependency. With @sigx/cli installed you can
 * run `npx sigx ssg build` instead.
 */
import { build } from '@sigx/ssg/build';

await build({});
