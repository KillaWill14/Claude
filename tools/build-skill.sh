#!/usr/bin/env bash
# Builds the per-brand audit skills (seo-report, boldform-seo-report) from tools/skill/
# and zips each for upload to claude.ai. Run after changing lib/, brands/ or tools/skill/.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/skill/build.js
