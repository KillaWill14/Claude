# Ad Factory: free website audit ads

Generates Facebook and Instagram ads for the free audit, branded for Mid-America Web Solutions or Bold Form Marketing (`--brand midamerica|boldform`): scorecard-style images in each brand's colors, fonts and logo, primary text, headline, description and button, a feed-style preview of every ad, and an optional upload to Meta.

```bash
cd ads
npm ci                       # first time only
npx playwright install chromium   # first time only, if Chromium is not installed
node generate.js --brand midamerica --count 100 --cities "Belleville, IL;O'Fallon, IL" --ai
```

Open `out/ads/<batch>/preview.html` to review. `ads.csv` lists every ad with its UTM-tagged link and image files.

## Options

| Option | Default | Notes |
|---|---|---|
| `--brand` | `BRAND` or midamerica | `midamerica` or `boldform`. Palettes: `brand`, `light`, `navy` (Mid-America); `cream`, `purple`, `white` (Bold Form). |
| `--count` | 20 | Ads per batch. Rendering takes well under a second per image. |
| `--industries` | all | `plumbers, hvac, roofers, electricians, contractors, landscapers, cleaning, pest, painters, auto, dentists, chiropractors, medspas, salons, restaurants, lawyers, realtors, insurance, accountants, vets, gyms, churches, local` |
| `--cities` | none | Semicolon-separated. Adds "in Belleville" style local wording. |
| `--sizes` | square,story | `square` 1080×1080, `portrait` 1080×1350, `story` 1080×1920 |
| `--templates` | all | `scorecard`, `ring`, `stand`, `headline` |
| `--palettes` | all | Depends on the brand (see `--brand`) |
| `--ai` / `--ai-share` | off / 0.5 | Mixes in fresh Claude-written copy (needs `ANTHROPIC_API_KEY`). Model: `AD_MODEL`, default `claude-opus-5-5`. |
| `--link` | `AD_LINK` or the contact page | Where the ad sends people. UTM tags are added per ad. |
| `--seed`, `--out`, `--no-images` | | Repeatable batches, output folder, copy only |

Every ad is recorded in `history-<brand>.jsonl`, and later batches skip anything already made. Commit that file (the daily workflow does it for you).

## Upload to Meta

```bash
node upload-meta.js ../out/ads/<batch> --adset 1234567890          # dry run
node upload-meta.js ../out/ads/<batch> --adset 1234567890 --live   # creates PAUSED ads
```

Set `META_ACCESS_TOKEN` (a system user token with `ads_management`), `META_AD_ACCOUNT_ID` and `META_PAGE_ID`. Set `META_LEAD_FORM_ID` to send people to an Instant Form instead of a website. The uploader uses the square image for every placement; the story images are there if you add them in Ads Manager. Reruns skip ads already uploaded (`meta-upload.json`).

## Daily automation

`.github/workflows/daily-ads.yml` runs every morning for each brand listed in the `AD_BRANDS_ENABLED` variable (and on demand from the Actions tab for one brand): it builds a batch, saves it as a downloadable artifact, uploads it to Meta as paused ads if the Meta secrets and `META_ADSET_ID` are set, and commits `history.jsonl`. Scheduled workflows only run from the repository's default branch, so merge this branch first. See the comment at the top of the workflow for the secrets and variables it reads.

## Copy rules

Everything in `lib/copy.js` and everything Claude writes must avoid promised results, invented statistics, claims about the reader's personal attributes, exclamation marks and hashtags, and stay within Meta's display lengths. `npm test` checks the library against these rules.
