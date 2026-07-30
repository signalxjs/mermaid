#!/usr/bin/env node

/**
 * @sigx/mermaid — Publish Script
 *
 * Walks every non-private package under packages/, builds it, and publishes to
 * npm. Skips a package if its current version is already on the registry.
 *
 * Usage:
 *   node scripts/publish.js [--dry-run] [--tag <tag>] [--provenance]
 *
 * Options:
 *   --dry-run       Run `pnpm pack --dry-run` instead of `pnpm publish`.
 *   --tag <tag>     Publish under an npm dist-tag (e.g. beta, next).
 *   --provenance    Attach an npm provenance attestation. Requires running in a
 *                   GitHub Actions workflow with `permissions: id-token: write`.
 *
 * Environment Variables:
 *   NPM_TOKEN    npm automation token. Optional — only needed for local
 *                publishing or as a fallback. CI uses npm trusted publishing
 *                (OIDC) instead, configured per-package on npmjs.com.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const packagesDir = join(rootDir, 'packages');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const provenance= args.includes('--provenance') || process.env.NPM_CONFIG_PROVENANCE === 'true';
const tagIndex = args.indexOf('--tag');
const tag = tagIndex !== -1 ? args[tagIndex + 1] : null;

const NPM_TOKEN = process.env.NPM_TOKEN;
const npmrcPath = join(homedir(), '.npmrc');
let npmrcCreated = false;
let originalNpmrc = null;

function setupNpmToken() {
    if (!NPM_TOKEN) return;
    console.log('🔑 Using NPM_TOKEN for authentication\n');

    if (existsSync(npmrcPath)) {
        originalNpmrc = readFileSync(npmrcPath, 'utf-8');
    }
    const tokenLine = `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`;
    if (originalNpmrc?.includes('//registry.npmjs.org/:_authToken=')) {
        writeFileSync(
            npmrcPath,
            originalNpmrc.replace(/\/\/registry\.npmjs\.org\/:_authToken=.*/, tokenLine)
        );
    } else if (originalNpmrc) {
        writeFileSync(npmrcPath, originalNpmrc + '\n' + tokenLine);
    } else {
        writeFileSync(npmrcPath, tokenLine);
    }
    npmrcCreated = true;
}

function cleanupNpmToken() {
    if (!npmrcCreated) return;
    if (originalNpmrc !== null) {
        writeFileSync(npmrcPath, originalNpmrc);
    } else if (existsSync(npmrcPath)) {
        unlinkSync(npmrcPath);
    }
    npmrcCreated = false;
}

let signalsRegistered = false;
function registerCleanupHandlers() {
    if (signalsRegistered) return;
    signalsRegistered = true;
    const handle = (signal) => {
        try { cleanupNpmToken(); } catch (err) {
            console.error('⚠️  Failed to clean up ~/.npmrc on exit:', err);
        }
        const code = signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
        process.exit(code);
    };
    process.on('SIGINT', () => handle('SIGINT'));
    process.on('SIGTERM', () => handle('SIGTERM'));
    process.on('uncaughtException', (err) => {
        console.error('💥 Uncaught exception:', err);
        handle('uncaughtException');
    });
    process.on('unhandledRejection', (err) => {
        console.error('💥 Unhandled rejection:', err);
        handle('unhandledRejection');
    });
}

function discoverPackages() {
    if (!existsSync(packagesDir)) return [];
    const found = [];
    for (const entry of readdirSync(packagesDir)) {
        const dir = join(packagesDir, entry);
        if (!statSync(dir).isDirectory()) continue;
        const pkgJsonPath = join(dir, 'package.json');
        if (!existsSync(pkgJsonPath)) continue;
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
        if (pkg.private) {
            console.log(`⏭️  Skipping private package: ${pkg.name}`);
            continue;
        }
        found.push({ name: pkg.name, version: pkg.version, path: dir });
    }
    return found;
}

function isAlreadyPublished(name, version) {
    try {
        const out = execSync(`npm view ${name}@${version} version`, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe']
        }).trim();
        return out === version;
    } catch {
        return false;
    }
}

function publishPackage(pkg) {
    console.log(`\n📦 ${dryRun ? 'Would publish' : 'Publishing'}: ${pkg.name}@${pkg.version}`);
    console.log(`   Path: ${pkg.path}`);

    if (!dryRun && isAlreadyPublished(pkg.name, pkg.version)) {
        console.log(`   ⏭️  Skipped: ${pkg.name}@${pkg.version} (already published)`);
        return 'skipped';
    }

    const cmd = dryRun
        ? 'pnpm pack --dry-run'
        : `pnpm publish --access public --no-git-checks${tag ? ` --tag ${tag}` : ''}${provenance ? ' --provenance' : ''}`;

    try {
        execSync(cmd, { cwd: pkg.path, stdio: 'inherit' });
        console.log(`   ✅ ${dryRun ? 'Ready' : 'Published'}: ${pkg.name}@${pkg.version}`);
        return 'published';
    } catch {
        console.error(`   ❌ Failed: ${pkg.name}`);
        return 'failed';
    }
}

async function main() {
    console.log('🚀 @sigx/mermaid publisher');
    console.log('================================');
    if (dryRun) console.log('🔍 DRY RUN — nothing will be published\n');
    if (tag) console.log(`🏷️  Dist-tag: ${tag}\n`);
    if (provenance) console.log('🔏 Provenance attestations enabled\n');

    registerCleanupHandlers();
    setupNpmToken();

    const isTrustedPublishing = !NPM_TOKEN && !!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (isTrustedPublishing) {
        console.log('🔐 Trusted publishing (OIDC) — skipping npm whoami precheck\n');
    } else if (!dryRun) {
        try {
            const whoami = execSync('npm whoami', { encoding: 'utf-8' }).trim();
            console.log(`👤 Logged in as: ${whoami}\n`);
        } catch {
            console.error('❌ Not logged in to npm. Run: npm login');
            console.error('   Or set NPM_TOKEN environment variable');
            throw new Error('npm login required');
        }
    }

    console.log('🔨 Building all packages...');
    try {
        execSync('pnpm run build', { cwd: rootDir, stdio: 'inherit' });
        console.log('✅ Build complete\n');
    } catch {
        throw new Error('Build failed');
    }

    const packages = discoverPackages();
    if (packages.length === 0) {
        console.log('No packages to publish.');
        return;
    }

    const results = { published: [], skipped: [], failed: [] };
    for (const pkg of packages) {
        const result = publishPackage(pkg);
        results[result].push(pkg.name);
        if (result === 'failed' && !dryRun) {
            console.error('\n⚠️  Stopping due to publish failure');
            break;
        }
    }

    console.log('\n================================');
    console.log('📊 Summary');
    console.log('================================');
    if (results.published.length) {
        console.log(`✅ ${dryRun ? 'Ready' : 'Published'}: ${results.published.length} packages`);
        console.log(`   ${results.published.join(', ')}`);
    }
    if (results.skipped.length) {
        console.log(`⏭️  Skipped: ${results.skipped.length} packages (already published)`);
    }
    if (results.failed.length) {
        console.log(`❌ Failed: ${results.failed.length} packages`);
        console.log(`   ${results.failed.join(', ')}`);
    }
    if (!dryRun && results.failed.length === 0) {
        console.log('\n🎉 All packages up to date!');
    }
    if (results.failed.length > 0) {
        process.exitCode = 1;
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => {
        cleanupNpmToken();
    });
