// Renders a saved audit as a customer-facing report. Returns the page body
// (title, styles and content); server.js wraps it in a full document.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function bandOf(score) {
  if (score == null) return { key: 'na', label: 'Not checked' };
  if (score >= 80) return { key: 'good', label: 'Strong' };
  if (score >= 60) return { key: 'fair', label: 'Fair' };
  if (score >= 40) return { key: 'weak', label: 'Needs work' };
  return { key: 'bad', label: 'Critical' };
}

const STATUS = { pass: 'Passed', warn: 'Improve', fail: 'Problem', na: 'Not checked' };

function ring(score) {
  const r = 70;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  const b = bandOf(score).key;
  return `<svg class="ring" viewBox="0 0 180 180" role="img" aria-label="Overall score ${score} out of 100">
    <circle cx="90" cy="90" r="${r}" fill="none" stroke="var(--line)" stroke-width="14"/>
    <circle cx="90" cy="90" r="${r}" fill="none" stroke="var(--${b})" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 90 90)"/>
    <text x="90" y="98" text-anchor="middle" class="ring-num" fill="var(--ink)">${score}</text>
    <text x="90" y="124" text-anchor="middle" class="ring-sub" fill="var(--muted)">out of 100</text>
  </svg>`;
}

function headline(a) {
  const weakest = [...a.categories].filter(c => c.score != null).sort((x, y) => x.score - y.score).slice(0, 2).map(c => c.name);
  if (a.overall >= 85) return `${esc(a.business.name)} has a strong online presence. A few targeted fixes in ${esc(weakest.join(' and '))} can widen the lead over competitors.`;
  if (a.overall >= 65) return `${esc(a.business.name)} has a solid base, but gaps in ${esc(weakest.join(' and '))} are likely costing calls to competitors who show up first.`;
  return `${esc(a.business.name)} is missing out on customers. Problems in ${esc(weakest.join(' and '))} make the business hard to find and easy to pass over.`;
}

// opts.toolbar = false drops the copy-link and PDF buttons (for artifact pages, where printing is unavailable).
function renderReport(a, agency = {}, opts = {}) {
  const date = new Date(a.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const overallBand = bandOf(a.overall);
  const contact = [agency.phone && `<span>${esc(agency.phone)}</span>`, agency.email && `<span>${esc(agency.email)}</span>`, agency.website && `<a href="${esc(agency.website)}">${esc(agency.website.replace(/^https?:\/\//, ''))}</a>`].filter(Boolean).join('');

  const cards = a.categories.map(c => {
    const b = bandOf(c.score);
    return `<a class="cat" href="#cat-${c.key}">
      <div class="cat-top"><span class="cat-name">${esc(c.name)}</span><span class="cat-score s-${b.key}">${c.score ?? '–'}</span></div>
      <div class="bar"><span class="fill f-${b.key}" style="width:${c.score ?? 0}%"></span></div>
      <div class="cat-band s-${b.key}">${b.label}</div>
      <p class="cat-blurb">${esc(c.blurb)}</p>
    </a>`;
  }).join('');

  const priorities = a.priorities.map(p => `<li>
      <div class="pri-head"><span class="pill p-${p.status}">${STATUS[p.status]}</span><span class="pri-cat">${esc(p.category)}</span></div>
      <h4>${esc(p.label)}</h4>
      <p>${esc(p.detail)}</p>
      ${p.fix ? `<p class="fix"><strong>Fix:</strong> ${esc(p.fix)}</p>` : ''}
    </li>`).join('');

  const sections = a.categories.map(c => {
    const b = bandOf(c.score);
    const rows = c.checks.map(x => `<li class="row">
        <span class="pill p-${x.status}">${STATUS[x.status]}</span>
        <div class="row-body">
          <div class="row-title"><span>${esc(x.label)}</span>${x.metric ? `<span class="metric">${esc(x.metric)}</span>` : ''}</div>
          ${x.detail ? `<p>${esc(x.detail)}</p>` : ''}
          ${x.status !== 'pass' && x.status !== 'na' && x.fix ? `<p class="fix"><strong>How we'd fix it:</strong> ${esc(x.fix)}</p>` : ''}
        </div>
      </li>`).join('');
    return `<section class="detail" id="cat-${c.key}">
      <header class="detail-head">
        <div><h3>${esc(c.name)}</h3><p>${esc(c.blurb)}</p></div>
        <div class="detail-score s-${b.key}"><span>${c.score ?? '–'}</span><small>${b.label}</small></div>
      </header>
      <ul class="rows">${rows}</ul>
    </section>`;
  }).join('');

  const g = a.google || {};
  const facts = [
    ['Website', `<a href="${esc(a.finalUrl)}">${esc(a.domain)}</a>`],
    a.business.city && ['Market', esc(a.business.city)],
    a.business.platform && ['Built with', esc(a.business.platform)],
    g.rating != null && ['Google rating', `${Number(g.rating).toFixed(1)} ★ (${g.reviewCount ?? 0} reviews)`],
    a.pagespeed?.performance != null && ['Mobile speed', `${a.pagespeed.performance}/100`],
  ].filter(Boolean).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

  return `<title>${esc(a.business.name)} Audit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
/* Layout: report letterhead, score hero, six-card scoreboard, ranked fixes, then per-category checklists. One light look, built to print. */
:root {
  --paper: #ffffff; --ground: #f2f5f8; --ink: #13233a; --muted: #5a6b80; --line: #dde4ec;
  --brand: #1d4e89; --brand-ink: #ffffff; --gold: #d9a21b;
  --good: #1f8a5b; --fair: #b7860b; --weak: #d26a12; --bad: #c4352b; --na: #8a97a8;
  --good-bg: #e5f4ec; --fair-bg: #fbf3dc; --weak-bg: #fdeedd; --bad-bg: #fbe6e4; --na-bg: #eef1f5;
  --display: "Archivo", "Arial Narrow", system-ui, sans-serif;
  --body: "Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  color-scheme: light;
}
* { box-sizing: border-box; }
body { background: var(--ground); color: var(--ink); font: 15px/1.55 var(--body); margin: 0; }
a { color: var(--brand); }
.wrap { max-width: 980px; margin: 0 auto; padding-inline: 16px; }
.letterhead { background: var(--brand); color: var(--brand-ink); padding-block: 18px; }
.letterhead .wrap { display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center; justify-content: space-between; }
.agency { font: 800 19px/1.1 var(--display); font-stretch: 112%; letter-spacing: .01em; display: flex; align-items: center; gap: 10px; }
.agency i { width: 12px; height: 12px; background: var(--gold); transform: rotate(45deg); display: inline-block; }
.doc-label { font: 500 12px var(--mono); letter-spacing: .08em; text-transform: uppercase; opacity: .85; }
.toolbar { display: flex; gap: 8px; justify-content: flex-end; padding-block: 12px 0; flex-wrap: wrap; }
.btn { font: 600 13px var(--body); border: 1px solid var(--line); background: var(--paper); color: var(--ink); border-radius: 6px; padding: 7px 12px; cursor: pointer; text-decoration: none; }
.btn:hover { border-color: var(--brand); }
.btn:focus-visible, .cat:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.hero { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; margin-block: 16px; padding: 28px; display: grid; grid-template-columns: 200px 1fr; gap: 28px; align-items: center; }
.ring { width: 180px; height: 180px; }
.ring-num { font: 800 54px var(--display); }
.ring-sub { font: 500 12px var(--mono); letter-spacing: .06em; text-transform: uppercase; }
.eyebrow { font: 500 12px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px; }
h1 { font: 800 clamp(28px, 4.4vw, 40px)/1.05 var(--display); font-stretch: 108%; margin: 0 0 10px; text-wrap: balance; }
h1 .grade { display: inline-block; font-size: .62em; vertical-align: middle; padding: 2px 10px; border-radius: 6px; margin-left: 8px; color: var(--paper); }
.summary { font-size: 17px; max-width: 60ch; margin: 0 0 14px; }
.tally { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.tally span { font: 600 13px var(--body); padding: 4px 10px; border-radius: 99px; }
.facts { display: flex; flex-wrap: wrap; gap: 6px 24px; margin: 0; }
.facts div { min-width: 0; }
.facts dt { font: 500 11px var(--mono); text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
.facts dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
h2 { font: 800 24px/1.15 var(--display); font-stretch: 105%; margin: 36px 0 4px; text-wrap: balance; }
.section-sub { color: var(--muted); margin: 0 0 16px; max-width: 65ch; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.cat { display: flex; flex-direction: column; gap: 8px; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 16px; color: inherit; text-decoration: none; }
.cat:hover { border-color: var(--brand); }
.cat-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.cat-name { font: 700 16px var(--display); font-stretch: 105%; }
.cat-score { font: 800 34px/1 var(--display); font-variant-numeric: tabular-nums; }
.bar { height: 8px; background: var(--line); border-radius: 99px; overflow: hidden; }
.fill { display: block; height: 100%; border-radius: 99px; }
.cat-band { font: 500 12px var(--mono); text-transform: uppercase; letter-spacing: .07em; }
.cat-blurb { margin: 0; color: var(--muted); font-size: 13.5px; }
.s-good { color: var(--good); } .s-fair { color: var(--fair); } .s-weak { color: var(--weak); } .s-bad { color: var(--bad); } .s-na { color: var(--na); }
.f-good { background: var(--good); } .f-fair { background: var(--fair); } .f-weak { background: var(--weak); } .f-bad { background: var(--bad); } .f-na { background: var(--na); }
.g-good { background: var(--good); } .g-fair { background: var(--fair); } .g-weak { background: var(--weak); } .g-bad { background: var(--bad); }
.pill { display: inline-block; font: 600 11px var(--mono); text-transform: uppercase; letter-spacing: .06em; padding: 3px 8px; border-radius: 4px; white-space: nowrap; }
.p-pass { background: var(--good-bg); color: var(--good); } .p-warn { background: var(--fair-bg); color: var(--fair); }
.p-fail { background: var(--bad-bg); color: var(--bad); } .p-na { background: var(--na-bg); color: var(--na); }
.priorities { list-style: none; counter-reset: pri; padding: 0; margin: 0; display: grid; gap: 10px; }
.priorities li { counter-increment: pri; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 16px 16px 16px 64px; position: relative; }
.priorities li::before { content: counter(pri); position: absolute; left: 16px; top: 14px; width: 34px; height: 34px; border-radius: 50%; background: var(--brand); color: var(--brand-ink); font: 800 17px/34px var(--display); text-align: center; }
.pri-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pri-cat { font: 500 12px var(--mono); color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.priorities h4 { font: 700 17px var(--display); margin: 6px 0 4px; }
.priorities p, .row p { margin: 0 0 4px; max-width: 70ch; }
.fix { color: var(--brand); }
.detail { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; margin-top: 14px; overflow: hidden; }
.detail-head { display: flex; justify-content: space-between; gap: 16px; padding: 18px; border-bottom: 1px solid var(--line); }
.detail-head h3 { font: 800 20px var(--display); font-stretch: 105%; margin: 0 0 2px; }
.detail-head p { margin: 0; color: var(--muted); max-width: 60ch; }
.detail-score { text-align: right; flex: none; }
.detail-score span { display: block; font: 800 38px/1 var(--display); font-variant-numeric: tabular-nums; }
.detail-score small { font: 500 11px var(--mono); text-transform: uppercase; letter-spacing: .07em; }
.rows { list-style: none; margin: 0; padding: 0; }
.row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 12px; padding: 14px 18px; border-top: 1px solid var(--line); }
.row:first-child { border-top: 0; }
.row .pill { justify-self: start; margin-top: 2px; }
.row-title { display: flex; justify-content: space-between; gap: 12px; font-weight: 700; margin-bottom: 2px; }
.metric { font: 500 13px var(--mono); color: var(--muted); white-space: nowrap; }
.cta { background: var(--brand); color: var(--brand-ink); border-radius: 10px; padding: 28px; margin-block: 32px 16px; display: grid; gap: 10px; }
.cta h2 { margin: 0; color: var(--brand-ink); }
.cta p { margin: 0; max-width: 62ch; }
.cta .contact { display: flex; flex-wrap: wrap; gap: 6px 20px; font-weight: 700; font-size: 17px; }
.cta a { color: var(--brand-ink); }
.cta .book { justify-self: start; background: var(--gold); color: var(--ink); font: 800 15px var(--display); padding: 12px 18px; border-radius: 6px; text-decoration: none; }
.method { color: var(--muted); font-size: 12.5px; padding-block: 8px 40px; max-width: 80ch; }
@media (max-width: 760px) {
  .hero { grid-template-columns: 1fr; justify-items: start; padding: 20px; }
  .ring { width: 150px; height: 150px; }
  .grid { grid-template-columns: minmax(0, 1fr); }
  .row { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  .row-title { flex-direction: column; gap: 0; }
}
@media (min-width: 761px) and (max-width: 900px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media print {
  body { background: #fff; font-size: 12px; }
  .toolbar { display: none; }
  .letterhead, .cta, .priorities li::before, .fill, .g-good, .g-fair, .g-weak, .g-bad, .pill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .detail, .priorities li, .cat { break-inside: avoid; }
}
</style>
<div class="letterhead"><div class="wrap">
  <div class="agency"><i></i>${esc(agency.name || 'Mid-America Web Solutions')}</div>
  <div class="doc-label">Website &amp; Visibility Audit · ${esc(date)}</div>
</div></div>
<main class="wrap">
  ${opts.toolbar === false ? '' : `<div class="toolbar">
    <button class="btn" type="button" id="copy-link">Copy report link</button>
    <button class="btn" type="button" id="print">Save as PDF</button>
  </div>`}
  <section class="hero">
    ${ring(a.overall)}
    <div>
      <p class="eyebrow">Prepared for</p>
      <h1>${esc(a.business.name)}<span class="grade g-${overallBand.key}">Grade ${a.grade}</span></h1>
      <p class="summary">${headline(a)}</p>
      <div class="tally">
        <span class="p-fail">${a.counts.fail} problems</span>
        <span class="p-warn">${a.counts.warn} to improve</span>
        <span class="p-pass">${a.counts.pass} passed</span>
      </div>
      <dl class="facts">${facts}</dl>
    </div>
  </section>

  <h2>Your scorecard</h2>
  <p class="section-sub">Each area is scored from 0 to 100. Your overall score weights them by how much each one drives calls and leads for a local business.</p>
  <div class="grid">${cards}</div>

  ${a.priorities.length ? `<h2>Top fixes, ranked by impact</h2>
  <p class="section-sub">These changes would move your score, and your phone, the most.</p>
  <ol class="priorities">${priorities}</ol>` : ''}

  <h2>Detailed findings</h2>
  <p class="section-sub">Every check we ran, what we found, and how we would fix it.</p>
  ${sections}

  <section class="cta">
    <h2>Ready to fix these and get found first?</h2>
    <p>${esc(agency.name || 'Mid-America Web Solutions')} handles every item in this report: SEO, AI search optimization, Google Business Profile management, review generation and social setup. We'll walk you through this audit and build a plan for your market.</p>
    ${contact ? `<div class="contact">${contact}</div>` : ''}
    ${agency.bookingUrl ? `<a class="book" href="${esc(agency.bookingUrl)}">Schedule a free strategy call</a>` : ''}
  </section>
  <p class="method">This audit was generated on ${esc(date)} by scanning ${esc(a.finalUrl)} and its robots.txt, sitemap and llms.txt files${a.pagespeed ? ', running Google PageSpeed Insights on mobile' : ''}${g.found && g.mapsUrl ? ', and reading the Google Business Profile' : ''}. Items marked "Not checked" were not included in the score. Results reflect the homepage at the time of the scan.</p>
</main>
${opts.toolbar === false ? '' : `<script>
(function () {
  var copy = document.getElementById('copy-link');
  var print = document.getElementById('print');
  if (print) print.addEventListener('click', function () { window.print(); });
  if (copy) copy.addEventListener('click', function () {
    var url = location.href.split('#')[0];
    var done = function () { copy.textContent = 'Link copied'; setTimeout(function () { copy.textContent = 'Copy report link'; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link', url); });
    else window.prompt('Copy this link', url);
  });
})();
</script>`}`;
}

module.exports = { renderReport, esc, bandOf };
