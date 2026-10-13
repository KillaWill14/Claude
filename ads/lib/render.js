// Renders creative HTML to PNG files with headless Chromium.
const { chromium } = require('playwright');
const { SIZES } = require('./creative');

async function createRenderer() {
  const browser = await chromium.launch();
  const pages = {};
  return {
    async render(html, size, file) {
      if (!pages[size]) pages[size] = await browser.newPage({ viewport: { width: SIZES[size].w, height: SIZES[size].h } });
      const page = pages[size];
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: file, type: 'png' });
    },
    close: () => browser.close(),
  };
}

module.exports = { createRenderer };
