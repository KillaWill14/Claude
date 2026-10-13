// Checks every per-brand audit skill is built from the current lib/, run.js and
// brand files (run ./tools/build-skill.sh to fix), and that each defaults to its brand.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const same = (a, b, msg) => assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)), `${msg} is out of date; run ./tools/build-skill.sh`);
const skills = JSON.parse(fs.readFileSync(path.join(root, 'tools/skill/skills.json'), 'utf8'));
const pages = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-pages-'));
fs.copyFileSync(path.join(__dirname, 'fixture/index.html'), path.join(pages, 'homepage.html'));

for (const s of skills) {
  const dir = path.join(root, '.claude/skills', s.dir, 'scripts');
  for (const f of fs.readdirSync(path.join(root, 'lib'))) same(path.join(dir, 'lib', f), path.join(root, 'lib', f), `${s.dir}: lib/${f}`);
  same(path.join(dir, 'run.js'), path.join(root, 'tools/skill/run.js'), `${s.dir}: run.js`);
  same(path.join(dir, 'brands', s.brand, 'brand.json'), path.join(root, 'brands', s.brand, 'brand.json'), `${s.dir}: brand.json`);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'brands')), [s.brand], `${s.dir} must bundle only its own brand`);
  const md = fs.readFileSync(path.join(root, '.claude/skills', s.dir, 'SKILL.md'), 'utf8');
  assert.ok(md.startsWith(`---\nname: ${s.dir}\n`), `${s.dir}: SKILL.md frontmatter`);
  assert.ok(!/[<>]/.test(md.split('---')[1]), `${s.dir}: description must not contain angle brackets`);

  const out = fs.mkdtempSync(path.join(os.tmpdir(), `${s.dir}-`));
  const log = execFileSync('node', [path.join(dir, 'run.js'), 'example-plumber.test', '--pages', pages, '--out', out], { env: { ...process.env, BRAND: '' } }).toString();
  const name = JSON.parse(fs.readFileSync(path.join(root, 'brands', s.brand, 'brand.json'), 'utf8')).name;
  assert.match(log, new RegExp(`Branded for: ${name}`), `${s.dir} should default to ${name}`);
}
console.log(`Skills in sync: ${skills.map(s => s.dir).join(', ')}.`);
