// Small, dependency-free HTML helpers. They are tolerant regex scanners, not a
// full parser, which is all a marketing audit of a single page needs.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…' };

function decode(str = '') {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function parseAttrs(str = '') {
  const out = {};
  const re = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(str))) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

// All opening tags of a given name, as attribute objects.
function tags(html, name) {
  const re = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(parseAttrs(m[1]));
  return out;
}

// Inner HTML of every element of a given name (non-nested elements only).
function inner(html, name) {
  const re = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)</${name}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ attrs: parseAttrs(m[1]), html: m[2] });
  return out;
}

function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
}

function text(html = '') {
  return decode(stripNoise(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function meta(html, key) {
  const k = key.toLowerCase();
  const hit = tags(html, 'meta').find(a => (a.name || a.property || '').toLowerCase() === k);
  return hit ? (hit.content || '').trim() : '';
}

module.exports = { decode, parseAttrs, tags, inner, text, stripNoise, meta };
