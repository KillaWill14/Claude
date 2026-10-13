// Copy library for the free-audit ads. Placeholders:
//   {plural} plumbers   {Plural} Plumbers   {customers} homeowners
//   {biz} plumbing business   {search} a plumber   {inCity} " in Belleville" or ""
// Rules for anything added here: no guaranteed rankings or results, no invented
// statistics, no claims about the reader's personal attributes (Meta policy).

const INDUSTRIES = [
  { key: 'plumbers', plural: 'plumbers', biz: 'plumbing business', customers: 'homeowners', search: 'a plumber' },
  { key: 'hvac', plural: 'HVAC companies', Plural: 'HVAC Companies', biz: 'HVAC business', customers: 'homeowners', search: 'AC repair' },
  { key: 'roofers', plural: 'roofers', biz: 'roofing company', customers: 'homeowners', search: 'a roofer' },
  { key: 'electricians', plural: 'electricians', biz: 'electrical business', customers: 'homeowners', search: 'an electrician' },
  { key: 'contractors', plural: 'contractors', biz: 'contracting business', customers: 'homeowners', search: 'a contractor' },
  { key: 'landscapers', plural: 'landscapers', biz: 'landscaping company', customers: 'homeowners', search: 'a landscaper' },
  { key: 'cleaning', plural: 'cleaning companies', Plural: 'Cleaning Companies', biz: 'cleaning business', customers: 'customers', search: 'a cleaning service' },
  { key: 'pest', plural: 'pest control companies', Plural: 'Pest Control Pros', biz: 'pest control business', customers: 'homeowners', search: 'pest control' },
  { key: 'painters', plural: 'painters', biz: 'painting company', customers: 'homeowners', search: 'a house painter' },
  { key: 'auto', plural: 'auto repair shops', Plural: 'Auto Shops', biz: 'auto shop', customers: 'drivers', search: 'auto repair' },
  { key: 'dentists', plural: 'dentists', biz: 'dental practice', customers: 'new patients', search: 'a dentist' },
  { key: 'chiropractors', plural: 'chiropractors', biz: 'practice', customers: 'new patients', search: 'a chiropractor' },
  { key: 'medspas', plural: 'med spas', Plural: 'Med Spas', biz: 'med spa', customers: 'new clients', search: 'a med spa' },
  { key: 'salons', plural: 'salons', biz: 'salon', customers: 'new clients', search: 'a hair salon' },
  { key: 'restaurants', plural: 'restaurants', biz: 'restaurant', customers: 'hungry locals', search: 'a place to eat' },
  { key: 'lawyers', plural: 'law firms', Plural: 'Law Firms', biz: 'law firm', customers: 'potential clients', search: 'a lawyer' },
  { key: 'realtors', plural: 'real estate agents', Plural: 'Real Estate Agents', biz: 'real estate business', customers: 'buyers and sellers', search: 'a real estate agent' },
  { key: 'insurance', plural: 'insurance agencies', Plural: 'Insurance Agencies', biz: 'agency', customers: 'new clients', search: 'an insurance agent' },
  { key: 'accountants', plural: 'accountants', biz: 'accounting firm', customers: 'new clients', search: 'an accountant' },
  { key: 'vets', plural: 'veterinarians', biz: 'veterinary clinic', customers: 'pet owners', search: 'a vet' },
  { key: 'gyms', plural: 'gyms', biz: 'gym', customers: 'new members', search: 'a gym' },
  { key: 'churches', plural: 'churches', biz: 'church', customers: 'new visitors', search: 'a church' },
  { key: 'local', plural: 'local businesses', Plural: 'Local Businesses', biz: 'business', customers: 'customers', search: 'businesses like yours' },
].map(i => ({ ...i, Plural: i.Plural || i.plural.replace(/\b\w/g, c => c.toUpperCase()) }));

const HOOKS = [
  'Not sure if {customers} can find your {biz} online?',
  'When someone searches for {search}{inCity}, do they find you or your competitor?',
  'Your website might look fine and still be costing you calls.',
  'ChatGPT and Google\'s AI answers now recommend local businesses. Is yours one of them?',
  'How does your Google rating stack up against other {plural}{inCity}?',
  'Most {customers} check Google, your reviews and your website before they ever call.',
  'Is your website working as hard as you are?',
  'Find out what\'s keeping your {biz} off the first page of Google.',
  '{Plural}: do you know your website\'s score?',
  'Your next customer is searching right now. Will they find you?',
  'A slow or outdated website can quietly send {customers} to the competition.',
  'Wondering why the phone isn\'t ringing more?',
  'Is your Google Business Profile helping you or hurting you?',
  'Get a clear picture of how your {biz} shows up online{inCity}.',
  'Before {customers} call, they compare. Here\'s how to see what they see.',
  'AI search is changing how {customers} find {plural}. Is your website ready?',
];

const OFFERS = [
  'We\'ll audit your website, SEO, AI search visibility, Google listing, reviews and social media, then send you a report with an overall score and a grade in each area.',
  'Our free audit scores your online presence in 6 areas: website, SEO, AI optimization, local listings, reviews and social media. You\'ll see exactly what\'s working and what isn\'t.',
  'Get a free report showing your overall score, how your Google rating compares to nearby competitors, and the top fixes ranked by impact.',
  'In one easy report you\'ll see your website score, your Google rating next to your competitors, and a plain-English list of what to fix first.',
  'No jargon. Just a clear score, simple grades and a short list of fixes that can bring in more calls.',
];

const CLOSERS = [
  'Tap Learn More to request your free audit.',
  'Request yours today. It\'s free.',
  'Get your free report. No cost, no obligation.',
  'Get your free score today.',
  'Takes 30 seconds to request.',
];

const SIGNOFFS = [
  'From Mid-America Web Solutions in Belleville, IL.',
  'Mid-America Web Solutions | Web design & SEO',
  '',
];

// Meta shows about 27-40 characters of a headline before truncating.
const HEADLINES = [
  'Free Website Audit',
  'Free SEO Audit for {Plural}',
  'See Where You Stand Online',
  'Get Your Free Website Score',
  'Free Digital Health Check',
  'Is Your Website Costing You Calls?',
  'How Do You Rank on Google?',
  'Free Online Visibility Report',
  'Free AI Search Visibility Check',
  'Get Found by More {Customers}',
  'Free Audit: Website, SEO & Reviews',
  'What\'s Your Website Score?',
];

const DESCRIPTIONS = [
  'Free. No obligation.',
  'Scores in 6 key areas',
  'Includes an AI search check',
  'See how you compare',
  'From a local web team',
];

const CTAS = ['LEARN_MORE', 'GET_OFFER', 'SIGN_UP'];

// Short lines that sit on the image itself.
const IMAGE_HEADLINES = [
  { title: 'See where you stand.', sub: 'Get a clear picture of your {biz}\'s online visibility.' },
  { title: 'Free Website Audit', sub: 'For {plural}{inCity}' },
  { title: 'What\'s your score?', sub: 'Free audit of your website, SEO, reviews and more.' },
  { title: 'Free SEO Audit for {Plural}', sub: 'Website, Google listing, reviews and AI search.' },
  { title: 'Is your website costing you calls?', sub: 'Find out free. Get your score.' },
  { title: 'Free Digital Health Check', sub: '6 areas. One clear score.' },
];

const LIMITS = { primary: 500, headline: 40, description: 30, imageTitle: 40, imageSub: 70 };

function fill(template, industry, city) {
  const inCity = city ? ` in ${city.split(',')[0].trim()}` : '';
  return template
    .replace(/\{plural\}/g, industry.plural)
    .replace(/\{Plural\}/g, industry.Plural)
    .replace(/\{customers\}/g, industry.customers)
    .replace(/\{Customers\}/g, industry.customers.replace(/\b\w/g, c => c.toUpperCase()))
    .replace(/\{biz\}/g, industry.biz)
    .replace(/\{search\}/g, industry.search)
    .replace(/\{inCity\}/g, inCity)
    .replace(/^\w/, c => c.toUpperCase());
}

module.exports = { INDUSTRIES, HOOKS, OFFERS, CLOSERS, SIGNOFFS, HEADLINES, DESCRIPTIONS, CTAS, IMAGE_HEADLINES, LIMITS, fill };
