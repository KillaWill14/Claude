// Optional Google data sources. Each returns null when unavailable so the audit
// can carry on with on-site signals only.

async function pagespeed(url, key) {
  const qs = new URLSearchParams({ url, strategy: 'mobile' });
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) qs.append('category', c);
  if (key) qs.set('key', key);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: AbortSignal.timeout(70000) });
    if (!res.ok) return null;
    const data = await res.json();
    const lh = data.lighthouseResult;
    if (!lh) return null;
    const score = c => (lh.categories[c]?.score == null ? null : Math.round(lh.categories[c].score * 100));
    const audit = id => lh.audits[id]?.numericValue ?? null;
    return {
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      seo: score('seo'),
      lcpMs: audit('largest-contentful-paint'),
      cls: audit('cumulative-layout-shift'),
      tbtMs: audit('total-blocking-time'),
    };
  } catch {
    return null;
  }
}

const PLACE_FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.regularOpeningHours',
  'places.photos', 'places.businessStatus', 'places.googleMapsUri', 'places.reviews', 'places.primaryTypeDisplayName',
].join(',');

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

async function findPlace({ query, domain, key }) {
  if (!key || !query) return null;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': PLACE_FIELDS },
      body: JSON.stringify({ textQuery: query, pageSize: 5 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `Places API returned ${res.status}` };
    const { places = [] } = await res.json();
    if (!places.length) return { found: false };
    const match = places.find(p => hostOf(p.websiteUri) === domain);
    const p = match || places[0];
    const reviewTimes = (p.reviews || []).map(r => Date.parse(r.publishTime)).filter(Boolean);
    return {
      found: true,
      websiteMatches: Boolean(match),
      name: p.displayName?.text || '',
      category: p.primaryTypeDisplayName?.text || '',
      address: p.formattedAddress || '',
      phone: p.nationalPhoneNumber || '',
      website: p.websiteUri || '',
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? 0,
      hasHours: Boolean(p.regularOpeningHours),
      photoCount: (p.photos || []).length,
      status: p.businessStatus || '',
      mapsUrl: p.googleMapsUri || '',
      newestReviewDays: reviewTimes.length ? Math.floor((Date.now() - Math.max(...reviewTimes)) / 86400000) : null,
    };
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

module.exports = { pagespeed, findPlace, hostOf };
