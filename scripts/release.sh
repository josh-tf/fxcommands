#!/bin/bash
set -euo pipefail

# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 2.1.0
#
# Bumps version in package.json and manifest.json, runs checks,
# builds, commits, and pushes. CI detects the new version, tags it,
# and creates a draft GitHub release with the plugin attached.

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
	echo "Usage: ./scripts/release.sh <version>"
	echo "Example: ./scripts/release.sh 2.1.0"
	exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	echo "Error: version must be 3-part semver (e.g. 2.1.0), got '${VERSION}'"
	exit 1
fi

MANIFEST="plugin/manifest.json"
TAG="v${VERSION}"

# --- Preflight -------------------------------------------------------------
# This script pushes straight to main, so refuse to run from anywhere else or
# on top of uncommitted work.

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
	echo "Error: releases must be cut from main, currently on '${BRANCH}'"
	exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
	echo "Error: working tree is not clean — commit or stash first:"
	git status --short
	exit 1
fi

git fetch origin main --tags --quiet

if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
	echo "Error: local main is not in sync with origin/main — pull or push first"
	exit 1
fi

# origin is authoritative — it's what CI checks before creating a release.
# A local-only tag is usually debris from an abandoned release attempt, so warn
# rather than block, but make it visible since CI will push over the name.
if git ls-remote --exit-code --tags origin "refs/tags/${TAG}" >/dev/null 2>&1; then
	echo "Error: ${TAG} is already released on origin"
	exit 1
fi

if git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
	echo "Warning: local tag ${TAG} exists but origin does not have it."
	echo "         Leftover from an abandoned release? Delete with: git tag -d ${TAG}"
fi

CURRENT=$(node -p "require('./package.json').version")
echo "Releasing ${CURRENT} -> ${VERSION}"
read -rp "Continue? [y/N] " CONFIRM
if [[ "$CONFIRM" != [yY] ]]; then
	echo "Aborted."
	exit 1
fi

# --- Bump, verify, build ---------------------------------------------------

# Update package.json version
npm version "$VERSION" --no-git-tag-version

# Update manifest.json plugin version (4-part format, only the one after "URL" line)
sed -i "/\"URL\"/,/\"Version\"/ s/\"Version\": \"[^\"]*\"/\"Version\": \"${VERSION}.0\"/" "$MANIFEST"

# npm run check leads with version:check, which fails loudly if the sed above
# missed and package.json/manifest.json have drifted apart.
npm run check
npm run build

# --- Commit and push — CI tags and drafts the release ----------------------

git add package.json package-lock.json "$MANIFEST"
git commit -S -m "chore: bump version to ${VERSION}"
git push origin main

echo ""
echo "Pushed ${TAG} - CI will create a draft release at:"
echo "https://github.com/josh-tf/fxcommands/releases"
echo ""
echo "Plugin: dist/tf.josh.fxcommands.streamDeckPlugin"
