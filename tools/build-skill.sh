#!/usr/bin/env bash
# Copies the audit engine into the seo-report skill and zips it for upload to claude.ai.
# Run after changing anything in lib/: ./tools/build-skill.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SKILL=.claude/skills/seo-report
rm -rf "$SKILL/scripts/lib"
mkdir -p "$SKILL/scripts/lib" dist
cp lib/*.js "$SKILL/scripts/lib/"
rm -rf "$SKILL/scripts/assets" && mkdir -p "$SKILL/scripts/assets" && cp assets/logo-*.png "$SKILL/scripts/assets/"
rm -f dist/seo-report.zip
(cd .claude/skills && zip -qr ../../dist/seo-report.zip seo-report)
echo "Built $SKILL/scripts/lib and dist/seo-report.zip"
