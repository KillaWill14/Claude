// HTML ad creatives, rendered to PNG by render.js. Four layouts modeled on the
// reference ads (scorecard, score ring, "see where you stand", big headline),
// three palettes, three Meta placements.

const path = require('node:path');
const fs = require('node:fs');

const SIZES = {
  square: { w: 1080, h: 1080 },   // Feed 1:1
  portrait: { w: 1080, h: 1350 }, // Feed 4:5
  story: { w: 1080, h: 1920 },    // Stories / Reels 9:16
};

const PALETTES = {
  brand: { bg: '#eef3f8', card: '#ffffff', ink: '#13233a', muted: '#5a6b80', line: '#dde4ec', brand: '#1d4e89', accent: '#d9a21b', ringA: '#f4a51c', ringB: '#e0711a', btn: '#1d4e89', btnInk: '#ffffff' },
  light: { bg: '#ffffff', card: '#ffffff', ink: '#0f1f33', muted: '#55657a', line: '#e3e8ef', brand: '#1d4e89', accent: '#f28c1b', ringA: '#ffb340', ringB: '#f07a12', btn: '#1f6fd6', btnInk: '#ffffff' },
  navy: { bg: '#13233a', card: '#1b3050', ink: '#ffffff', muted: '#b8c6d8', line: '#2c4468', brand: '#ffffff', accent: '#f2b632', ringA: '#ffcf5a', ringB: '#f29b1b', btn: '#f2b632', btnInk: '#13233a' },
};

const CATS = [
  { key: 'ai', name: 'AI Optimization' },
  { key: 'website', name: 'Website' },
  { key: 'seo', name: 'SEO' },
  { key: 'local', name: 'Local Listings' },
  { key: 'reviews', name: 'Reviews' },
  { key: 'social', name: 'Social Media' },
];

const ICONS = {
  ai: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  website: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  seo: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  local: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  reviews: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  social: '<path d="M4 5h16v11H9l-5 4z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  bars: '<path d="M5 20v-5M10 20v-9M15 20v-12M20 20V4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
};

function icon(name, size, color) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function gradeOf(score) {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
}
const GRADE_COLORS = { A: '#1f8a5b', B: '#3c9a3f', C: '#e08a1e', D: '#e0641e', F: '#c4352b' };

function ring(score, px, p, { label = 'Overall score', track } = {}) {
  const r = 80;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
  return `<svg width="${px}" height="${px}" viewBox="0 0 200 200" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.ringA}"/><stop offset="1" stop-color="${p.ringB}"/></linearGradient></defs>
    <circle cx="100" cy="100" r="${r}" fill="none" stroke="${track || p.line}" stroke-width="18"/>
    <circle cx="100" cy="100" r="${r}" fill="none" stroke="url(#${id})" stroke-width="18" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 100 100)"/>
    <text x="100" y="${label ? 108 : 118}" text-anchor="middle" font-family="Archivo" font-weight="900" font-size="58" fill="${p.ink}">${score}<tspan font-size="30" dy="-18">%</tspan></text>
    ${label ? `<text x="100" y="136" text-anchor="middle" font-family="Public Sans" font-weight="700" font-size="11" letter-spacing="1.6" fill="${p.muted}">${label.toUpperCase()}</text>` : ''}
  </svg>`;
}

function rows(cats, p, scale = 1) {
  const fs = 26 * scale;
  return `<div class="rows" style="gap:${14 * scale}px">${cats.map(c => {
    const g = gradeOf(c.score);
    return `<div class="row" style="font-size:${fs}px;gap:${16 * scale}px">
      <span class="ri" style="width:${46 * scale}px;height:${46 * scale}px">${icon(c.key, 26 * scale, p.accent)}</span>
      <span class="rn">${c.name}</span>
      <span class="rb" style="height:${10 * scale}px"><span style="width:${c.score}%;background:${GRADE_COLORS[g]}"></span></span>
      <span class="rg" style="width:${42 * scale}px;height:${42 * scale}px;font-size:${22 * scale}px;background:${GRADE_COLORS[g]}">${g}</span>
    </div>`;
  }).join('')}</div>`;
}

let fontCss = null;
function fontFaces() {
  if (fontCss != null) return fontCss;
  const nm = path.join(__dirname, '..', 'node_modules', '@fontsource');
  const face = (family, pkg, weight) => {
    const file = path.join(nm, pkg, 'files', `${pkg}-latin-${weight}-normal.woff2`);
    return fs.existsSync(file) ? `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}) format("woff2");}` : '';
  };
  fontCss = [
    ...[400, 700, 800, 900].map(w => face('Archivo', 'archivo', w)),
    ...[400, 600, 700].map(w => face('Public Sans', 'public-sans', w)),
    ...[400, 600].map(w => face('Fraunces', 'fraunces', w)),
  ].join('');
  return fontCss;
}

function brandMark(agency, p, scale = 1) {
  return `<div class="mark" style="font-size:${26 * scale}px;color:${p.brand}"><i style="width:${16 * scale}px;height:${16 * scale}px;background:${p.accent}"></i>${agency.name}</div>`;
}

function base(p, size, body) {
  const { w, h } = SIZES[size];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{background:${p.bg};color:${p.ink};font-family:"Public Sans",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.d{font-family:"Archivo","Arial Narrow",sans-serif}
.mark{display:flex;align-items:center;gap:.5em;font-family:"Archivo",sans-serif;font-weight:800;letter-spacing:.01em}
.mark i{display:inline-block;transform:rotate(45deg)}
.rows{display:flex;flex-direction:column;width:100%}
.row{display:flex;align-items:center;font-weight:700}
.ri{display:flex;align-items:center;justify-content:center;border-radius:12px;background:${p.accent}22;flex:none}
.rn{flex:0 0 38%}
.rb{flex:1;background:${p.line};border-radius:99px;overflow:hidden}
.rb span{display:block;height:100%;border-radius:99px}
.rg{display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-family:"Archivo",sans-serif;font-weight:900;flex:none}
.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;font-family:"Archivo",sans-serif;font-weight:800;background:${p.btn};color:${p.btnInk}}
.sample{font-weight:600;color:${p.muted};letter-spacing:.04em}
</style></head><body>${body}</body></html>`;
}

// 1. Scorecard: headline, score ring and six graded categories (reference ads 4 and 5).
function scorecard(d) {
  const { p, size } = d;
  const tall = size !== 'square';
  const s = size === 'story' ? 1.12 : 1;
  const card = `<div style="background:${p.card};border-radius:28px;box-shadow:0 18px 50px rgba(15,31,51,.14);padding:${tall ? 48 : 36}px;display:flex;${tall ? 'flex-direction:column;align-items:center;gap:36px' : 'gap:32px;align-items:center'}">
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;flex:none">${ring(d.score, tall ? 330 * s : 330, p)}<span class="sample" style="font-size:18px">Sample score</span></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:${tall ? 34 : 26}px;width:100%">
        ${rows(d.cats, p, tall ? 1.05 * s : 1.0)}
        <div class="btn" style="height:${tall ? 84 : 70}px;font-size:${tall ? 32 : 27}px;width:100%">View your free report&nbsp;›</div>
      </div>
    </div>`;
  return base(p, size, `<div style="height:100%;padding:${tall ? '90px 64px' : '50px 48px'};display:flex;flex-direction:column;justify-content:space-between;gap:30px">
    <div>
      <h1 class="d" style="font-size:${tall ? 92 * s : 70}px;line-height:1;font-weight:900;letter-spacing:-.01em">${d.title}</h1>
      <p style="font-size:${tall ? 36 * s : 30}px;color:${p.muted};margin-top:16px;font-weight:600;line-height:1.25">${d.sub}</p>
    </div>
    ${card}
    ${brandMark(d.agency, p, tall ? 1.15 * s : 1)}
  </div>`);
}

// 2. Big ring: one large score with small corner icons (reference ad 3).
function bigRing(d) {
  const { p, size } = d;
  const tall = size !== 'square';
  const ringPx = size === 'story' ? 820 : size === 'portrait' ? 720 : 560;
  const corner = (name, pos) => `<div style="position:absolute;${pos};display:flex;flex-direction:column;align-items:center;gap:8px">${icon(name, 76, p.accent)}<span style="font-size:30px;letter-spacing:6px;color:${p.accent};font-weight:900">•••</span></div>`;
  return base(p, size, `<div style="position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${tall ? 70 : 34}px;padding:${tall ? 120 : 56}px 60px">
    ${corner('target', 'top:60px;left:60px')}${corner('bars', 'top:60px;right:60px')}${corner('trend', 'bottom:60px;left:60px')}${corner('seo', 'bottom:60px;right:60px')}
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px">${ring(d.score, ringPx, p)}<span class="sample" style="font-size:20px">Sample score</span></div>
    <div style="text-align:center;max-width:860px">
      <h1 class="d" style="font-size:${tall ? 84 : 60}px;line-height:1.02;font-weight:900">${d.title}</h1>
      <p style="font-size:${tall ? 36 : 28}px;color:${p.muted};margin-top:14px;font-weight:600">${d.sub}</p>
    </div>
    ${brandMark(d.agency, p, tall ? 1.2 : 1)}
  </div>`);
}

// 3. See where you stand: bold claim, three feature chips and a report preview (reference ad 2).
function stand(d) {
  const { p, size } = d;
  const tall = size !== 'square';
  const words = d.title.split(' ');
  const cut = Math.ceil(words.length / 2);
  const title = `${words.slice(0, cut).join(' ')}<br><span style="color:${p.accent}">${words.slice(cut).join(' ')}</span>`;
  const features = [['ai', 'AI search<br>optimized'], ['local', 'Local<br>presence'], ['bars', 'Actionable<br>insights']];
  const preview = `<div style="background:${p.card};border-radius:22px;box-shadow:0 22px 60px rgba(15,31,51,.2);overflow:hidden;border:1px solid ${p.line}">
      <div style="height:44px;background:${p.line};display:flex;align-items:center;gap:10px;padding:0 18px">${['#ff5f57', '#febc2e', '#28c840'].map(c => `<i style="width:14px;height:14px;border-radius:50%;background:${c};display:inline-block"></i>`).join('')}</div>
      <div style="background:${p.brand === '#ffffff' ? p.accent : p.brand};color:#fff;padding:22px 28px;font-family:Archivo;font-weight:800;font-size:${tall ? 30 : 24}px">Get found by more people in your community</div>
      <div style="padding:28px;display:flex;${tall ? 'gap:34px;align-items:center' : 'flex-direction:column;align-items:center;gap:22px'}">
        ${ring(d.score, tall ? 250 : 200, p)}
        ${rows(d.cats, p, tall ? 0.8 : 0.66)}
      </div>
    </div>`;
  const text = `<div style="display:flex;flex-direction:column;gap:${tall ? 40 : 30}px">
      <h1 class="d" style="font-size:${tall ? 118 : 84}px;line-height:.95;font-weight:900;text-transform:uppercase;letter-spacing:-.01em">${title}</h1>
      <p style="font-size:${tall ? 38 : 30}px;color:${p.muted};font-weight:600;line-height:1.25">${d.sub}</p>
      <div style="display:flex;gap:${tall ? 40 : 22}px">${features.map(([i, t]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;font-weight:800;font-size:${tall ? 24 : 19}px;text-transform:uppercase;line-height:1.15">${icon(i, tall ? 58 : 46, p.brand === '#ffffff' ? p.accent : p.brand)}<span>${t}</span></div>`).join('')}</div>
    </div>`;
  return base(p, size, tall
    ? `<div style="height:100%;padding:100px 70px;display:flex;flex-direction:column;justify-content:space-between;gap:40px">${text}${preview}${brandMark(d.agency, p, 1.2)}</div>`
    : `<div style="height:100%;padding:60px;display:grid;grid-template-columns:47% 1fr;gap:40px;align-items:center;position:relative">${text}${preview}<div style="position:absolute;left:60px;bottom:44px">${brandMark(d.agency, p, .9)}</div></div>`);
}

// 4. Headline: one large serif statement with a report snippet and a button (reference ad 1).
function headline(d) {
  const { p, size } = d;
  const tall = size !== 'square';
  const s = size === 'story' ? 1.15 : 1;
  const snippet = `<div style="background:${p.card};border-radius:26px;box-shadow:0 24px 70px rgba(15,31,51,.18);padding:${tall ? 50 : 40}px;display:flex;gap:40px;align-items:center;transform:rotate(-2deg);border:1px solid ${p.line}">
      ${ring(d.score, tall ? 300 * s : 250, p)}
      ${rows(d.cats.slice(0, tall ? 6 : 4), p, tall ? 0.95 * s : 0.85)}
    </div>`;
  return base(p, size, `<div style="height:100%;padding:${tall ? '110px 70px 90px' : '64px 64px 56px'};display:flex;flex-direction:column;justify-content:space-between;gap:30px">
    ${snippet}
    <div>
      <h1 style="font-family:Fraunces,Georgia,serif;font-weight:400;font-size:${tall ? 112 * s : 82}px;line-height:1.04;letter-spacing:-.01em">${d.title}</h1>
      <p style="font-size:${tall ? 36 * s : 28}px;color:${p.muted};margin-top:18px;font-weight:600">${d.sub}</p>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:20px">
      ${brandMark(d.agency, p, tall ? 1.2 * s : 1)}
      <div class="btn" style="height:${tall ? 92 : 76}px;padding:0 ${tall ? 50 : 40}px;font-size:${tall ? 34 * s : 30}px">Get it now</div>
    </div>
  </div>`);
}

const TEMPLATES = { scorecard, ring: bigRing, stand, headline };

function buildCreative({ template, palette, size, title, sub, score, catScores, agency }) {
  const p = PALETTES[palette];
  const cats = CATS.map((c, i) => ({ ...c, score: catScores[i] }));
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return TEMPLATES[template]({ p, size, title: esc(title), sub: esc(sub), score, cats, agency: { name: esc(agency.name) } });
}

module.exports = { buildCreative, SIZES, PALETTES, TEMPLATES, CATS, gradeOf };
