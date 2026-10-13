// Brand settings: one folder per agency under brands/ with brand.json and logos.
// Found next to lib/ in the repo, and next to scripts/lib/ inside the skill bundle.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = [path.join(__dirname, '..', 'brands'), path.join(__dirname, '..', '..', 'brands')].find(d => fs.existsSync(d));
// A skill bundle ships with a single brand, which then is the default.
function onlyBrand() {
  const dirs = ROOT ? fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'brand.json'))) : [];
  return dirs.length === 1 ? dirs[0] : null;
}
const DEFAULT_BRAND = process.env.BRAND || onlyBrand() || 'midamerica';
const cache = {};

function listBrands() {
  return ROOT ? fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'brand.json'))) : [];
}

function loadBrand(key = DEFAULT_BRAND) {
  const k = String(key || DEFAULT_BRAND).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (cache[k]) return cache[k];
  const dir = ROOT && path.join(ROOT, k);
  if (!dir || !fs.existsSync(path.join(dir, 'brand.json'))) {
    throw new Error(`Unknown brand "${key}". Available: ${listBrands().join(', ') || 'none'}`);
  }
  const brand = JSON.parse(fs.readFileSync(path.join(dir, 'brand.json'), 'utf8'));
  brand.dir = dir;
  brand.logo = variant => {
    const file = path.join(dir, `logo-${variant}.png`);
    return fs.existsSync(file) ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : null;
  };
  cache[k] = brand;
  return brand;
}

module.exports = { loadBrand, listBrands, DEFAULT_BRAND };
