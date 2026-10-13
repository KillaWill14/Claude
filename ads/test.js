// Checks the copy library against Meta limits and ad-policy rules, renders every
// layout once, and confirms batches never repeat an ad: npm test
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const C = require('./lib/copy');
const { buildCreative, palettesFor, SIZES, TEMPLATES } = require('./lib/creative');
const { listBrands, loadBrand } = require('../lib/brand');
const BRANDS = listBrands();

const banned = /!|#|\bguarantee|\b\d+%|\bnumber one\b|#1/i;
const problems = [];
for (const ind of C.INDUSTRIES) {
  for (const city of ['', 'Belleville, IL', 'Edwardsville, IL']) {
    for (const h of C.HEADLINES) { const t = C.fill(h, ind, city); if (t.length > C.LIMITS.headline) problems.push(`headline too long (${t.length}): ${t}`); }
    for (const ih of C.IMAGE_HEADLINES) {
      const t = C.fill(ih.title, ind, city); if (t.length > C.LIMITS.imageTitle) problems.push(`image title too long: ${t}`);
      const s = C.fill(ih.sub, ind, city); if (s.length > C.LIMITS.imageSub) problems.push(`image sub too long: ${s}`);
    }
    const signoffs = BRANDS.flatMap(b => loadBrand(b).ads.signoffs);
    const longest = [C.HOOKS, C.OFFERS, C.CLOSERS, signoffs].map(l => Math.max(...l.map(x => C.fill(x, ind, city).length))).reduce((a, b) => a + b + 2, 0);
    if (longest > C.LIMITS.primary) problems.push(`primary text can reach ${longest} chars for ${ind.key}`);
  }
}
for (const d of C.DESCRIPTIONS) if (d.length > C.LIMITS.description) problems.push(`description too long: ${d}`);
for (const t of [...C.HOOKS, ...C.OFFERS, ...C.CLOSERS, ...C.HEADLINES, ...C.DESCRIPTIONS]) if (banned.test(t)) problems.push(`policy wording: ${t}`);
assert.deepEqual(problems, [], problems.join('\n'));

for (const b of BRANDS) for (const t of Object.keys(TEMPLATES)) for (const s of Object.keys(SIZES)) for (const p of Object.keys(palettesFor(b))) {
  const html = buildCreative({ brand: b, template: t, palette: p, size: s, title: 'Free <b>Audit</b>', sub: 'Sub', score: 54, catScores: [40, 50, 60, 70, 80, 90] });
  assert.ok(!html.includes('<b>Audit') && html.includes('&lt;b&gt;'), `${t}/${s}/${p} must escape text`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-'));
const run = () => execFileSync('node', ['generate.js', '--brand', 'boldform', '--count', '30', '--industries', 'plumbers,roofers', '--seed', '42', '--no-images', '--out', path.join(tmp, 'b')], { env: { ...process.env, AD_HISTORY: path.join(tmp, 'h.jsonl') }, cwd: __dirname }).toString();
run();
const first = JSON.parse(fs.readFileSync(path.join(tmp, 'b', 'ads.json'), 'utf8'));
run();
const second = JSON.parse(fs.readFileSync(path.join(tmp, 'b', 'ads.json'), 'utf8'));
assert.equal(first.length, 30);
const firstKeys = new Set(first.map(a => a.key));
assert.ok(second.every(a => !firstKeys.has(a.key)), 'second batch repeated an ad');
assert.ok(first.every(a => a.link.includes('utm_content=') && a.primary_text.length <= C.LIMITS.primary));
assert.ok(first.every(a => a.link.startsWith(loadBrand('boldform').ads.link) && a.ad_name.startsWith('BFM')), 'Bold Form ads must use Bold Form links and names');
assert.ok(!first.some(a => /Mid-America/.test(a.primary_text)), 'Bold Form ads must not mention Mid-America');
console.log('Ad library and generator checks passed.');
