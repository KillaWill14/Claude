---
name: seo-report
description: Creates a scored, customer-ready website audit branded for Mid-America Web Solutions. Use whenever the user says "seo report", "website audit", "free audit" or "audit" followed by a website, or asks how a business website is doing, unless they mention Bold Form (that is the boldform-seo-report skill). Scores Website Health, SEO, AI Optimization, Local Listings, Reviews and Social Media, compares Google ratings with local competitors, gives an overall grade, and publishes a report page they can send to the prospect.
---
<!-- Generated from tools/skill/SKILL.template.md by tools/build-skill.sh. Edit the template, not this file. -->

# SEO Report: Mid-America Web Solutions

Produces the Mid-America Web Solutions free website audit for one prospect website: an overall score and grade, six category scores, the top fixes ranked by impact, and a detailed checklist with "How we'd fix it" lines. The scoring is done by the bundled script so every report is scored the same way. Your job is to gather the inputs, run it, publish the report, and summarize it.

`SKILL_DIR` below means the folder this file is in.

## 1. Read the request

**Brand.** Every report from this skill carries the Mid-America Web Solutions logo, colors and contact details (`--brand midamerica`). If the user wants the report for Bold Form Marketing instead, use the boldform-seo-report skill (or tell them to upload it if it isn't available).

From the user's message take:
- **Website** (required). If they gave only a business name, search the web for its official site and confirm it with them if there is any doubt.
- **City, State** and **business name**, if given. If not, leave them out; the script reads them from the site. If the site names a clear home city, pass it with `--city` so the local SEO checks run.

If the user asks for several reports at once, do the steps below for each site.

## 2. Look up Google ratings

The report opens with a Google rating panel (stars, review count, newest review, link to the listing) and a "How you compare on Google" chart against local competitors. The Local Listings and Reviews scores also depend on this data, so do this step every time. Skip it only when `GOOGLE_PLACES_API_KEY` is set in the environment; the script then looks up the business and its top three competitors itself.

**The prospect.** Search the web for the business name with its city and words like "reviews" or "Google", and try a second wording if the first finds nothing. Google's own results and the Google Maps listing usually show the rating and count together, like "4.6 ★ (37)". Note:
- whether a Google Business Profile exists → `--profile yes` or `--profile no`
- star rating → `--rating 4.6`
- number of Google reviews → `--reviews 37`
- age in days of the newest review, if you can see it → `--newest-review-days 12`
- the Google Maps link for the listing, if you have it → `--maps-url "https://maps.google.com/..."`

**Competitors.** Search for the business's main service in its city (for example "plumber Salina KS"). From the Google results or Maps, take the three best-known competitors that show a Google rating and review count, and pass each one:
`--competitor "Smith Plumbing | 4.8 | 212"`. Leave out the prospect itself, national chains with no local office, and directories.

Use only numbers you actually saw, and only Google ratings (not Yelp, Facebook or BBB). Never estimate or carry over numbers from another business. If you cannot find something, leave that flag out; the report marks it "Not checked" and keeps it out of the score, and the comparison chart only appears when you pass at least one competitor. Pass `--profile no` only when you searched properly and found no listing; the report then shows a "No Google Business Profile found" panel.

## 3. Run the audit

```bash
node SKILL_DIR/scripts/run.js <website> --brand midamerica --city "City, ST" --name "Business Name" \
  --rating 4.6 --reviews 37 --profile yes --maps-url "<listing link>" \
  --competitor "Name | 4.8 | 212" --competitor "Name | 4.5 | 96" --out <output folder>
```

Use the scratchpad or outputs folder for `--out` when you have one, otherwise the current folder. Node 18 or newer is required; no packages need installing. It takes 30–90 seconds because it also runs Google PageSpeed. Set `PAGESPEED_API_KEY` if available to avoid Google rate limits; without it the speed checks may fall back to server response time.

The script prints the scores and writes three files:
- `<domain>-report.html`: the report page, ready to publish as an Artifact (no doctype, no buttons).
- `<domain>-report-standalone.html`: a complete web page with "Save as PDF" and "Copy link" buttons, for opening in a browser.
- `<domain>-audit.json`: the raw results.

### If the script says NETWORK_BLOCKED

The sandbox cannot reach outside websites. First try `curl -sL <url>`; if that also fails, either:
- **Ask the user to allow network access** for this environment (in claude.ai: Settings → Capabilities → code execution network access set to all domains; in Claude Code on the web: the environment's network access setting), then rerun; or
- **Fetch the pages with your own web fetch tool**, but only if it returns the raw HTML source (tags, `<meta>`, `<script type="application/ld+json">` intact). Save the files into one folder: the homepage as `homepage.html`, plus `robots.txt`, `sitemap.xml` and `llms.txt` from the site root when they exist (do not create a file for one that returns 404). Then rerun with `--pages <folder>`. Speed and compression are marked "Not checked" in this mode. If you can get the PageSpeed Insights API response (`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=<site>&strategy=mobile&category=performance&category=accessibility&category=seo`), save it and pass `--pagespeed <file>`.

If your fetch tool only returns readable text or markdown, do not use `--pages`: meta tags and structured data would be missing and the report would wrongly fail those checks. Tell the user the network needs to be enabled instead.

## 4. Publish the report

- **With the Artifact tool (Claude Code / claude.ai artifacts):** publish `<domain>-report.html` as-is with icon `chart` and a one-sentence description like "Website audit for <Business> (<domain>)". Do not rewrite or restyle it. Artifacts start private: remind the user to use the page's Share menu to make a link the prospect can open.
- **Without an Artifact tool:** give the user `<domain>-report-standalone.html` (send or attach the file). It opens in any browser and its "Save as PDF" button prints it.

Never edit scores or findings by hand. If something looks wrong (for example the site blocked the scanner and returned an error page), tell the user instead of publishing.

## 5. Reply to the user

Keep it short:
1. The report link (or file).
2. Overall score and grade, the Google rating with review count (and how it compares with the competitors), then the six category scores in one compact list.
3. The top three fixes in one line each.
4. Any gaps: items "Not checked", Google data you could not find, or a missing PageSpeed result.
5. A ready-to-send message to the prospect, 3–4 sentences, plain and friendly, that names one or two specific findings and offers a call. Example tone: "Hi Dana, I ran a free audit of prairiecreekplumbing.com. You're getting good reviews, but Google can't tell what city you serve and AI tools like ChatGPT are blocked from reading your site. The full report is here: <link>. Happy to walk you through it in 15 minutes this week."

To change the phone, email, website or booking link on reports, edit `brands/midamerica/brand.json` in the repository and run `./tools/build-skill.sh`. The bundled copy is `SKILL_DIR/scripts/brands/midamerica/brand.json`.
