#!/usr/bin/env node
/**
 * Verifies package.json and plugin/manifest.json agree on the version.
 *
 * Stream Deck manifests use a 4-part version, so the manifest is expected to be
 * the package version with a trailing ".0" (e.g. 2.0.4 -> 2.0.4.0). release.sh
 * patches both, and this guards against that patch silently missing.
 */

import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("../plugin/manifest.json", import.meta.url), "utf8"));

const expected = `${pkg.version}.0`;

if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
	console.error(`package.json version "${pkg.version}" is not a 3-part semver`);
	process.exit(1);
}

if (manifest.Version !== expected) {
	console.error(`Version mismatch:`);
	console.error(`  package.json          ${pkg.version}`);
	console.error(`  plugin/manifest.json  ${manifest.Version}  (expected ${expected})`);
	process.exit(1);
}

console.log(`Version OK: ${pkg.version} / ${manifest.Version}`);
