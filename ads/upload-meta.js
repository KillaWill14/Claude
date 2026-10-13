#!/usr/bin/env node
// Uploads a generated batch to a Meta ad set through the Marketing API.
//
//   node upload-meta.js <batch folder> --adset 1234567890 [--live] [--limit 50] [--status PAUSED]
//
// Without --live it only prints what it would create. Ads are created PAUSED
// unless --status ACTIVE is passed, so nothing spends money until you review it.
//
// Environment:
//   META_ACCESS_TOKEN    System user or long-lived token with ads_management
//   META_AD_ACCOUNT_ID   Ad account id (with or without the act_ prefix)
//   META_PAGE_ID         Facebook Page the ads run from
//   META_LEAD_FORM_ID    Optional Instant Form id; ads then open the form instead of the link
//   META_API_VERSION     Optional, default v23.0

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

const env = process.env;
const API = `https://graph.facebook.com/${env.META_API_VERSION || 'v23.0'}`;
const account = `act_${String(env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '')}`;

async function graph(endpoint, params) {
  const body = new URLSearchParams({ access_token: env.META_ACCESS_TOKEN });
  for (const [k, v] of Object.entries(params)) body.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  const res = await fetch(`${API}/${endpoint}`, { method: 'POST', body, signal: AbortSignal.timeout(60000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`${endpoint}: ${e.message || res.statusText}${e.error_user_msg ? ` (${e.error_user_msg})` : ''}`);
  }
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args._[0];
  if (!dir || !args.adset) {
    console.error('Usage: node upload-meta.js <batch folder> --adset AD_SET_ID [--live] [--limit N] [--status PAUSED|ACTIVE]');
    process.exit(1);
  }
  const live = Boolean(args.live);
  const status = String(args.status || 'PAUSED').toUpperCase();
  if (!['PAUSED', 'ACTIVE'].includes(status)) throw new Error('--status must be PAUSED or ACTIVE');
  if (live) {
    const missing = ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'META_PAGE_ID'].filter(k => !env[k]);
    if (missing.length) throw new Error(`Set ${missing.join(', ')} before uploading.`);
  }

  const ads = JSON.parse(fs.readFileSync(path.join(dir, 'ads.json'), 'utf8'));
  const logFile = path.join(dir, 'meta-upload.json');
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : {};
  const todo = ads.filter(a => !log[a.id]).slice(0, args.limit ? parseInt(args.limit, 10) : undefined);
  const leadForm = env.META_LEAD_FORM_ID;
  console.log(`${live ? 'Uploading' : 'Dry run:'} ${todo.length} ads to ad set ${args.adset} as ${status}${leadForm ? ` with lead form ${leadForm}` : ''}. ${ads.filter(a => log[a.id]).length} already uploaded.`);

  let done = 0;
  for (const ad of todo) {
    const imageRel = ad.image_square || ad.image_portrait;
    if (!imageRel) { console.warn(`${ad.id}: no feed image, skipped`); continue; }
    const linkData = {
      link: leadForm ? 'http://fb.me/' : ad.link,
      message: ad.primary_text,
      name: ad.headline,
      description: ad.description,
      call_to_action: { type: ad.cta, value: leadForm ? { lead_gen_form_id: leadForm } : { link: ad.link } },
    };
    if (!live) {
      console.log(`- ${ad.ad_name}\n    "${ad.headline}" / ${ad.cta} / ${imageRel}`);
      continue;
    }
    try {
      const img = await graph(`${account}/adimages`, { bytes: fs.readFileSync(path.join(dir, imageRel)).toString('base64') });
      const hash = Object.values(img.images || {})[0]?.hash;
      if (!hash) throw new Error('adimages: no image hash returned');
      const creative = await graph(`${account}/adcreatives`, {
        name: ad.ad_name,
        object_story_spec: { page_id: env.META_PAGE_ID, link_data: { ...linkData, image_hash: hash } },
      });
      const created = await graph(`${account}/ads`, { name: ad.ad_name, adset_id: String(args.adset), creative: { creative_id: creative.id }, status });
      log[ad.id] = { ad_id: created.id, creative_id: creative.id, image_hash: hash, at: new Date().toISOString() };
      fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
      done++;
      console.log(`  ${done}/${todo.length} ${ad.id} -> ad ${created.id}`);
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.error(`  ${ad.id} failed: ${err.message}`);
      if (/limit|too many|throttl/i.test(err.message)) { console.error('Meta is limiting requests or ads. Stopping; rerun later to continue where it left off.'); break; }
    }
  }
  if (live) console.log(`Created ${done} ads. Upload log: ${logFile}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
