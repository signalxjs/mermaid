#!/usr/bin/env node

/**
 * Bump the version of every non-private package under packages/.
 *
 * Usage:
 *   node scripts/bump-version.js [patch|minor|major|<exact-version>]
 *
 * Defaults to patch if no argument is given.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = join(__dirname, '..', 'packages');

const arg = process.argv[2] || 'patch';
const isExactVersion = /^\d+\.\d+\.\d+/.test(arg);
const bumpType = isExactVersion ? null : arg;
const exactVersion = isExactVersion ? arg : null;

function bumpVersion(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);
    switch (type) {
        case 'major': return `${major + 1}.0.0`;
        case 'minor': return `${major}.${minor + 1}.0`;
        case 'patch':
        default:      return `${major}.${minor}.${patch + 1}`;
    }
}

function processPackages(dir) {
    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        if (!statSync(fullPath).isDirectory()) continue;

        const pkgPath = join(fullPath, 'package.json');
        try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
            if (pkg.private) {
                console.log(`Skipping private package: ${pkg.name}`);
                continue;
            }
            const oldVersion = pkg.version;
            const newVersion = exactVersion ?? bumpVersion(oldVersion, bumpType);
            pkg.version = newVersion;
            writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
            console.log(`${pkg.name}: ${oldVersion} → ${newVersion}`);
        } catch {
            // No package.json or parse error — skip.
        }
    }
}

if (exactVersion) {
    console.log(`Setting all packages to version ${exactVersion}...\n`);
} else {
    console.log(`Bumping ${bumpType} version for packages...\n`);
}
processPackages(packagesDir);
console.log('\nDone!');
