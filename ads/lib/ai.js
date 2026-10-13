// Fresh ad copy from Claude. Used alongside the copy library so batches don't
// recycle the same sentences. Needs ANTHROPIC_API_KEY (or an `ant auth login` profile).
const Anthropic = require('@anthropic-ai/sdk');
const { LIMITS, HOOKS, HEADLINES } = require('./copy');

const MODEL = process.env.AD_MODEL || 'claude-opus-5-5';

const SCHEMA = {
  type: 'object',
  properties: {
    ads: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          hook: { type: 'string' },
          offer: { type: 'string' },
          closer: { type: 'string' },
          headline: { type: 'string' },
          description: { type: 'string' },
          image_title: { type: 'string' },
          image_sub: { type: 'string' },
        },
        required: ['hook', 'offer', 'closer', 'headline', 'description', 'image_title', 'image_sub'],
        additionalProperties: false,
      },
    },
  },
  required: ['ads'],
  additionalProperties: false,
};

const SYSTEM = `You write Facebook and Instagram ad copy for Mid-America Web Solutions, a web design and SEO agency in Belleville, Illinois.

The offer: a free website audit. The business owner requests it, and we send a report with an overall score out of 100 plus grades for six areas: Website Health, SEO, AI Optimization (visibility in ChatGPT, Google AI Overviews and similar tools), Local Listings (Google Business Profile), Reviews (Google rating compared with local competitors) and Social Media. It also ranks the top fixes by impact. It is free with no obligation.

Audience: owners of local businesses in the industry named in the request. Write the way a friendly, plain-spoken local expert talks to a busy owner.

Rules, all required:
- Never promise rankings, traffic, calls or revenue. Never invent statistics, percentages, client counts or testimonials.
- Never assert or imply personal attributes of the reader (Meta policy). Speak about their business or website, not about them as a person. Questions like "Is your website costing you calls?" are fine.
- No ALL CAPS words, no emoji, no hashtags, no exclamation marks, no clickbait.
- hook: one or two sentences that open the ad and stop the scroll. At most 150 characters.
- offer: one or two sentences describing what the free audit includes. At most 240 characters.
- closer: one short call to action. At most 70 characters.
- headline: at most ${LIMITS.headline} characters.
- description: at most ${LIMITS.description} characters.
- image_title: text printed large on the ad image, at most ${LIMITS.imageTitle} characters, ideally 2 to 6 words.
- image_sub: smaller line under it on the image, at most ${LIMITS.imageSub} characters.
- Every ad in the batch must use a different angle: speed, AI search, Google rating versus competitors, reviews, being found locally, mobile experience, missed calls, outdated website, curiosity about the score, and so on.

Examples of hooks already in use (write new ones, do not copy these): ${HOOKS.slice(0, 5).map(h => JSON.stringify(h)).join(', ')}.
Examples of headlines already in use: ${HEADLINES.slice(0, 5).map(h => JSON.stringify(h)).join(', ')}.`;

function valid(ad) {
  const bad = /!|#|[\u{1F300}-\u{1FAFF}]|\bguarantee|\b\d+%|\b\d+x\b/iu;
  return ad.hook.length <= 150 && ad.offer.length <= 240 && ad.closer.length <= 70
    && ad.headline.length <= LIMITS.headline && ad.description.length <= LIMITS.description
    && ad.image_title.length <= LIMITS.imageTitle && ad.image_sub.length <= LIMITS.imageSub
    && ![ad.hook, ad.offer, ad.closer, ad.headline, ad.description, ad.image_title, ad.image_sub].some(t => bad.test(t));
}

// Returns up to `count` validated ads for one industry, or [] if the API is unavailable.
async function writeAds({ industry, city, count, avoid = [] }) {
  const client = new Anthropic();
  const request = `Write ${count} different ads for ${industry.plural}${city ? ` in and around ${city}` : ''}.${avoid.length ? `\nThese hooks were used in earlier batches, so take different angles:\n${avoid.slice(-30).map(h => `- ${h}`).join('\n')}` : ''}`;
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: request }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.warn('Claude copy skipped: no valid Anthropic API key.');
    else if (err instanceof Anthropic.RateLimitError) console.warn('Claude copy skipped: rate limited.');
    else if (err instanceof Anthropic.APIError) console.warn(`Claude copy skipped: API error ${err.status}: ${err.message}`);
    else console.warn(`Claude copy skipped: ${err.message}`);
    return [];
  }
  if (response.stop_reason === 'refusal') {
    console.warn(`Claude declined the request for ${industry.plural}.`);
    return [];
  }
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try {
    const ads = JSON.parse(text).ads || [];
    const kept = ads.filter(valid);
    if (kept.length < ads.length) console.warn(`Dropped ${ads.length - kept.length} Claude ads for ${industry.plural} that broke length or wording rules.`);
    return kept;
  } catch {
    console.warn(`Claude returned unreadable copy for ${industry.plural}; using the library instead.`);
    return [];
  }
}

module.exports = { writeAds, MODEL };
