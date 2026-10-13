#!/usr/bin/env node
// Runs a website audit and writes the report files, branded for the chosen agency.
//
//   node run.js <website> [--brand midamerica|boldform] [--city "Wichita, KS"] [--name "Business"] [--rating 4.6]
//     [--reviews 37] [--profile yes|no] [--newest-review-days 12] [--maps-url URL]
//     [--competitor "Name | 4.7 | 212"] (repeat for up to three competitors)
//     [--pagespeed psi.json] [--pages DIR] [--out DIR]
//
// --pages DIR audits pages you fetched yourself instead of fetching them here.
// DIR holds homepage.html plus, when they exist on the site, robots.txt,
// sitemap.xml and llms.txt (a missing file means the site does not have it).

const fs = require('node:fs');
const path = require('node:path');
const { runAudit } = require('./lib/audit');
const { parsePagespeed } = require('./lib/google');
const { renderReport } = require('./lib/report');
const { loadBrand, listBrands, DEFAULT_BRAND } = require('./lib/brand');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = key === 'competitor' ? [...(out[key] || []), next] : next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function pagesGetter(dir, siteUrl) {
  const files = { '/': 'homepage.html', '/robots.txt': 'robots.txt', '/sitemap.xml': 'sitemap.xml', '/llms.txt': 'llms.txt' };
  const home = new URL(siteUrl);
  return async url => {
    const u = new URL(url);
    const name = u.host === home.host && u.protocol === home.protocol ? files[u.pathname] : null;
    const file = name && path.join(dir, name);
    if (!file || !fs.existsSync(file)) return { ok: false, status: u.host === home.host && name ? 404 : 0, url, headers: {}, body: '', bytes: 0, ms: null };
    const body = fs.readFileSync(file, 'utf8');
    return { ok: true, status: 200, url: name === 'homepage.html' ? home.href : url, headers: {}, body, bytes: Buffer.byteLength(body), ms: null };
  };
}

function wrap(fragment) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${fragment}</body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const site = args._[0];
  if (!site) {
    console.error('Usage: node run.js <website> [--brand midamerica|boldform] [--city "City, ST"] [--name "Business"] [--rating 4.6] [--reviews 37] [--profile yes|no] [--pages DIR] [--out DIR]');
    process.exit(1);
  }
  let brand;
  try { brand = loadBrand(args.brand || DEFAULT_BRAND); } catch (err) { console.error(err.message); process.exit(1); }
  const agency = { key: brand.key };

  const input = {
    url: site,
    city: args.city || '',
    businessName: args.name || '',
    googleRating: args.rating || '',
    googleReviews: args.reviews || '',
    hasProfile: args.profile || '',
    newestReviewDays: args['newest-review-days'] || '',
    mapsUrl: typeof args['maps-url'] === 'string' ? args['maps-url'] : '',
    competitors: (args.competitor || []).join('\n'),
  };
  const opts = {};
  if (args.pagespeed) opts.pagespeed = parsePagespeed(JSON.parse(fs.readFileSync(args.pagespeed, 'utf8')));
  if (args.pages) {
    const siteUrl = /^https?:\/\//i.test(site) ? site : `https://${site}`;
    opts.get = pagesGetter(path.resolve(args.pages), new URL(siteUrl).origin + '/');
    opts.offline = true;
    if (opts.pagespeed === undefined) opts.pagespeed = null;
  }

  let a;
  try {
    a = await runAudit(input, process.env, opts);
  } catch (err) {
    console.error(`AUDIT_FAILED: ${err.message}`);
    if (!args.pages && /could not reach/i.test(err.message)) {
      console.error('NETWORK_BLOCKED: could not reach the site. Check the address is right; if it is, this environment may not allow outside websites. Fetch the raw pages yourself and rerun with --pages DIR (see SKILL.md).');
      process.exit(2);
    }
    process.exit(1);
  }

  a.brand = brand.key;
  const outDir = path.resolve(args.out || process.cwd());
  fs.mkdirSync(outDir, { recursive: true });
  const slug = a.domain.replace(/[^a-z0-9]+/g, '-');
  const files = {
    json: path.join(outDir, `${slug}-audit.json`),
    artifact: path.join(outDir, `${slug}-report.html`),
    standalone: path.join(outDir, `${slug}-report-standalone.html`),
  };
  fs.writeFileSync(files.json, JSON.stringify(a, null, 2));
  fs.writeFileSync(files.artifact, renderReport(a, agency, { toolbar: false }));
  fs.writeFileSync(files.standalone, wrap(renderReport(a, agency)));

  const line = '-'.repeat(44);
  console.log(`${a.business.name} (${a.domain})`);
  console.log(`Overall: ${a.overall}/100, grade ${a.grade}   [${a.counts.fail} problems, ${a.counts.warn} to improve, ${a.counts.pass} passed]`);
  console.log(line);
  if (a.google?.rating != null) console.log(`Google: ${a.google.rating} stars, ${a.google.reviewCount} reviews${a.competitors.length ? ` | competitors: ${a.competitors.map(c => `${c.name} ${c.rating}/${c.reviewCount}`).join(', ')}` : ''}`);
  for (const c of a.categories) console.log(`${c.name.padEnd(18)} ${String(c.score ?? '--').padStart(3)}${c.unverified ? `   (${c.unverified} not checked)` : ''}`);
  console.log(line);
  console.log('Top fixes:');
  a.priorities.forEach((p, i) => console.log(`${i + 1}. [${p.category}] ${p.label}: ${p.detail}`));
  console.log(line);
  console.log(`Artifact page:   ${files.artifact}`);
  console.log(`Standalone page: ${files.standalone}`);
  console.log(`Raw data:        ${files.json}`);
  console.log(`Branded for: ${brand.name}${listBrands().length > 1 ? ` (other brands: ${listBrands().filter(k => k !== brand.key).join(', ')})` : ''}`);
}

main();
