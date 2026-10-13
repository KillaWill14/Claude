const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runAudit } = require('./lib/audit');
const { renderReport, esc, bandOf } = require('./lib/report');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data', 'reports');
fs.mkdirSync(DATA_DIR, { recursive: true });

const agency = {
  name: process.env.AGENCY_NAME || 'Mid-America Web Solutions',
  phone: process.env.AGENCY_PHONE || '',
  email: process.env.AGENCY_EMAIL || '',
  website: process.env.AGENCY_WEBSITE || '',
  bookingUrl: process.env.AGENCY_BOOKING_URL || '',
};

function page(body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`;
}

function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'content-type': type, ...extra });
  res.end(body);
}

// Operator pages are protected when ADMIN_PASSWORD is set; report links stay public so customers can open them.
function authorized(req) {
  const pass = process.env.ADMIN_PASSWORD;
  if (!pass) return true;
  const [scheme, value] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Basic' || !value) return false;
  const supplied = Buffer.from(value, 'base64').toString().split(':').slice(1).join(':');
  const a = Buffer.from(supplied);
  const b = Buffer.from(pass);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function listReports(limit = 25) {
  return fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ f, t: fs.statSync(path.join(DATA_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(0, limit)
    .map(({ f }) => {
      try {
        const a = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
        return { id: f.replace(/\.json$/, ''), name: a.business.name, domain: a.domain, overall: a.overall, grade: a.grade, createdAt: a.createdAt };
      } catch { return null; }
    })
    .filter(Boolean);
}

function homePage(error = '', values = {}) {
  const rows = listReports().map(r => `<li><a href="/r/${r.id}"><span class="score s-${bandOf(r.overall).key}">${r.overall}</span><span class="who"><strong>${esc(r.name)}</strong><small>${esc(r.domain)}</small></span><time>${new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time></a></li>`).join('');
  const keys = [process.env.GOOGLE_PLACES_API_KEY ? 'Google Places connected' : 'Google Places not connected (enter Google details by hand)', process.env.PAGESPEED_API_KEY ? 'PageSpeed key set' : 'PageSpeed running without a key (may be rate limited)'];
  return page(`<title>Audit Desk</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
:root { --ground: #f2f5f8; --paper: #fff; --ink: #13233a; --muted: #5a6b80; --line: #dde4ec; --brand: #1d4e89; --gold: #d9a21b; --good: #1f8a5b; --fair: #b7860b; --weak: #d26a12; --bad: #c4352b; --err-bg: #fbe6e4;
  --display: "Archivo", "Arial Narrow", system-ui, sans-serif; --body: "Public Sans", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, monospace; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --ground: #0f1724; --paper: #172234; --ink: #e8eef6; --muted: #9aaabd; --line: #2a3a52; --brand: #6ea2e6; --err-bg: #3a1f22; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--ground); color: var(--ink); font: 15px/1.5 var(--body); }
.wrap { max-width: 1040px; margin: 0 auto; padding-inline: 16px; padding-block: 28px 48px; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 24px; align-items: start; }
header { grid-column: 1 / -1; }
.brand { font: 800 14px var(--display); font-stretch: 112%; letter-spacing: .04em; text-transform: uppercase; color: var(--brand); display: flex; gap: 8px; align-items: center; }
.brand i { width: 10px; height: 10px; background: var(--gold); transform: rotate(45deg); }
h1 { font: 800 clamp(28px, 4vw, 38px)/1.05 var(--display); font-stretch: 110%; margin: 6px 0 4px; }
header p { margin: 0; color: var(--muted); max-width: 60ch; }
.panel { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; padding: 20px; }
label { display: block; font-weight: 600; margin-bottom: 4px; }
label small { font-weight: 400; color: var(--muted); }
input, select { width: 100%; font: 15px var(--body); padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--ground); color: var(--ink); }
input:focus, select:focus, button:focus-visible { outline: 3px solid var(--gold); outline-offset: 1px; }
.url input { font-size: 18px; padding: 14px; }
.fields { display: grid; gap: 14px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
fieldset { border: 1px dashed var(--line); border-radius: 8px; padding: 12px; margin: 0; display: grid; gap: 12px; }
legend { font: 500 12px var(--mono); text-transform: uppercase; letter-spacing: .07em; color: var(--muted); padding: 0 6px; }
button { font: 800 16px var(--display); font-stretch: 108%; background: var(--brand); color: #fff; border: 0; border-radius: 6px; padding: 14px 18px; cursor: pointer; }
button[disabled] { opacity: .7; cursor: progress; }
.error { background: var(--err-bg); color: var(--bad); padding: 10px 12px; border-radius: 6px; font-weight: 600; }
.status { font: 500 12px var(--mono); color: var(--muted); display: grid; gap: 2px; margin-top: 4px; }
h2 { font: 800 18px var(--display); margin: 0 0 10px; }
ul { list-style: none; margin: 0; padding: 0; }
li a { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); color: inherit; text-decoration: none; }
li:first-child a { border-top: 0; }
.score { font: 800 22px var(--display); font-variant-numeric: tabular-nums; }
.who { min-width: 0; } .who strong, .who small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .who small { color: var(--muted); }
time { font: 500 12px var(--mono); color: var(--muted); }
.s-good { color: var(--good); } .s-fair { color: var(--fair); } .s-weak { color: var(--weak); } .s-bad { color: var(--bad); }
.empty { color: var(--muted); }
#working[hidden] { display: none; }
#working { font: 500 13px var(--mono); color: var(--brand); }
@media (max-width: 760px) { .wrap { grid-template-columns: minmax(0, 1fr); } .two { grid-template-columns: 1fr; } }
</style>
<div class="wrap">
  <header>
    <div class="brand"><i></i>${esc(agency.name)}</div>
    <h1>Free Website Audit</h1>
    <p>Enter a prospect's website. In about 30–60 seconds you get a scored, customer-ready report you can send as a link or save as a PDF.</p>
  </header>
  <form class="panel fields" method="post" action="/audit" id="audit-form">
    ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ''}
    <div class="url"><label for="url">Website</label><input id="url" name="url" required placeholder="examplebusiness.com" value="${esc(values.url || '')}" autocomplete="off"></div>
    <div class="two">
      <div><label for="businessName">Business name <small>optional</small></label><input id="businessName" name="businessName" value="${esc(values.businessName || '')}"></div>
      <div><label for="city">City, State <small>helps local checks</small></label><input id="city" name="city" placeholder="Wichita, KS" value="${esc(values.city || '')}"></div>
    </div>
    <fieldset>
      <legend>Google profile, if you looked it up</legend>
      <div class="two">
        <div><label for="googleRating">Star rating</label><input id="googleRating" name="googleRating" inputmode="decimal" placeholder="4.6" value="${esc(values.googleRating || '')}"></div>
        <div><label for="googleReviews">Review count</label><input id="googleReviews" name="googleReviews" inputmode="numeric" placeholder="37" value="${esc(values.googleReviews || '')}"></div>
      </div>
      <div><label for="hasProfile">Has a Google Business Profile?</label>
        <select id="hasProfile" name="hasProfile"><option value="">Not sure</option><option value="yes"${values.hasProfile === 'yes' ? ' selected' : ''}>Yes</option><option value="no"${values.hasProfile === 'no' ? ' selected' : ''}>No</option></select></div>
    </fieldset>
    <button type="submit" id="go">Run audit</button>
    <div id="working" hidden>Scanning the site, checking Google and measuring speed…</div>
    <div class="status">${keys.map(k => `<span>${esc(k)}</span>`).join('')}</div>
  </form>
  <aside class="panel">
    <h2>Recent audits</h2>
    ${rows ? `<ul>${rows}</ul>` : '<p class="empty">Your audits will be listed here.</p>'}
  </aside>
</div>
<script>
document.getElementById('audit-form').addEventListener('submit', function () {
  var b = document.getElementById('go'); b.disabled = true; b.textContent = 'Running audit…';
  document.getElementById('working').hidden = false;
});
</script>`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain');

    const report = url.pathname.match(/^\/r\/([a-z0-9-]{6,40})$/);
    if (report) {
      const file = path.join(DATA_DIR, `${report[1]}.json`);
      if (!fs.existsSync(file)) return send(res, 404, page('<p style="font-family:system-ui;padding:24px">This report link is not valid.</p>'));
      const a = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (url.searchParams.get('format') === 'json') return send(res, 200, JSON.stringify(a, null, 2), 'application/json');
      return send(res, 200, page(renderReport(a, agency)));
    }

    if (!authorized(req)) return send(res, 401, 'Sign in required', 'text/plain', { 'www-authenticate': 'Basic realm="Audit Desk"' });

    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, homePage());

    if (req.method === 'POST' && url.pathname === '/audit') {
      const input = Object.fromEntries(new URLSearchParams(await readBody(req)));
      try {
        const a = await runAudit(input);
        const slug = a.domain.replace(/[^a-z0-9]+/g, '-').slice(0, 24);
        const id = `${slug}-${crypto.randomBytes(4).toString('hex')}`;
        fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(a));
        res.writeHead(303, { location: `/r/${id}` });
        return res.end();
      } catch (err) {
        return send(res, 400, homePage(err.message, input));
      }
    }

    if (req.method === 'GET' && url.pathname === '/api/audit') {
      const a = await runAudit(Object.fromEntries(url.searchParams));
      return send(res, 200, JSON.stringify(a, null, 2), 'application/json');
    }

    send(res, 404, 'Not found', 'text/plain');
  } catch (err) {
    send(res, 500, JSON.stringify({ error: err.message }), 'application/json');
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Audit Desk running on http://localhost:${PORT}`));
}

module.exports = { server };
