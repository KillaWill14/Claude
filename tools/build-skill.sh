#!/usr/bin/env bash
# Copies the audit engine and brand files into the seo-report skill and zips it for upload to claude.ai.
# Run after changing anything in lib/: ./tools/build-skill.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SKILL=.claude/skills/seo-report
rm -rf "$SKILL/scripts/lib"
mkdir -p "$SKILL/scripts/lib" dist
cp lib/*.js "$SKILL/scripts/lib/"
rm -rf "$SKILL/scripts/assets" "$SKILL/scripts/brands"
for dir in brands/*/; do
  b=$(basename "$dir")
  mkdir -p "$SKILL/scripts/brands/$b"
  cp "$dir"brand.json "$dir"logo-*.png "$SKILL/scripts/brands/$b/"
done
rm -f dist/seo-report.zip
(cd .claude/skills && zip -qr ../../dist/seo-report.zip seo-report)
echo "Built $SKILL/scripts/lib and dist/seo-report.zip"
