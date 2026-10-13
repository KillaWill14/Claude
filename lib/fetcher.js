const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 MidAmericaAudit/1.0';
const MAX_BYTES = 4 * 1024 * 1024;

async function get(url, { timeout = 15000, method = 'GET', redirect = 'follow' } = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      redirect,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'accept-encoding': 'gzip, deflate, br' },
      signal: AbortSignal.timeout(timeout),
    });
    let body = '';
    if (method !== 'HEAD' && res.body) {
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
        if (size > MAX_BYTES) { reader.cancel().catch(() => {}); break; }
      }
      body = Buffer.concat(chunks).toString('utf8');
    }
    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      headers: Object.fromEntries(res.headers.entries()),
      body,
      bytes: Buffer.byteLength(body),
      ms: Date.now() - started,
    };
  } catch (err) {
    return { ok: false, status: 0, url, headers: {}, body: '', bytes: 0, ms: Date.now() - started, error: err.cause?.code || err.name || String(err) };
  }
}

module.exports = { get, UA };
