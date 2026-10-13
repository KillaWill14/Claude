#!/usr/bin/env node
// Generates a batch of Facebook/Instagram ads for the free website audit.
//
//   node generate.js --count 100 [--brand midamerica|boldform] [--industries plumbers,roofers | all]
//     [--cities "Belleville, IL;O'Fallon, IL"] [--sizes square,story]
//     [--templates scorecard,ring,stand,headline] [--palettes brand,light,navy]
//     [--ai] [--ai-share 0.5] [--link URL] [--out DIR] [--seed N] [--no-images]
//
// Writes ads.csv, ads.json, preview.html and images/ to the output folder, and
// records every ad in history-<brand>.jsonl so later batches never repeat one.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('./lib/copy');
const { buildCreative, palettesFor, SIZES, TEMPLATES } = require('./lib/creative');
const { loadBrand, DEFAULT_BRAND } = require('../lib/brand');

const historyFile = brand => process.env.AD_HISTORY || path.join(__dirname, `history-${brand.key}.jsonl`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function list(value, all, name) {
  if (!value || value === 'all' || value === true) return all;
  const picked = String(value).split(',').map(s => s.trim()).filter(Boolean);
  const unknown = picked.filter(p => !all.includes(p));
  if (unknown.length) throw new Error(`Unknown ${name}: ${unknown.join(', ')}. Choose from: ${all.join(', ')}`);
  return picked;
}

function readHistory(HISTORY) {
  const keys = new Set();
  const hooks = [];
  if (fs.existsSync(HISTORY)) {
    for (const line of fs.readFileSync(HISTORY, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { const h = JSON.parse(line); keys.add(h.key); if (h.hook) hooks.push(h.hook); } catch { /* skip bad line */ }
    }
  }
  return { keys, hooks };
}

const keyOf = ad => crypto.createHash('sha1').update([ad.primary_text, ad.headline, ad.description, ad.industry, ad.city].join('|')).digest('hex').slice(0, 16);

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function previewPage(ads, sizes, brand) {
  const ICON = brand.logo('icon') || '';
  const AGENCY = { name: brand.name };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const label = { LEARN_MORE: 'Learn more', GET_OFFER: 'Get offer', SIGN_UP: 'Sign up' };
  const img = sizes.includes('square') ? 'image_square' : `image_${sizes[0]}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(brand.name)} Ad Batch</title>
<style>
:root{--bg:#f0f2f5;--card:#fff;--ink:#1c1e21;--muted:#65676b;--line:#dadde1}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#18191a;--card:#242526;--ink:#e4e6eb;--muted:#b0b3b8;--line:#3e4042;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#18191a;--card:#242526;--ink:#e4e6eb;--muted:#b0b3b8;--line:#3e4042;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:20px 16px 4px;max-width:1300px;margin:auto}h1{margin:0;font-size:22px}header p{color:var(--muted);margin:4px 0 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding:16px;max-width:1300px;margin:auto}
.ad{background:var(--card);border-radius:8px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.2);display:flex;flex-direction:column;min-width:0}
.top{display:flex;gap:8px;align-items:center;padding:12px 12px 0}.av{width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:#fff;object-fit:cover;flex:none}
.top b{display:block}.top small{color:var(--muted)}
.txt{padding:8px 12px 12px;white-space:pre-line}
.ad .creative{width:100%;display:block;border-block:1px solid var(--line)}
.foot{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--bg)}
.foot div{min-width:0}.foot small{color:var(--muted);text-transform:uppercase;font-size:11px}.foot strong{display:block}.foot span{color:var(--muted)}
.cta{background:var(--line);border-radius:6px;padding:8px 12px;font-weight:600;white-space:nowrap}
.meta{padding:6px 12px 10px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
</style></head><body><header><h1>${ads.length} ads</h1><p>Generated ${new Date().toLocaleString('en-US')}. This is how each ad will look in the Facebook feed.</p></header><div class="grid">
${ads.map(a => `<article class="ad"><div class="top"><img class="av" src="${ICON}" alt=""><div><b>${esc(AGENCY.name)}</b><small>Sponsored</small></div></div>
<div class="txt">${esc(a.primary_text)}</div>
${a[img] ? `<img class="creative" src="${esc(a[img])}" alt="" loading="lazy">` : ''}
<div class="foot"><div><small>${esc(new URL(a.link).hostname)}</small><strong>${esc(a.headline)}</strong><span>${esc(a.description)}</span></div><span class="cta">${label[a.cta]}</span></div>
<div class="meta">${esc(a.id)} · ${esc(a.industry)}${a.city ? ` · ${esc(a.city)}` : ''} · ${esc(a.template)}/${esc(a.palette)} · ${a.copy_source}</div></article>`).join('\n')}
</div></body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const brand = loadBrand(args.brand || DEFAULT_BRAND);
  const HISTORY = historyFile(brand);
  const count = Math.max(1, parseInt(args.count || '20', 10));
  const industryKeys = list(args.industries, C.INDUSTRIES.map(i => i.key), 'industry');
  const industries = industryKeys.map(k => C.INDUSTRIES.find(i => i.key === k));
  const cities = args.cities ? String(args.cities).split(';').map(s => s.trim()).filter(Boolean) : [];
  const sizes = list(args.sizes || 'square,story', Object.keys(SIZES), 'size');
  const templates = list(args.templates, Object.keys(TEMPLATES), 'template');
  const palettes = list(args.palettes, Object.keys(palettesFor(brand.key)), 'palette');
  const seed = parseInt(args.seed || String(Date.now() % 2147483647), 10);
  const rand = rng(seed);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const link = args.link || process.env.AD_LINK || brand.ads.link;
  const date = new Date().toISOString().slice(0, 10);
  const outDir = path.resolve(args.out || path.join(__dirname, '..', 'out', 'ads', `${brand.key}-${date}-${seed}`));
  fs.mkdirSync(path.join(outDir, 'images'), { recursive: true });

  const history = readHistory(HISTORY);

  // Optional Claude-written copy, a pool per industry.
  const aiPool = {};
  const aiShare = args.ai ? Math.min(1, Math.max(0, parseFloat(args['ai-share'] ?? '0.5'))) : 0;
  if (aiShare > 0) {
    const { writeAds, MODEL } = require('./lib/ai');
    const perIndustry = Math.min(25, Math.ceil((count * aiShare) / industries.length) + 2);
    console.log(`Writing fresh copy with ${MODEL} (${perIndustry} per industry)...`);
    await Promise.all(industries.map(async ind => {
      aiPool[ind.key] = await writeAds({ brand, industry: ind, city: cities.length === 1 ? cities[0] : '', count: perIndustry, avoid: history.hooks });
    }));
  }

  const ads = [];
  const seen = new Set(history.keys);
  let attempts = 0;
  while (ads.length < count && attempts < count * 50) {
    attempts++;
    const industry = industries[ads.length % industries.length];
    const city = cities.length ? cities[Math.floor(ads.length / industries.length) % cities.length] : '';
    const fillT = t => C.fill(t, industry, city);
    const pool = aiPool[industry.key] || [];
    const useAi = pool.length && rand() < aiShare;
    let parts;
    if (useAi) {
      const a = pool[Math.floor(rand() * pool.length)];
      parts = { hook: a.hook, offer: a.offer, closer: a.closer, headline: a.headline, description: a.description, title: a.image_title, sub: a.image_sub, source: 'claude' };
    } else {
      const ih = pick(C.IMAGE_HEADLINES);
      parts = { hook: fillT(pick(C.HOOKS)), offer: pick(C.OFFERS), closer: pick(C.CLOSERS), headline: fillT(pick(C.HEADLINES)), description: pick(C.DESCRIPTIONS), title: fillT(ih.title), sub: fillT(ih.sub), source: 'library' };
    }
    if (parts.headline.length > C.LIMITS.headline) parts.headline = 'Free Website Audit';
    if (parts.title.length > C.LIMITS.imageTitle) parts.title = 'Free Website Audit';
    const signoff = parts.source === 'library' ? pick(brand.ads.signoffs) : '';
    const primary = [parts.hook, parts.offer, parts.closer, signoff].filter(Boolean).join('\n\n');
    if (primary.length > C.LIMITS.primary) continue;

    const ad = { industry: industry.key, city, primary_text: primary, headline: parts.headline, description: parts.description };
    ad.key = keyOf(ad);
    if (seen.has(ad.key)) continue;
    seen.add(ad.key);

    const n = String(ads.length + 1).padStart(3, '0');
    const id = `${brand.code.toLowerCase()}-${date.replace(/-/g, '')}-${seed.toString(36)}-${n}`;
    const template = pick(templates);
    const palette = pick(palettes);
    const score = 38 + Math.floor(rand() * 30);
    const catScores = Array.from({ length: 6 }, () => Math.max(22, Math.min(96, score + Math.round((rand() - 0.35) * 70))));
    const utm = new URLSearchParams({ utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'free-website-audit', utm_content: id, utm_term: industry.key });
    ads.push({
      id,
      ad_name: `${brand.code} | Free Audit | ${industry.Plural}${city ? ` | ${city}` : ''} | ${template}-${palette} | ${id}`,
      ...ad,
      hook: parts.hook,
      cta: pick(C.CTAS),
      link: `${link}${link.includes('?') ? '&' : '?'}${utm}`,
      template, palette, score, catScores,
      image_title: parts.title, image_sub: parts.sub,
      copy_source: parts.source,
    });
  }
  if (ads.length < count) console.warn(`Only ${ads.length} new unique ads were possible with these settings. Add industries or cities, or use --ai for more variety.`);

  if (!args['no-images']) {
    const { createRenderer } = require('./lib/render');
    const renderer = await createRenderer();
    try {
      for (const [i, ad] of ads.entries()) {
        for (const size of sizes) {
          const rel = `images/${ad.id}-${size}.png`;
          const html = buildCreative({ brand: brand.key, template: ad.template, palette: ad.palette, size, title: ad.image_title, sub: ad.image_sub, score: ad.score, catScores: ad.catScores});
          await renderer.render(html, size, path.join(outDir, rel));
          ad[`image_${size}`] = rel;
        }
        if ((i + 1) % 25 === 0) console.log(`  rendered ${i + 1}/${ads.length}`);
      }
    } finally {
      await renderer.close();
    }
  }

  const cols = ['id', 'ad_name', 'industry', 'city', 'primary_text', 'headline', 'description', 'cta', 'link', 'image_square', 'image_portrait', 'image_story', 'template', 'palette', 'copy_source'];
  fs.writeFileSync(path.join(outDir, 'ads.csv'), [cols.join(','), ...ads.map(a => cols.map(c => csvCell(a[c])).join(','))].join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'ads.json'), JSON.stringify(ads, null, 2));
  fs.writeFileSync(path.join(outDir, 'preview.html'), previewPage(ads, sizes, brand));
  fs.appendFileSync(HISTORY, ads.map(a => JSON.stringify({ key: a.key, id: a.id, hook: a.hook, date })).join('\n') + (ads.length ? '\n' : ''));

  const bySource = ads.reduce((m, a) => ({ ...m, [a.copy_source]: (m[a.copy_source] || 0) + 1 }), {});
  console.log(`${brand.name}: created ${ads.length} ads (${Object.entries(bySource).map(([k, v]) => `${v} ${k}`).join(', ')}) in ${outDir}`);
  console.log(`  Review: ${path.join(outDir, 'preview.html')}`);
  console.log(`  Upload: ${path.join(outDir, 'ads.csv')}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
