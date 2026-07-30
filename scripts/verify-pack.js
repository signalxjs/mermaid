#!/usr/bin/env node

/**
 * @sigx/mermaid — Pre-publish pack smoke test
 *
 * Catches packaging bugs that lint/typecheck/build miss:
 *   - missing files in `files` array
 *   - broken `exports` map
 *   - dist/ produced by stale builds
 *
 * What it does:
 *   1. Build the package (delegates to `pnpm run build`).
 *   2. `pnpm pack` each non-private package under packages/ into a temp dir.
 *   3. Extract the tarball and check that every `exports` entry actually
 *      resolves to a file inside the package.
 *
 * Usage:
 *   node scripts/verify-pack.js
 *
 * No flags. Exits non-zero on any failure.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const packagesDir = join(rootDir, 'packages');

const sandbox = join(tmpdir(), `sigx-mermaid-verify-pack-${Date.now()}`);
const tarballDir = join(sandbox, 'tarballs');

function run(cmd, opts = {}) {
    console.log(`$ ${cmd}${opts.cwd ? `  (in ${opts.cwd})` : ''}`);
    execSync(cmd, { stdio: 'inherit', ...opts });
}

function step(label) {
    console.log(`\n▶  ${label}`);
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf-8'));
}

function discoverPackages() {
    if (!existsSync(packagesDir)) return [];
    const found = [];
    for (const entry of readdirSync(packagesDir)) {
        const dir = join(packagesDir, entry);
        if (!statSync(dir).isDirectory()) continue;
        const pkgJsonPath = join(dir, 'package.json');
        if (!existsSync(pkgJsonPath)) continue;
        const pkg = readJson(pkgJsonPath);
        if (pkg.private) continue;
        found.push({ name: pkg.name, version: pkg.version, path: dir, json: pkg });
    }
    return found;
}

function packPackage(pkg) {
    run('pnpm pack --pack-destination ' + JSON.stringify(tarballDir), { cwd: pkg.path });
    const tarballs = readdirSync(tarballDir).filter((f) => f.endsWith('.tgz'));
    const safeName = pkg.name.replace('@', '').replace('/', '-');
    const match = tarballs.find((f) => f.startsWith(safeName));
    if (!match) {
        throw new Error(`Could not find tarball for ${pkg.name} in ${tarballDir}`);
    }
    return join(tarballDir, match);
}

function listTarballEntries(tarball) {
    const out = execSync(`tar -tzf ${JSON.stringify(tarball)}`, { encoding: 'utf-8' });
    // Tarball entries are prefixed with "package/".
    return out
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => (l.startsWith('package/') ? l.slice('package/'.length) : l));
}

function collectExportPaths(exportsMap) {
    const paths = [];
    const visit = (node) => {
        if (typeof node === 'string') {
            if (node.startsWith('./') && !node.includes('*')) {
                paths.push(node.slice(2));
            }
            return;
        }
        if (node && typeof node === 'object') {
            for (const value of Object.values(node)) visit(value);
        }
    };
    visit(exportsMap);
    return [...new Set(paths)];
}

function verifyPackage(pkg) {
    step(`Pack ${pkg.name}@${pkg.version}`);
    const tarball = packPackage(pkg);
    const entries = new Set(listTarballEntries(tarball));
    console.log(`   📦 ${tarball}  (${entries.size} entries)`);

    const errors = [];

    // exports map: every concrete (non-glob) target must exist in the tarball.
    const expected = collectExportPaths(pkg.json.exports || {});
    for (const target of expected) {
        if (!entries.has(target)) {
            errors.push(`exports target missing from tarball: ${target}`);
        }
    }

    // package.json types/main/module must exist if set.
    for (const field of ['main', 'module', 'types', 'typings']) {
        const value = pkg.json[field];
        if (typeof value === 'string') {
            const target = value.replace(/^\.\//, '');
            if (!entries.has(target)) {
                errors.push(`${field} target missing from tarball: ${target}`);
            }
        }
    }

    if (errors.length) {
        console.error(`\n❌ ${pkg.name}: pack verification failed`);
        for (const e of errors) console.error(`   - ${e}`);
        return false;
    }
    console.log(`   ✅ ${pkg.name}: tarball shape OK`);
    return true;
}

function main() {
    step(`Sandbox: ${sandbox}`);
    mkdirSync(tarballDir, { recursive: true });

    step('Build all packages');
    run('pnpm run build', { cwd: rootDir });

    const packages = discoverPackages();
    if (packages.length === 0) {
        console.log('No publishable packages found.');
        return;
    }

    let ok = true;
    for (const pkg of packages) {
        if (!verifyPackage(pkg)) ok = false;
    }

    if (!ok) {
        console.error(`\n❌ Pack smoke test failed. Sandbox preserved: ${sandbox}`);
        process.exit(1);
    }

    step('✅ Pack smoke test passed');
}

try {
    main();
    rmSync(sandbox, { recursive: true, force: true });
} catch (err) {
    console.error('\n❌ Pack smoke test failed:', err.message);
    console.error(`   Sandbox preserved for inspection: ${sandbox}`);
    process.exitCode = 1;
    process.exit(1);
}
