# Audit Desk — Mid-America Web Solutions

Type in a prospect's website and get a scored, customer-ready audit in about 30–60 seconds. Send the report link or save it as a PDF.

The report gives an **overall score (0–100, A–F grade)** plus six category scores:

| Category | Weight | What it checks |
|---|---|---|
| Website Health | 20% | HTTPS, mobile layout, Google PageSpeed mobile score, layout stability, accessibility, page weight, compression, tap-to-call, lead form, footer date, favicon, Google Analytics |
| SEO | 20% | noindex, title, meta description, H1, subheadings, word count, city targeting, sitemap, robots.txt, canonical, alt text, internal links, language, Lighthouse SEO |
| AI Optimization | 15% | AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) allowed, content readable without JavaScript, schema markup, LocalBusiness identity, FAQ content, llms.txt, `sameAs` profiles |
| Local Listings | 20% | Google Business Profile found, phone match with Google, website link, hours, photos, open status, phone and address on site, local schema, map link |
| Reviews | 15% | Google rating, review count, newest review age, reviews on site, review schema, "leave a review" link |
| Social Media | 10% | Facebook, Instagram and other profiles, Open Graph share preview, Twitter card, Meta Pixel, social profiles in schema |

Every failed or weak item comes with a plain-English explanation and "How we'd fix it" line, and the top six are ranked by impact at the top of the report. Items that could not be checked are marked "Not checked" and left out of the score.

## Run it

Requires Node.js 18.17 or newer. There are no dependencies to install.

```bash
npm start            # http://localhost:3000
npm test             # audits a local sample site
```

## Settings (environment variables)

| Variable | Purpose |
|---|---|
| `GOOGLE_PLACES_API_KEY` | **Recommended.** Looks up the Google Business Profile automatically (rating, review count, newest review, hours, photos, phone match). Without it, enter rating and review count on the form. Enable "Places API (New)" in Google Cloud. |
| `PAGESPEED_API_KEY` | **Recommended.** Google PageSpeed Insights key (free). Without it, Google rate-limits requests and the speed checks fall back to server response time. |
| `ADMIN_PASSWORD` | Protects the audit form with a password (any username). Report links stay public so customers can open them. |
| `AGENCY_NAME` | Defaults to "Mid-America Web Solutions". |
| `AGENCY_PHONE`, `AGENCY_EMAIL`, `AGENCY_WEBSITE` | Shown in the call-to-action at the bottom of every report. |
| `AGENCY_BOOKING_URL` | Adds a "Book a free strategy call" button to reports. |
| `DATA_DIR` | Where reports are saved (default `data/reports`). Use a persistent disk in production. |
| `PORT` | Default 3000. |

## Deploy

Any Node host works. On **Render**: New → Web Service → this repo, build command `npm install`, start command `npm start`, add the variables above, and attach a persistent disk mounted at `/var/data` with `DATA_DIR=/var/data/reports` so report links keep working after redeploys. Railway, Fly.io or a small VPS work the same way.

## Endpoints

- `GET /` — audit form and recent audits (password-protected if set)
- `POST /audit` — runs an audit and redirects to the report
- `GET /r/:id` — customer report; add `?format=json` for raw data
- `GET /api/audit?url=…&city=…` — run an audit and return JSON (for Zapier, a CRM, or a public lead form)

## Use it as a Claude skill ("seo report")

The same engine ships as a Claude skill in `.claude/skills/seo-report/`. Say **"seo report acmeplumbing.com"** (or `/seo-report acmeplumbing.com Wichita, KS`) and Claude looks up the Google rating and review count, runs the audit, publishes the report page and writes a short message you can send the prospect.

- **Claude Code:** works automatically in this repo. To use it in every project, copy `.claude/skills/seo-report` to `~/.claude/skills/`.
- **claude.ai (chat or Cowork):** upload `dist/seo-report.zip` under Settings → Capabilities → Skills. Code execution needs network access to reach websites.
- **Your contact details:** fill in `.claude/skills/seo-report/agency.json` so every report ends with your phone, email and booking link.

The skill keeps its own copy of `lib/`. After changing `lib/`, run `npm run build:skill` to refresh it and the zip; `npm test` fails if they drift apart.
