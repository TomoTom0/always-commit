import { build } from 'esbuild';
import { chmodSync } from 'node:fs';

await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    outfile: 'dist/index.js',
    banner: {
        js: '#!/usr/bin/env node\nimport { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
    },
});

chmodSync('dist/index.js', 0o755);
