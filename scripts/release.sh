#!/bin/bash
set -e

# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 2.1.0
#
# Bumps version in package.json and manifest.json, runs checks,
# builds, commits, and pushes. CI detects the version change and
# creates a draft GitHub release with the plugin attached.

VERSION="${1}"
if [ -z "$VERSION" ]; then
	echo "Usage: ./scripts/release.sh <version>"
	echo "Example: ./scripts/release.sh 2.1.0"
	exit 1
fi

MANIFEST="tf.josh.fxcommands.sdPlugin/manifest.json"

echo "Releasing v${VERSION}..."

# Update package.json version
npm version "$VERSION" --no-git-tag-version

# Update manifest.json plugin version (4-part format, only the one after "URL" line)
sed -i "/\"URL\"/,/\"Version\"/ s/\"Version\": \"[^\"]*\"/\"Version\": \"${VERSION}.0\"/" "$MANIFEST"

# Check and build
npm run check
npm run build

# Commit and push - CI will tag and create the release
git add package.json package-lock.json "$MANIFEST"
git commit -S -m "chore: bump version to ${VERSION}"
git push origin main

echo ""
echo "Pushed v${VERSION} - CI will create a draft release at:"
echo "https://github.com/josh-tf/fxcommands/releases"
echo ""
echo "Plugin: dist/tf.josh.fxcommands.streamDeckPlugin"
