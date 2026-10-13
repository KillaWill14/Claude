// Checks the skill's bundled engine matches lib/ (run ./tools/build-skill.sh to fix).
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert');
const root = path.join(__dirname, '..');
const bundled = path.join(root, '.claude/skills/seo-report/scripts/lib');
for (const f of fs.readdirSync(path.join(root, 'lib'))) {
  assert.equal(fs.readFileSync(path.join(bundled, f), 'utf8'), fs.readFileSync(path.join(root, 'lib', f), 'utf8'), `${f} is out of date in the skill; run ./tools/build-skill.sh`);
}
console.log('Skill engine is in sync.');
