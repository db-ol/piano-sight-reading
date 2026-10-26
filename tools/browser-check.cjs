const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8765';
const output = path.resolve('artifacts/screenshots');
fs.mkdirSync(output, { recursive: true });

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const failures = [];
  const results = [];
  try {
    for (const size of [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 1280, height: 900 }]) {
      for (const scheme of ['light', 'dark']) {
        const context = await browser.newContext({ viewport: size, colorScheme: scheme, permissions: ['microphone'] });
        const page = await context.newPage();
        page.on('pageerror', error => failures.push(error.message));
        await page.addInitScript(() => {
          Object.defineProperty(crypto, 'getRandomValues', { value(array) { array[0] = 7; return array; } });
        });
        await page.goto(base);
        await page.waitForSelector('#score svg');
        await page.locator('#settings summary').click();
        await page.selectOption('#difficulty', 'upper');
        await page.selectOption('#key', 'E');
        await page.selectOption('#meter', '4/4');
        await page.locator('#settings summary').click();
        await page.click('#new-piece');
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => window.scrollTo(0, 0));
        const layout = await page.evaluate(() => ({
          viewport: innerWidth,
          width: document.documentElement.scrollWidth,
          bars: document.querySelectorAll('#score svg').length,
          theme: document.documentElement.dataset.theme,
          overflowing: [...document.querySelectorAll('#score svg')].filter(svg => {
            const bounds = svg.viewBox.baseVal;
            const content = svg.getBBox();
            return content.x < -2 || content.y < -2 || content.x + content.width > bounds.width + 2 || content.y + content.height > bounds.height + 2;
          }).length
        }));
        assert.ok(layout.width <= size.width, JSON.stringify(layout));
        assert.equal(layout.bars, 12);
        assert.equal(layout.theme, scheme);
        assert.equal(layout.overflowing, 0, JSON.stringify(layout));
        const prefix = `${size.width}x${size.height}-${scheme}`;
        await page.screenshot({ path: path.join(output, prefix + '.png'), fullPage: true });
        await page.screenshot({ path: path.join(output, prefix + '-viewport.png') });
        await page.click('#focus-score');
        assert.equal(await page.locator('.tabbar').isVisible(), false);
        await page.screenshot({ path: path.join(output, prefix + '-score.png') });
        await page.click('#focus-score');
        results.push({ size, scheme, layout });
        await context.close();
      }
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(base);
    await page.waitForSelector('#score svg');
    const engraving = await page.evaluate(() => {
      const errors = [];
      let count = 0;
      for (const key of SightGenerator.KEYS) for (const meter of SightGenerator.METERS) for (const difficulty of SightGenerator.DIFFICULTIES) {
        for (const seed of [6, 7]) {
          const score = SightGenerator.generate({ key: key.id, meter, difficulty: difficulty.id, seed });
          try {
            SightScore.render(document.getElementById('score'), score);
            for (const svg of document.querySelectorAll('#score svg')) {
              const a = svg.viewBox.baseVal; const b = svg.getBBox();
              if (b.x < -2 || b.y < -2 || b.x + b.width > a.width + 2 || b.y + b.height > a.height + 2) errors.push({ key: key.id, meter, difficulty: difficulty.id, seed, bounds: { x: b.x, y: b.y, w: b.width, h: b.height }, viewport: { w: a.width, h: a.height } });
            }
            count++;
          } catch (error) { errors.push({ key: key.id, meter, difficulty: difficulty.id, seed, message: error.message }); }
        }
      }
      return { count, errors: errors.slice(0, 20), errorCount: errors.length };
    });
    assert.equal(engraving.errorCount, 0, JSON.stringify(engraving));
    assert.equal(engraving.count, 480);
    results.push({ engraving });
    await page.click('#new-piece');
    await page.click('#demo');
    assert.match(await page.locator('#demo').textContent(), /停止/);
    await page.click('#demo');
    await page.click('#metronome');
    assert.equal(await page.getAttribute('#metronome', 'aria-pressed'), 'true');
    await page.click('#metronome');

    await page.click('#settings summary');
    await page.selectOption('#source', 'self');
    await page.click('#settings summary');
    await page.click('#start');
    assert.equal(await page.locator('#phase').textContent(), '请开始演奏');
    await page.click('#session-stop');
    await page.check('#review-pulse');
    await page.click('#save-review');
    await page.click('[data-view="history"]');
    assert.equal(await page.locator('.history-item').count(), 1);
    await page.click('[data-view="exam"]');
    await page.click('#start');
    assert.equal(await page.locator('#phase').textContent(), '准备读谱');
    assert.ok(Number(await page.locator('#clock').textContent()) >= 28);
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#demo').isVisible(), false);
    await page.click('#session-stop');
    await page.click('[data-view="practice"]');

    await page.click('#settings summary');
    await page.selectOption('#source', 'microphone');
    await page.click('#settings summary');
    await page.click('#start');
    await page.waitForFunction(() => document.getElementById('phase').textContent === '请开始演奏');
    await page.waitForTimeout(1200);
    await page.click('#session-stop');
    await page.waitForFunction(() => !document.getElementById('recording-player').hidden);
    await page.waitForFunction(() => !document.getElementById('analyze').disabled, { timeout: 60000 });
    const audio = await page.locator('#recording-audio').getAttribute('src');
    assert.ok(audio.startsWith('blob:'));
    results.push({ fakeMicrophone: 'captured WAV and completed local inference' });
    await page.click('[data-view="about"]');
    await page.click('#cache-model');
    await page.waitForFunction(() => document.getElementById('cache-status').textContent.includes('已缓存'));
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#score svg');
    assert.ok(await page.locator('#score svg').count() >= 8);
    const offlineModel = await page.evaluate(async () => { await SightTranscribe.load(); return SightTranscribe.ready(); });
    assert.equal(offlineModel, true);
    await page.click('[data-view="history"]');
    assert.ok(await page.locator('.history-item').count() >= 1);
    results.push({ offline: 'score, history and transcription model load without network' });
    await context.close();

    assert.deepEqual(failures, []);
    fs.writeFileSync(path.resolve('artifacts/browser-results.json'), JSON.stringify({ browser: browser.version(), results, pageErrors: failures }, null, 2));
    console.log(JSON.stringify({ screenshots: output, scenarios: results.length, engravingCases: engraving.count, pageErrors: failures }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
