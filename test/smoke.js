// Runs a full audit against the local fixture site: node test/smoke.js
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { runAudit, robotsBlocks } = require('../lib/audit');
const assert = require('node:assert');

const dir = path.join(__dirname, 'fixture');
const site = http.createServer((req, res) => {
  const file = path.join(dir, req.url === '/' ? 'index.html' : req.url);
  if (!file.startsWith(dir) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': file.endsWith('.txt') ? 'text/plain' : 'text/html' });
  res.end(fs.readFileSync(file));
});

assert.equal(robotsBlocks('User-agent: *\nDisallow: /\n', 'GPTBot'), true);
assert.equal(robotsBlocks('User-agent: *\nDisallow: /admin\n', 'GPTBot'), false);
assert.equal(robotsBlocks('User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\n', 'ClaudeBot'), false);

site.listen(0, async () => {
  const { port } = site.address();
  try {
    const a = await runAudit({ url: `http://localhost:${port}/`, city: 'Salina, KS', googleRating: '4.2', googleReviews: '23', competitors: 'Smith Plumbing | 4.8 | 212\nAce Rooter | 4.5 | 1,096' }, { DISABLE_PAGESPEED: '1' });
    console.log(`Overall ${a.overall} (${a.grade})`);
    for (const c of a.categories) console.log(`  ${c.name.padEnd(16)} ${c.score}`);
    console.log('Top fixes:', a.priorities.map(p => p.label).join(' | '));
    assert.ok(a.overall > 0 && a.overall < 100);
    assert.equal(a.categories.find(c => c.key === 'seo').checks.find(x => x.label.startsWith('One main')).status, 'warn');
    assert.equal(a.categories.find(c => c.key === 'ai').checks.find(x => x.label.startsWith('AI assistants')).status, 'warn');
    assert.equal(a.categories.find(c => c.key === 'social').checks.find(x => x.label.startsWith('Facebook')).status, 'pass');
    assert.equal(a.competitors.length, 2);
    assert.equal(a.competitors[1].reviewCount, 1096);
    assert.match(a.categories.find(c => c.key === 'reviews').checks.find(x => x.label === 'Number of Google reviews').detail, /average 654/);
    const html = require('../lib/report').renderReport(a, {});
    assert.match(html, /How you compare on Google/);
    if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(a, null, 2));
    console.log('Smoke test passed.');
  } finally { site.close(); }
});
