---
name: fb-ads
description: Generates Facebook and Instagram ads promoting the Mid-America Web Solutions free website audit, with images, copy, a feed preview and optional upload to Meta. Use when the user says "make ads", "fb ads", "ad batch", "generate ads" or asks for Facebook ad copy or creatives for the free audit, optionally naming a count, industries or cities.
---

# Free-audit ad batches

The generator lives in `ads/` at the repository root. It mixes a vetted copy library with optional fresh copy from Claude, renders scorecard-style images in Mid-America colors, never repeats an ad from an earlier batch (`ads/history.jsonl`), and can upload ads to Meta as paused.

## 1. Read the request

Take from the user's message, with these defaults:
- **count**: number of ads (default 25)
- **industries**: any of `plumbers, hvac, roofers, electricians, contractors, landscapers, cleaning, pest, painters, auto, dentists, chiropractors, medspas, salons, restaurants, lawyers, realtors, insurance, accountants, vets, gyms, churches, local` (default all). Map plain words to these keys, such as "AC companies" to `hvac` or "law firms" to `lawyers`.
- **cities**: semicolon-separated, such as `Belleville, IL;O'Fallon, IL` (default none, which keeps copy location-free)
- **sizes**: `square`, `portrait`, `story` (default `square,story`)

## 2. Set up once per session

```bash
cd ads && npm ci
```
If image rendering later fails because Chromium is missing, run `npx playwright install chromium` (skip this where `PLAYWRIGHT_BROWSERS_PATH` already provides it).

## 3. Generate

```bash
node generate.js --count 25 --industries plumbers,roofers --cities "Belleville, IL" --ai --out ../out/ads/<short-name>
```

`--ai` adds Claude-written variations when `ANTHROPIC_API_KEY` is set; without a key it prints a warning and uses the library only, which is fine. Use `--no-images` only if the user wants copy alone.

## 4. Show the batch

The output folder holds `preview.html` (each ad as it looks in the feed), `ads.csv`, `ads.json` and `images/`.
- **With the Artifact tool:** publish `preview.html` with the square images as supporting files (`files` mapping `images/<name>-square.png` for each ad, `root` set to the batch folder), icon `megaphone`. If the HTML starts with a doctype, publish a copy containing only the `<title>`, `<style>` and the body's content.
- **Otherwise:** give the user the folder path and `ads.csv`.

Then reply in a few lines: how many ads, the industries and cities, how many came from Claude vs the library, and 2 or 3 sample headlines.

## 5. Upload to Meta (only when asked)

Always run the dry run first and show the user what it will create:
```bash
node upload-meta.js ../out/ads/<short-name> --adset <AD_SET_ID>
```
Only add `--live` after the user confirms in this conversation, since it creates real ads in their account. Ads are created PAUSED. It needs `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` and `META_PAGE_ID` (plus optional `META_LEAD_FORM_ID` to open an Instant Form). Never pass `--status ACTIVE` unless the user explicitly asks for ads to go live.

## Writing new copy by hand

If the user asks for ad copy without the generator, follow the rules in `ads/lib/copy.js` and `ads/lib/ai.js`: never promise rankings or results, never invent statistics or testimonials, never assert personal attributes of the reader, no exclamation marks, headline at most 40 characters, description at most 30.
