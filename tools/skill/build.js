// Builds one audit skill per brand from tools/skill/ and zips each for claude.ai.
// Each skill bundles the audit engine (lib/), the shared run.js and only its own brand.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const skills = JSON.parse(fs.readFileSync(path.join(__dirname, 'skills.json'), 'utf8'));
const template = fs.readFileSync(path.join(__dirname, 'SKILL.template.md'), 'utf8');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

for (const s of skills) {
  const brand = JSON.parse(fs.readFileSync(path.join(root, 'brands', s.brand, 'brand.json'), 'utf8'));
  for (const v of Object.values(s)) if (/[<>]/.test(v)) throw new Error(`${s.dir}: angle brackets are not allowed in skill metadata`);
  const dir = path.join(root, '.claude', 'skills', s.dir);
  fs.rmSync(path.join(dir, 'scripts'), { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  const md = template
    .replaceAll('{{SKILL_NAME}}', s.dir)
    .replaceAll('{{DESCRIPTION}}', s.description)
    .replaceAll('{{TITLE}}', s.title)
    .replaceAll('{{BRAND_NAME}}', brand.name)
    .replaceAll('{{BRAND_KEY}}', s.brand)
    .replaceAll('{{OTHER_SKILL_NOTE}}', s.otherNote);
  if (/\{\{/.test(md)) throw new Error(`${s.dir}: unfilled placeholder in SKILL.md`);
  fs.writeFileSync(path.join(dir, 'SKILL.md'), md);
  fs.copyFileSync(path.join(__dirname, 'run.js'), path.join(dir, 'scripts', 'run.js'));
  for (const f of fs.readdirSync(path.join(root, 'lib'))) fs.copyFileSync(path.join(root, 'lib', f), path.join(dir, 'scripts', 'lib', f));
  const bdir = path.join(dir, 'scripts', 'brands', s.brand);
  fs.mkdirSync(bdir, { recursive: true });
  for (const f of fs.readdirSync(path.join(root, 'brands', s.brand))) {
    if (f === 'brand.json' || /^logo-.*\.png$/.test(f)) fs.copyFileSync(path.join(root, 'brands', s.brand, f), path.join(bdir, f));
  }
  const zip = path.join(root, 'dist', `${s.dir}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qr', zip, s.dir], { cwd: path.join(root, '.claude', 'skills') });
  console.log(`Built ${s.dir} (${brand.name}) -> dist/${s.dir}.zip`);
}
