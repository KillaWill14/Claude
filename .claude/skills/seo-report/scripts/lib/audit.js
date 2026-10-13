const { get: httpGet } = require('./fetcher');
const { tags, inner, text, meta } = require('./html');
const { pagespeed, findPlace } = require('./google');

const CATEGORIES = [
  { key: 'website', name: 'Website Health', weight: 20, blurb: 'Speed, mobile experience, security and how easily visitors can contact you.' },
  { key: 'seo', name: 'SEO', weight: 20, blurb: 'Whether Google can find, understand and rank your pages.' },
  { key: 'ai', name: 'AI Optimization', weight: 15, blurb: 'Whether ChatGPT, Google AI Overviews, Perplexity and other AI tools can read and recommend you.' },
  { key: 'local', name: 'Local Listings', weight: 20, blurb: 'Your Google Business Profile and the name, address and phone details customers rely on.' },
  { key: 'reviews', name: 'Reviews', weight: 15, blurb: 'Your star rating, review volume and how well you show off customer feedback.' },
  { key: 'social', name: 'Social Media', weight: 10, blurb: 'Your social profiles and how your links look when they are shared.' },
];

const SOCIAL = [
  { key: 'facebook', name: 'Facebook', re: /(^|\.)facebook\.com$|(^|\.)fb\.com$/ },
  { key: 'instagram', name: 'Instagram', re: /(^|\.)instagram\.com$/ },
  { key: 'linkedin', name: 'LinkedIn', re: /(^|\.)linkedin\.com$/ },
  { key: 'youtube', name: 'YouTube', re: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/ },
  { key: 'tiktok', name: 'TikTok', re: /(^|\.)tiktok\.com$/ },
  { key: 'x', name: 'X (Twitter)', re: /(^|\.)twitter\.com$|(^|\.)x\.com$/ },
  { key: 'pinterest', name: 'Pinterest', re: /(^|\.)pinterest\.com$/ },
  { key: 'nextdoor', name: 'Nextdoor', re: /(^|\.)nextdoor\.com$/ },
];
const SHARE_LINK = /sharer|share\.php|intent\/tweet|shareArticle|\/share\?|\/plugins\//i;

const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'];

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;
const ADDRESS_RE = /\b\d{2,6}\s+(?:[NSEW]\.?\s+)?[A-Za-z0-9.' ]{2,40}?\s(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Highway|Hwy|Court|Ct|Parkway|Pkwy|Way|Place|Pl|Circle|Cir|Trail|Trl|Pike)\b\.?/;

function digits(phone = '') {
  return phone.replace(/\D/g, '').slice(-10);
}

function normalizeUrl(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('Enter a website address.');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (!u.hostname.includes('.') && u.hostname !== 'localhost') throw new Error('That does not look like a website address.');
  return u;
}

function collectSchema(html) {
  const items = [];
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node['@type']) items.push(node);
    if (node['@graph']) walk(node['@graph']);
    for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
  };
  for (const s of inner(html, 'script')) {
    if (!/ld\+json/i.test(s.attrs.type || '')) continue;
    try { walk(JSON.parse(s.html.trim())); } catch { /* malformed JSON-LD counts as missing */ }
  }
  const types = new Set();
  for (const it of items) [].concat(it['@type']).forEach(t => types.add(String(t)));
  return { items, types: [...types] };
}

const LOCAL_TYPES = /LocalBusiness|Organization|Store|Restaurant|Dentist|Attorney|LegalService|Plumber|Electrician|HVACBusiness|RoofingContractor|HomeAndConstructionBusiness|AutoRepair|MedicalBusiness|ProfessionalService|Contractor|Service|Corporation|Physician|Bakery|CafeOrCoffeeShop|BeautySalon|HairSalon|RealEstateAgent|InsuranceAgency|AccountingService|FinancialService|Locksmith|MovingCompany|HousePainter|GeneralContractor|Veterinary|Store/;

function robotsBlocks(robots, bot) {
  // Returns true when a group naming this bot (or *, for the wildcard check) disallows "/".
  const groups = [];
  let cur = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'disallow' || key === 'allow')) {
      cur.rules.push({ key, val });
    }
  }
  const pick = groups.find(g => g.agents.includes(bot.toLowerCase())) || groups.find(g => g.agents.includes('*'));
  if (!pick) return false;
  const blocksRoot = pick.rules.some(r => r.key === 'disallow' && r.val === '/');
  const allowsRoot = pick.rules.some(r => r.key === 'allow' && r.val === '/');
  return blocksRoot && !allowsRoot;
}

function band(value, steps) {
  // steps: [[threshold, status], ...] checked in order with >=
  for (const [t, s] of steps) if (value >= t) return s;
  return 'fail';
}

// opts.get replaces the network fetcher (used to audit pages Claude fetched itself),
// opts.offline marks timing and header checks as not checkable, and
// opts.pagespeed supplies PageSpeed results gathered elsewhere (or null to skip).
async function runAudit(input, env = process.env, opts = {}) {
  const get = opts.get || httpGet;
  const offline = Boolean(opts.offline);
  const target = normalizeUrl(input.url);
  const domain = target.hostname.replace(/^www\./, '').toLowerCase();
  const origin = target.origin;

  const psiPromise = opts.pagespeed !== undefined ? Promise.resolve(opts.pagespeed) : env.DISABLE_PAGESPEED || offline ? Promise.resolve(null) : pagespeed(target.href, env.PAGESPEED_API_KEY);

  const page = await get(target.href, { timeout: 20000 });
  if (!page.ok && !page.body) {
    throw new Error(page.status ? `The site answered with error ${page.status}.` : `We could not reach ${target.hostname} (${page.error || 'no response'}).`);
  }
  const finalUrl = new URL(page.url);
  const base = finalUrl.origin;

  const [robots, sitemapDirect, llms, httpVersion] = await Promise.all([
    get(`${base}/robots.txt`, { timeout: 8000 }),
    get(`${base}/sitemap.xml`, { timeout: 8000 }),
    get(`${base}/llms.txt`, { timeout: 8000 }),
    finalUrl.protocol === 'https:' ? get(`http://${finalUrl.host}/`, { timeout: 8000, method: 'HEAD' }) : Promise.resolve(null),
  ]);

  const html = page.body;
  const cleanText = text(html);
  const words = cleanText ? cleanText.split(' ').filter(w => /[a-z]/i.test(w)).length : 0;
  const title = text(inner(html, 'title')[0]?.html || '');
  const description = meta(html, 'description');
  const robotsMeta = meta(html, 'robots').toLowerCase();
  const xRobots = (page.headers['x-robots-tag'] || '').toLowerCase();
  const h1s = inner(html, 'h1').map(h => text(h.html)).filter(Boolean);
  const headings = ['h2', 'h3'].flatMap(t => inner(html, t).map(h => text(h.html))).filter(Boolean);
  const links = tags(html, 'a').map(a => a.href || '').filter(Boolean);
  const absLinks = links.map(h => { try { return new URL(h, base); } catch { return null; } }).filter(Boolean);
  const internalLinks = new Set(absLinks.filter(u => u.hostname.replace(/^www\./, '') === domain).map(u => u.pathname)).size;
  const images = tags(html, 'img');
  const imagesWithAlt = images.filter(i => (i.alt || '').trim().length > 0).length;
  const linkTags = tags(html, 'link');
  const canonical = linkTags.find(l => (l.rel || '').toLowerCase() === 'canonical');
  const favicon = linkTags.some(l => /icon/i.test(l.rel || ''));
  const viewport = meta(html, 'viewport');
  const lang = (html.match(/<html\b[^>]*\blang\s*=\s*["']?([a-z-]+)/i) || [])[1] || '';
  const scripts = tags(html, 'script').length;
  const forms = tags(html, 'form').length;
  const telLinks = links.filter(h => /^tel:/i.test(h));
  const schema = collectSchema(html);
  const raw = html;

  // Sitemap: direct path, or one declared in robots.txt.
  let sitemapOk = sitemapDirect.ok && /<(urlset|sitemapindex)\b/i.test(sitemapDirect.body);
  const robotsOk = robots.ok && /user-agent|disallow|sitemap/i.test(robots.body) && !/<html/i.test(robots.body);
  const declaredSitemap = robotsOk ? (robots.body.match(/^\s*sitemap:\s*(\S+)/im) || [])[1] : null;
  if (!sitemapOk && declaredSitemap) {
    const sm = await get(declaredSitemap, { timeout: 8000 });
    sitemapOk = sm.ok && /<(urlset|sitemapindex)\b/i.test(sm.body);
  }
  if (!sitemapOk) {
    const sm = await get(`${base}/sitemap_index.xml`, { timeout: 8000 });
    sitemapOk = sm.ok && /<(urlset|sitemapindex)\b/i.test(sm.body);
  }
  const llmsOk = llms.ok && llms.body.trim().length > 20 && !/<html/i.test(llms.body);

  // Business identity signals.
  const schemaBiz = schema.items.find(i => LOCAL_TYPES.test([].concat(i['@type']).join(' ')));
  const schemaAddr = schema.items.find(i => i.address && typeof i.address === 'object')?.address;
  const schemaCity = (Array.isArray(schemaAddr) ? schemaAddr[0] : schemaAddr)?.addressLocality || '';
  const visible = cleanText;
  const sitePhoneMatch = visible.match(PHONE_RE);
  const sitePhone = telLinks[0] ? digits(telLinks[0]) : sitePhoneMatch ? digits(sitePhoneMatch[0]) : '';
  const siteAddress = (visible.match(ADDRESS_RE) || [])[0] || (schemaAddr ? 'in structured data' : '');
  const ogSiteName = meta(html, 'og:site_name');
  const guessedName = (input.businessName || schemaBiz?.name || ogSiteName || title.split(/\s[|\-–—:]\s/)[0] || domain).trim();
  const city = (input.city || schemaCity || '').trim();
  const cityRe = city ? new RegExp(city.split(',')[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

  const sameAs = schema.items.flatMap(i => [].concat(i.sameAs || []));
  const socialFound = {};
  for (const u of [...absLinks, ...sameAs.map(s => { try { return new URL(s); } catch { return null; } }).filter(Boolean)]) {
    if (SHARE_LINK.test(u.href)) continue;
    const host = u.hostname.toLowerCase();
    const s = SOCIAL.find(x => x.re.test(host));
    if (s && u.pathname.length > 1 && !socialFound[s.key]) socialFound[s.key] = u.href;
  }

  const place = await findPlace({ query: [guessedName, city].filter(Boolean).join(' '), domain, key: env.GOOGLE_PLACES_API_KEY });
  const psi = await psiPromise;

  // Manual Google data from the form wins only when the Places API had nothing.
  const manualRating = parseFloat(input.googleRating);
  const manualCount = parseInt(input.googleReviews, 10);
  const g = {
    source: place?.found ? 'google' : (Number.isFinite(manualRating) || Number.isFinite(manualCount) || input.hasProfile) ? 'manual' : 'none',
    found: place?.found ? true : input.hasProfile === 'yes' ? true : input.hasProfile === 'no' ? false : (Number.isFinite(manualRating) || Number.isFinite(manualCount)) ? true : null,
    rating: place?.found ? place.rating : Number.isFinite(manualRating) ? manualRating : null,
    reviewCount: place?.found ? place.reviewCount : Number.isFinite(manualCount) ? manualCount : null,
    newestReviewDays: place?.found ? place.newestReviewDays : Number.isFinite(parseInt(input.newestReviewDays, 10)) ? parseInt(input.newestReviewDays, 10) : null,
  };

  const checks = { website: [], seo: [], ai: [], local: [], reviews: [], social: [] };
  const add = (cat, c) => checks[cat].push(c);

  // ---------- Website health ----------
  const https = finalUrl.protocol === 'https:';
  add('website', { label: 'Secure connection (HTTPS)', weight: 15, status: https ? 'pass' : 'fail',
    detail: https ? 'Your site loads over a secure, encrypted connection.' : 'Your site loads without HTTPS. Browsers label it "Not secure", which scares visitors away.',
    fix: 'Install an SSL certificate and send all traffic to the https:// version.' });
  if (httpVersion) {
    const redirects = httpVersion.ok && new URL(httpVersion.url).protocol === 'https:';
    add('website', { label: 'Insecure version redirects to secure', weight: 5, status: httpVersion.status === 0 ? 'na' : redirects ? 'pass' : 'warn',
      detail: redirects ? 'Visitors who type http:// are moved to the secure site.' : 'The http:// version of your site does not forward to the secure version.',
      fix: 'Add a permanent (301) redirect from http:// to https://.' });
  }
  add('website', { label: 'Mobile-friendly layout', weight: 15, status: /width\s*=\s*device-width/i.test(viewport) ? 'pass' : 'fail',
    detail: /device-width/i.test(viewport) ? 'The page is set up to fit phone screens.' : 'The page is not set up for phones. Most local searches happen on a phone.',
    fix: 'Rebuild the layout to be responsive so it adapts to any screen size.' });
  if (psi?.performance != null) {
    add('website', { label: 'Mobile speed score (Google PageSpeed)', weight: 20, status: band(psi.performance, [[90, 'pass'], [50, 'warn']]), metric: `${psi.performance}/100`,
      detail: `Google rates your mobile speed ${psi.performance} out of 100.${psi.lcpMs ? ` The main content takes ${(psi.lcpMs / 1000).toFixed(1)} seconds to appear.` : ''}`,
      fix: 'Compress images, remove unused plugins and scripts, and use caching so pages load in under 2.5 seconds.' });
    if (psi.cls != null) add('website', { label: 'Page stays steady while loading', weight: 5, status: band(-psi.cls, [[-0.1, 'pass'], [-0.25, 'warn']]), metric: psi.cls.toFixed(2),
      detail: psi.cls <= 0.1 ? 'Content does not jump around as the page loads.' : 'Content shifts while loading, which causes mis-taps and frustration.',
      fix: 'Reserve space for images, ads and embeds so the layout does not jump.' });
    if (psi.accessibility != null) add('website', { label: 'Accessibility score', weight: 10, status: band(psi.accessibility, [[90, 'pass'], [70, 'warn']]), metric: `${psi.accessibility}/100`,
      detail: `Google rates accessibility ${psi.accessibility} out of 100 (contrast, labels, readable text).`,
      fix: 'Fix low-contrast text, missing labels and unlabeled buttons so every visitor can use the site.' });
  } else {
    const secs = page.ms / 1000;
    add('website', { label: 'Server response time', weight: 15, status: offline ? 'na' : band(-secs, [[-1.5, 'pass'], [-3.5, 'warn']]), metric: offline ? '' : `${secs.toFixed(1)}s`,
      detail: offline ? 'Not measured in this scan.' : `Your homepage took ${secs.toFixed(1)} seconds to download from our test server.`,
      fix: 'Move to faster hosting, enable caching and trim heavy page content.' });
  }
  const kb = Math.round(page.bytes / 1024);
  add('website', { label: 'Lean page code', weight: 5, status: kb < 300 && scripts < 40 ? 'pass' : kb < 800 ? 'warn' : 'fail', metric: `${kb} KB, ${scripts} scripts`,
    detail: `The homepage HTML is ${kb} KB with ${scripts} scripts.`,
    fix: 'Remove page-builder bloat and unused scripts to speed up every page.' });
  const enc = page.headers['content-encoding'] || '';
  add('website', { label: 'Compression enabled', weight: 5, status: offline ? 'na' : /gzip|br|deflate|zstd/.test(enc) ? 'pass' : 'warn',
    detail: enc ? `Pages are compressed (${enc}) before they are sent.` : 'Pages are sent uncompressed, so they take longer to download.',
    fix: 'Turn on gzip or Brotli compression at the server or CDN.' });
  add('website', { label: 'Tap-to-call phone number', weight: 10, status: telLinks.length ? 'pass' : 'fail',
    detail: telLinks.length ? 'Phone visitors can call you with one tap.' : 'Your phone number is not a tap-to-call link, so mobile visitors have to copy it by hand.',
    fix: 'Make every phone number a tap-to-call link, and add a call button to the mobile header.' });
  const contactPath = absLinks.some(u => /contact|quote|estimate|book|schedule|appointment/i.test(u.pathname));
  add('website', { label: 'Clear way to request a quote or contact you', weight: 10, status: forms ? 'pass' : contactPath ? 'warn' : 'fail',
    detail: forms ? 'There is a form on the homepage to capture leads.' : contactPath ? 'There is a contact page, but no form on the homepage to capture leads right away.' : 'We could not find a contact form or quote request.',
    fix: 'Put a short quote or contact form on the homepage and every service page.' });
  const yearMatch = [...visible.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map(m => Number(m[1]));
  const thisYear = new Date().getFullYear();
  const copyYear = yearMatch.length ? Math.max(...yearMatch) : null;
  add('website', { label: 'Site looks current', weight: 5, status: copyYear == null ? 'na' : thisYear - copyYear <= 1 ? 'pass' : 'warn', metric: copyYear ? `© ${copyYear}` : '',
    detail: copyYear == null ? '' : thisYear - copyYear <= 1 ? 'The footer date is current.' : `The footer still says ${copyYear}. Visitors read that as a business that is not paying attention.`,
    fix: 'Update the footer date automatically and refresh older content.' });
  add('website', { label: 'Browser tab icon (favicon)', weight: 3, status: favicon ? 'pass' : 'warn',
    detail: favicon ? 'Your logo shows in browser tabs and bookmarks.' : 'No favicon was found, so tabs and Google results show a generic icon.',
    fix: 'Add your logo as a favicon.' });
  const hasGA = /googletagmanager\.com\/(gtag|gtm)|google-analytics\.com|gtag\(/i.test(raw);
  add('website', { label: 'Visitor tracking (Google Analytics)', weight: 7, status: hasGA ? 'pass' : 'fail',
    detail: hasGA ? 'Google Analytics or Tag Manager is installed.' : 'We found no Google Analytics, so you cannot see where visitors and leads come from.',
    fix: 'Install Google Analytics 4 with lead and call tracking.' });

  // ---------- SEO ----------
  const noindex = /noindex/.test(robotsMeta) || /noindex/.test(xRobots);
  add('seo', { label: 'Search engines are allowed to list the site', weight: 15, status: noindex ? 'fail' : 'pass',
    detail: noindex ? 'Your homepage tells Google NOT to list it. You are invisible in search.' : 'Your homepage can be listed in Google.',
    fix: 'Remove the "noindex" setting immediately.' });
  add('seo', { label: 'Page title', weight: 10, status: !title ? 'fail' : title.length >= 30 && title.length <= 65 ? 'pass' : 'warn', metric: title ? `${title.length} chars` : '',
    detail: !title ? 'The homepage has no title, the blue link people click in Google.' : `"${title.slice(0, 90)}"${title.length < 30 ? ' is too short to describe your services and area.' : title.length > 65 ? ' is long and will be cut off in Google.' : ' is a good length.'}`,
    fix: 'Write a 50–60 character title with your main service and city, e.g. "Roof Repair in Wichita, KS | Company Name".' });
  add('seo', { label: 'Meta description', weight: 10, status: !description ? 'fail' : description.length >= 70 && description.length <= 160 ? 'pass' : 'warn', metric: description ? `${description.length} chars` : '',
    detail: !description ? 'There is no meta description, so Google writes its own snippet from random page text.' : description.length < 70 ? 'The description is too short to sell the click.' : description.length > 160 ? 'The description is long and will be cut off.' : 'The description is a good length.',
    fix: 'Write a 140–155 character description with your service, city and a reason to call.' });
  add('seo', { label: 'One main heading (H1)', weight: 10, status: h1s.length === 1 ? 'pass' : h1s.length === 0 ? 'fail' : 'warn', metric: `${h1s.length} found`,
    detail: h1s.length === 1 ? `Main heading: "${h1s[0].slice(0, 80)}".` : h1s.length === 0 ? 'The page has no main heading, which is Google\'s strongest clue about the topic.' : `The page has ${h1s.length} main headings, which muddies the topic.`,
    fix: 'Use exactly one H1 that names your main service and city.' });
  add('seo', { label: 'Subheadings organize the content', weight: 5, status: headings.length >= 3 ? 'pass' : headings.length ? 'warn' : 'fail', metric: `${headings.length}`,
    detail: headings.length >= 3 ? 'Content is broken into clear sections.' : 'Few or no subheadings, so the page is hard to skim for people and search engines.',
    fix: 'Break content into sections with descriptive H2 and H3 headings.' });
  add('seo', { label: 'Enough content to rank', weight: 10, status: band(words, [[500, 'pass'], [250, 'warn']]), metric: `${words} words`,
    detail: `The homepage has about ${words} words of readable text.${words < 250 ? ' Thin pages rarely rank for competitive local searches.' : ''}`,
    fix: 'Add helpful content about your services, service area and what makes you different. Aim for 600+ words.' });
  if (city) {
    const re = cityRe;
    const inKey = re.test(title) || h1s.some(h => re.test(h));
    add('seo', { label: `Targets your city (${city})`, weight: 10, status: inKey ? 'pass' : re.test(visible) ? 'warn' : 'fail',
      detail: inKey ? `${city} appears in your title or main heading.` : re.test(visible) ? `${city} appears on the page but not in the title or main heading.` : `${city} is not mentioned on the homepage, so Google has a weak signal for local searches there.`,
      fix: `Put "${city}" in the page title, main heading and body text, and build a page for each service area.` });
  }
  add('seo', { label: 'XML sitemap', weight: 8, status: sitemapOk ? 'pass' : 'fail',
    detail: sitemapOk ? 'Google has a map of every page on your site.' : 'No sitemap found, so Google may miss pages.',
    fix: 'Generate an XML sitemap and submit it in Google Search Console.' });
  add('seo', { label: 'robots.txt file', weight: 4, status: robotsOk ? 'pass' : 'warn',
    detail: robotsOk ? 'A robots.txt file guides search engine crawlers.' : 'No robots.txt file was found.',
    fix: 'Add a robots.txt file that points crawlers to your sitemap.' });
  add('seo', { label: 'Canonical tag', weight: 4, status: canonical ? 'pass' : 'warn',
    detail: canonical ? 'The page declares its preferred address, avoiding duplicate-content issues.' : 'No canonical tag, so duplicate versions of the page can compete with each other.',
    fix: 'Add a canonical tag to every page.' });
  add('seo', { label: 'Image descriptions (alt text)', weight: 6, status: images.length === 0 ? 'na' : band(imagesWithAlt / images.length, [[0.9, 'pass'], [0.5, 'warn']]), metric: images.length ? `${imagesWithAlt}/${images.length}` : '',
    detail: images.length ? `${imagesWithAlt} of ${images.length} images have descriptions Google can read.` : '',
    fix: 'Describe every image with alt text that includes the service and location where it fits.' });
  add('seo', { label: 'Internal links', weight: 4, status: band(internalLinks, [[10, 'pass'], [4, 'warn']]), metric: `${internalLinks}`,
    detail: `The homepage links to ${internalLinks} other pages on your site.`,
    fix: 'Link the homepage to each service page and key location pages.' });
  add('seo', { label: 'Language declared', weight: 2, status: lang ? 'pass' : 'warn',
    detail: lang ? `Language set to "${lang}".` : 'The page does not declare its language.', fix: 'Set the lang attribute on the page.' });
  if (psi?.seo != null) add('seo', { label: 'Google Lighthouse SEO score', weight: 8, status: band(psi.seo, [[90, 'pass'], [70, 'warn']]), metric: `${psi.seo}/100`,
    detail: `Google's automated SEO check scores the homepage ${psi.seo} out of 100.`, fix: 'Resolve the technical issues Google flags in Search Console.' });

  // ---------- AI optimization ----------
  const blockedBots = robotsOk ? AI_BOTS.filter(b => robotsBlocks(robots.body, b)) : [];
  add('ai', { label: 'AI assistants are allowed to read the site', weight: 20, status: blockedBots.length === 0 ? 'pass' : blockedBots.length < 3 ? 'warn' : 'fail',
    detail: blockedBots.length ? `Your robots.txt blocks ${blockedBots.join(', ')}. Those AI tools cannot learn about or recommend your business.` : 'ChatGPT, Claude, Perplexity and Google\'s AI crawlers are not blocked.',
    fix: 'Allow the major AI crawlers in robots.txt so AI search can recommend you.' });
  const jsShell = words < 120 && scripts > 3;
  add('ai', { label: 'Content readable without JavaScript', weight: 15, status: jsShell ? 'fail' : words < 250 ? 'warn' : 'pass', metric: `${words} words`,
    detail: jsShell ? 'Most of your text only appears after JavaScript runs. Many AI crawlers do not run JavaScript, so they see a nearly empty page.' : words < 250 ? 'There is little text for AI tools to learn from.' : 'Your main content is in the page itself where AI crawlers can read it.',
    fix: 'Serve key content as real HTML text and expand it with clear service descriptions.' });
  add('ai', { label: 'Structured data (schema markup)', weight: 15, status: schema.items.length ? 'pass' : 'fail', metric: schema.types.slice(0, 4).join(', '),
    detail: schema.items.length ? `Found structured data: ${schema.types.slice(0, 6).join(', ')}.` : 'No structured data. AI tools and Google have to guess what your business is and does.',
    fix: 'Add JSON-LD schema describing your business, services, reviews and FAQs.' });
  add('ai', { label: 'Business identity in structured data', weight: 15, status: schemaBiz ? (schemaAddr ? 'pass' : 'warn') : 'fail',
    detail: schemaBiz ? (schemaAddr ? 'Your business type, name and address are spelled out for machines.' : 'Your business is described, but without an address.') : 'No LocalBusiness or Organization markup, so AI answers may not connect your site to your business.',
    fix: 'Add LocalBusiness schema with your name, address, phone, hours, service area and social profiles.' });
  const questionHeads = headings.filter(h => /\?\s*$/.test(h)).length;
  const faq = schema.types.some(t => /FAQPage/i.test(t)) || /frequently asked|\bFAQs?\b/i.test(visible) || questionHeads >= 2;
  add('ai', { label: 'Answers common customer questions', weight: 15, status: faq ? (schema.types.some(t => /FAQPage/i.test(t)) ? 'pass' : 'warn') : 'fail',
    detail: faq ? (schema.types.some(t => /FAQPage/i.test(t)) ? 'You have FAQ content marked up for search and AI.' : 'You answer questions on the page, but they are not marked up as an FAQ.') : 'No FAQ-style content. AI assistants pull answers from pages that ask and answer real customer questions.',
    fix: 'Add an FAQ section answering the top 8–10 questions customers ask, with FAQPage schema.' });
  add('ai', { label: 'llms.txt guide for AI tools', weight: 8, status: llmsOk ? 'pass' : 'warn',
    detail: llmsOk ? 'You publish an llms.txt file that summarizes your site for AI tools.' : 'No llms.txt file. This newer standard gives AI tools a clean summary of your business.',
    fix: 'Publish an llms.txt file listing your services, service area and key pages.' });
  add('ai', { label: 'Profiles linked to your business identity', weight: 7, status: sameAs.length >= 2 ? 'pass' : sameAs.length ? 'warn' : 'fail',
    detail: sameAs.length ? `Your markup links ${sameAs.length} outside profiles to your business.` : 'Your markup does not connect your website to your Google, Facebook or other profiles.',
    fix: 'List your official profiles in schema "sameAs" so AI tools know they are all you.' });
  add('ai', { label: 'Clear page summary', weight: 5, status: description && h1s.length ? 'pass' : description || h1s.length ? 'warn' : 'fail',
    detail: description && h1s.length ? 'A heading and description summarize what you do.' : 'AI tools lack a short, clear summary of what you do.',
    fix: 'Lead the page with one sentence that says who you are, what you do and where.' });

  // ---------- Local listings ----------
  if (g.found === null) {
    add('local', { label: 'Google Business Profile', weight: 25, status: 'na', detail: 'Not checked. Add the Places API key or the profile details to include it.' });
  } else {
    add('local', { label: 'Google Business Profile found', weight: 25, status: g.found ? 'pass' : 'fail',
      detail: g.found ? (place?.found ? `Found "${place.name}"${place.category ? ` (${place.category})` : ''} at ${place.address}.` : 'You have a Google Business Profile.') : 'We could not find a Google Business Profile. You are missing from the Google Map Pack, where most local calls come from.',
      fix: 'Claim and verify your Google Business Profile, then fill out every section.' });
  }
  if (place?.found) {
    const gp = digits(place.phone);
    add('local', { label: 'Phone number matches Google', weight: 10, status: !sitePhone || !gp ? 'warn' : sitePhone === gp ? 'pass' : 'fail',
      detail: !sitePhone ? 'We could not find a phone number on your homepage to compare.' : sitePhone === gp ? 'The phone number on your site matches Google.' : `Your site shows (${sitePhone.slice(0, 3)}) ${sitePhone.slice(3, 6)}-${sitePhone.slice(6)} but Google lists ${place.phone}. Mismatches hurt local rankings.`,
      fix: 'Use one phone number everywhere: website, Google, Facebook and directories.' });
    add('local', { label: 'Google profile links to your website', weight: 8, status: place.websiteMatches ? 'pass' : place.website ? 'fail' : 'fail',
      detail: place.websiteMatches ? 'Your Google profile sends people to this website.' : place.website ? `Your Google profile links to ${place.website}, not this site.` : 'Your Google profile has no website link.',
      fix: 'Add your website to your Google Business Profile.' });
    add('local', { label: 'Business hours on Google', weight: 6, status: place.hasHours ? 'pass' : 'fail',
      detail: place.hasHours ? 'Your hours are listed.' : 'No hours are listed, so Google may show you as closed or skip you.', fix: 'Add regular and holiday hours to your profile.' });
    add('local', { label: 'Photos on Google', weight: 6, status: band(place.photoCount, [[10, 'pass'], [3, 'warn']]), metric: place.photoCount >= 10 ? '10+' : String(place.photoCount),
      detail: place.photoCount >= 10 ? 'Your profile has plenty of photos.' : `Your profile has only ${place.photoCount} photos. Profiles with photos get far more calls and direction requests.`,
      fix: 'Upload new photos of your work, team and location every month.' });
    add('local', { label: 'Listed as open', weight: 5, status: place.status === 'OPERATIONAL' || !place.status ? 'pass' : 'fail',
      detail: place.status && place.status !== 'OPERATIONAL' ? `Google shows your business as ${place.status.toLowerCase().replace(/_/g, ' ')}.` : 'Google shows the business as open.',
      fix: 'Correct your business status in Google Business Profile.' });
  }
  add('local', { label: 'Phone number on website', weight: 10, status: sitePhone ? 'pass' : 'fail',
    detail: sitePhone ? 'Your phone number is on the homepage.' : 'We could not find a phone number on the homepage.', fix: 'Show your phone number in the header and footer of every page.' });
  add('local', { label: 'Address or service area on website', weight: 10, status: siteAddress ? 'pass' : cityRe && cityRe.test(visible) ? 'warn' : 'fail',
    detail: siteAddress ? 'Your address is listed on the site.' : 'No street address found on the homepage. Google uses it to confirm where you are.',
    fix: 'Add your full address (or service area) in the footer, matching Google exactly.' });
  add('local', { label: 'Local business markup', weight: 10, status: schemaBiz && schemaAddr ? 'pass' : schemaBiz ? 'warn' : 'fail',
    detail: schemaBiz && schemaAddr ? 'Your location details are in local business schema.' : 'Your location details are not marked up for search engines.',
    fix: 'Add LocalBusiness schema with your exact name, address and phone.' });
  const mapLink = /google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|g\.page\//i.test(raw);
  add('local', { label: 'Map or directions on website', weight: 6, status: mapLink ? 'pass' : 'warn',
    detail: mapLink ? 'Your site links to your Google Maps location.' : 'There is no map or directions link on the homepage.', fix: 'Embed your Google map on the contact page and link to directions.' });

  // ---------- Reviews ----------
  if (g.rating != null) {
    add('reviews', { label: 'Google star rating', weight: 25, status: band(g.rating, [[4.5, 'pass'], [4.0, 'warn']]), metric: `${g.rating.toFixed(1)} ★`,
      detail: g.rating >= 4.5 ? `A strong ${g.rating.toFixed(1)}-star average.` : `A ${g.rating.toFixed(1)}-star average. Most customers filter for 4.5 stars or higher before they call.`,
      fix: 'Ask every happy customer for a review and respond to every negative one.' });
  } else {
    add('reviews', { label: 'Google star rating', weight: 25, status: g.found === false ? 'fail' : 'na',
      detail: g.found === false ? 'No Google profile means no Google rating.' : 'Not checked. Add the Places API key or enter the rating.', fix: 'Get on Google and start collecting reviews.' });
  }
  if (g.reviewCount != null) {
    add('reviews', { label: 'Number of Google reviews', weight: 25, status: band(g.reviewCount, [[75, 'pass'], [25, 'warn']]), metric: `${g.reviewCount}`,
      detail: `You have ${g.reviewCount} Google reviews.${g.reviewCount < 75 ? ' Top local competitors usually have 75 to several hundred.' : ''}`,
      fix: 'Set up an automatic review request by text and email after every job.' });
  } else if (g.found === false) {
    add('reviews', { label: 'Number of Google reviews', weight: 25, status: 'fail', detail: 'No Google profile means no reviews on Google.', fix: 'Claim your profile and start a review request system.' });
  }
  if (g.newestReviewDays != null) {
    add('reviews', { label: 'Recent reviews', weight: 15, status: band(-g.newestReviewDays, [[-30, 'pass'], [-90, 'warn']]), metric: `${g.newestReviewDays} days ago`,
      detail: g.newestReviewDays <= 30 ? 'You received a review in the last month.' : `Your newest review shown by Google is ${g.newestReviewDays} days old. Fresh reviews tell customers and Google you are active.`,
      fix: 'Aim for new reviews every week with an automated request system.' });
  }
  const reviewWidget = /elfsight|trustindex|birdeye|podium|grade\.us|nicejob|embedsocial|reviewsonmywebsite|trustpilot|yotpo|shapo|widget.*review|review.*widget/i.test(raw);
  const testimonials = reviewWidget || /testimonial|what (our )?(customers|clients) (are )?say|customer reviews|\breviews\b/i.test(visible);
  add('reviews', { label: 'Reviews shown on your website', weight: 15, status: reviewWidget ? 'pass' : testimonials ? 'warn' : 'fail',
    detail: reviewWidget ? 'A live review feed shows social proof on your site.' : testimonials ? 'You show testimonials, but not a live feed of your Google reviews.' : 'Your homepage shows no reviews or testimonials.',
    fix: 'Add a live Google reviews feed to the homepage and service pages.' });
  const rated = schema.items.some(i => i.aggregateRating || /AggregateRating|Review/.test([].concat(i['@type']).join(' ')));
  add('reviews', { label: 'Review stars in search results', weight: 10, status: rated ? 'pass' : 'fail',
    detail: rated ? 'Your reviews are marked up so search tools can read them.' : 'Your reviews are not marked up for search engines or AI tools.',
    fix: 'Add review schema to pages that show genuine customer reviews.' });
  const reviewLink = /search\.google\.com\/local\/writereview|g\.page\/r\/|\/review\b|yelp\.com\/biz|bbb\.org/i.test(links.join(' '));
  add('reviews', { label: 'Easy link to leave a review', weight: 10, status: reviewLink ? 'pass' : 'warn',
    detail: reviewLink ? 'Customers can find a link to review you.' : 'There is no "leave a review" link for happy customers.',
    fix: 'Add a "Review us on Google" button and use the short link in follow-up messages.' });

  // ---------- Social ----------
  const socialList = Object.keys(socialFound);
  add('social', { label: 'Facebook page linked', weight: 20, status: socialFound.facebook ? 'pass' : 'fail',
    detail: socialFound.facebook ? 'Your site links to your Facebook page.' : 'We found no link to a Facebook page. Many local customers check Facebook before they call.',
    fix: 'Link your Facebook page in the header or footer, and keep it active.' });
  add('social', { label: 'Instagram linked', weight: 12, status: socialFound.instagram ? 'pass' : 'warn',
    detail: socialFound.instagram ? 'Your site links to Instagram.' : 'No Instagram link found.', fix: 'Show your work on Instagram and link to it.' });
  add('social', { label: 'Number of social profiles', weight: 13, status: band(socialList.length, [[3, 'pass'], [1, 'warn']]), metric: `${socialList.length}`,
    detail: socialList.length ? `Found: ${socialList.map(k => SOCIAL.find(s => s.key === k).name).join(', ')}.` : 'No social profiles are linked from the website.',
    fix: 'Claim your name on the platforms your customers use and link them from your site.' });
  const og = ['og:title', 'og:description', 'og:image'].filter(k => meta(html, k));
  add('social', { label: 'Share preview (Open Graph)', weight: 20, status: og.length === 3 ? 'pass' : og.length ? 'warn' : 'fail', metric: `${og.length}/3`,
    detail: og.length === 3 ? 'Links to your site show a title, description and image when shared.' : 'When someone shares your site on Facebook or by text, it shows a blank or broken preview.',
    fix: 'Add Open Graph tags with a strong image so shared links look professional.' });
  add('social', { label: 'X / Twitter card', weight: 5, status: meta(html, 'twitter:card') ? 'pass' : 'warn',
    detail: meta(html, 'twitter:card') ? 'Shared links show a rich card on X.' : 'No Twitter card tags.', fix: 'Add twitter:card tags.' });
  const pixel = /connect\.facebook\.net\/[^"']*fbevents|fbq\(/i.test(raw);
  add('social', { label: 'Meta (Facebook) Pixel installed', weight: 15, status: pixel ? 'pass' : 'fail',
    detail: pixel ? 'You can retarget visitors with Facebook and Instagram ads.' : 'No Meta Pixel, so you cannot retarget site visitors on Facebook and Instagram.',
    fix: 'Install the Meta Pixel and Conversions API to retarget visitors and track leads from ads.' });
  add('social', { label: 'Social profiles connected in markup', weight: 15, status: sameAs.some(s => SOCIAL.some(x => { try { return x.re.test(new URL(s).hostname); } catch { return false; } })) ? 'pass' : 'warn',
    detail: sameAs.length ? 'Your social profiles are tied to your business in schema.' : 'Your social profiles are not tied to your business in schema.',
    fix: 'List social profiles in your schema "sameAs" property.' });

  // ---------- Scores ----------
  const value = { pass: 1, warn: 0.5, fail: 0 };
  const categories = CATEGORIES.map(c => {
    const list = checks[c.key];
    const scored = list.filter(x => x.status !== 'na');
    const max = scored.reduce((s, x) => s + x.weight, 0);
    const got = scored.reduce((s, x) => s + x.weight * value[x.status], 0);
    const score = max ? Math.round((got / max) * 100) : null;
    return { ...c, score, checks: list, unverified: list.filter(x => x.status === 'na').length };
  });
  const scoredCats = categories.filter(c => c.score != null);
  const wsum = scoredCats.reduce((s, c) => s + c.weight, 0);
  const overall = wsum ? Math.round(scoredCats.reduce((s, c) => s + c.score * c.weight, 0) / wsum) : 0;

  const priorities = categories
    .flatMap(c => c.checks.filter(x => x.status === 'fail' || x.status === 'warn').map(x => ({ ...x, category: c.name, impact: x.weight * (x.status === 'fail' ? 1 : 0.5) * c.weight })))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 6);

  const platform = /wp-content|wp-includes/i.test(raw) ? 'WordPress' : /wixstatic|wix\.com/i.test(raw) ? 'Wix' : /squarespace/i.test(raw) ? 'Squarespace' : /cdn\.shopify|shopify/i.test(raw) ? 'Shopify' : /godaddy|websitebuilder/i.test(raw) ? 'GoDaddy Builder' : /weebly/i.test(raw) ? 'Weebly' : /duda|dudamobile/i.test(raw) ? 'Duda' : '';

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    url: target.href,
    finalUrl: finalUrl.href,
    domain,
    business: { name: place?.found ? place.name : guessedName, city, phone: sitePhone, platform, title },
    google: place?.found ? { ...place } : { source: g.source, rating: g.rating, reviewCount: g.reviewCount, found: g.found, error: place?.error },
    pagespeed: psi,
    overall,
    grade: overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 70 ? 'C' : overall >= 60 ? 'D' : 'F',
    categories,
    priorities,
    counts: {
      pass: categories.flatMap(c => c.checks).filter(x => x.status === 'pass').length,
      warn: categories.flatMap(c => c.checks).filter(x => x.status === 'warn').length,
      fail: categories.flatMap(c => c.checks).filter(x => x.status === 'fail').length,
    },
  };
}

module.exports = { runAudit, normalizeUrl, robotsBlocks, CATEGORIES };
