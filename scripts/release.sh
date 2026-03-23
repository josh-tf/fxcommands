#!/bin/bash
set -e

# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 2.1.0

VERSION="${1}"
if [ -z "$VERSION" ]; then
	echo "Usage: ./scripts/release.sh <version>"
	echo "Example: ./scripts/release.sh 2.1.0"
	exit 1
fi

TAG="v${VERSION}"
MANIFEST="tf.josh.fxcommands.sdPlugin/manifest.json"

echo "Releasing ${TAG}..."

# Update package.json version
npm version "$VERSION" --no-git-tag-version

# Update manifest.json version (4-part format)
sed -i "s/\"Version\": \"[^\"]*\"/\"Version\": \"${VERSION}.0\"/" "$MANIFEST"

# Check and build
npm run check
npm run build

# Commit, tag, push
git add package.json package-lock.json "$MANIFEST"
git commit -S -m "chore: bump version to ${VERSION}"
git tag -s "$TAG" -m "$TAG"
git push origin main
git push origin "$TAG"

echo ""
echo "Released ${TAG}"
echo "Draft release will be created by CI at:"
echo "https://github.com/josh-tf/fxcommands/releases"
echo ""
echo "Plugin: dist/tf.josh.fxcommands.streamDeckPlugin"
