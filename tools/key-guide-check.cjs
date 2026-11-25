const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8765';

async function selectKey(page, id) {
  const index = page.locator('#guide-index');
  if (await index.getAttribute('open') === null) await index.locator('summary').click();
  await index.locator('button[data-key="' + id + '"]').click();
}

async function checkWidth(page) {
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.ok(fits, 'The page should fit the viewport');
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.waitForSelector('#score svg');
    const language = page.locator('#language-select');
    const pieceNumber = async () => (await page.locator('#piece-number').textContent()).match(/\d+$/)[0];
    const initialPiece = await pieceNumber();
    assert.equal(await language.inputValue(), 'zh');
    await language.selectOption('en');
    assert.equal(await pieceNumber(), initialPiece);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.click('[data-view="guide"]');
    const keys = await page.locator('#guide-keys button').evaluateAll(buttons => buttons.map(b => b.dataset.key));
    assert.equal(new Set(keys).size, 16);
    for (const key of keys) {
      await selectKey(page, key);
      assert.equal(await page.locator('#guide-score .vf-stavenote').count(), 5);
      assert.ok(await page.locator('#guide-score svg').evaluate(svg => {
        const bounds = svg.getBoundingClientRect();
        const host = svg.parentElement.getBoundingClientRect();
        return bounds.left >= host.left && bounds.right <= host.right + 1;
      }), 'Both bars should fit inside the example');
      assert.equal(await page.locator('#guide-scale li').count(), 8);
      assert.equal(await page.locator('#guide-keys button[aria-pressed="true"]').getAttribute('data-key'), key);
      assert.doesNotMatch(await page.locator('#guide-detail').innerText(), /\p{Script=Han}/u);
    }

    await page.selectOption('#grade', '7');
    assert.equal(await page.locator('#guide-keys button').count(), 18);
    await selectKey(page, 'C#m');
    assert.match(await page.locator('#guide-reading').innerText(), /B♯/);
    await page.selectOption('#grade', '8');
    assert.equal(await page.locator('#guide-keys button').count(), 20);
    const engraving = await page.evaluate(() => {
      const issues = [];
      let examples = 0;
      const selector = document.getElementById('guide-study');
      for (const key of document.querySelectorAll('#guide-keys button')) {
        key.click();
        for (const option of Array.from(selector.options)) {
          selector.value = option.value;
          selector.dispatchEvent(new Event('change'));
          const svg = document.querySelector('#guide-score svg');
          const content = svg.getBBox();
          const bounds = svg.viewBox.baseVal;
          if (content.x < 0 || content.y < 0 || content.x + content.width > bounds.width || content.y + content.height > bounds.height)
            issues.push(key.dataset.key + ' ' + option.value);
          examples++;
        }
      }
      return { examples, issues };
    });
    assert.deepEqual(engraving, { examples: 120, issues: [] });
    await selectKey(page, 'Db');
    const studySelect = page.locator('#guide-study');
    const studies = await studySelect.locator('option').evaluateAll(options => options.map(o => o.value));
    assert.equal(studies.length, 6);
    const descriptions = new Set();
    for (const study of studies) {
      await studySelect.selectOption(study);
      assert.ok(await page.locator('#guide-score .vf-stavenote').count() >= 5);
      descriptions.add(await page.getAttribute('#guide-score svg', 'aria-label'));
    }
    assert.equal(descriptions.size, 6);
    await page.click('#guide-listen');
    await page.click('#guide-next');
    assert.equal(await page.getAttribute('#guide-listen', 'aria-pressed'), 'false');
    assert.equal(await studySelect.inputValue(), 'cadence');
    await page.click('#guide-practice');
    assert.equal(await page.locator('#grade').inputValue(), '8');
    assert.equal(await page.locator('#key').inputValue(), 'Db');
    await page.selectOption('#grade', '5');
    await page.click('[data-view="guide"]');
    assert.equal(await page.locator('#guide-keys button').count(), 16);
    await selectKey(page, 'G');
    await page.click('#guide-compare');
    assert.equal(await page.locator('#guide-detail-title').textContent(), 'E minor');
    assert.match(await page.locator('#guide-reading').innerText(), /D♯/);
    assert.match(await page.locator('#guide-signature').textContent(), /F♯/);
    await page.click('#guide-listen');
    assert.equal(await page.getAttribute('#guide-listen', 'aria-pressed'), 'true');
    await language.selectOption('bi');
    assert.match(await page.locator('#guide-detail-title').textContent(), /小调.*E minor/);
    await checkWidth(page);
    await page.click('#guide-practice');
    assert.ok(await page.locator('#workspace').isVisible());
    assert.equal(await page.locator('#key').inputValue(), 'Em');
    assert.match(await page.locator('#piece-meta').textContent(), /E minor/);
    assert.equal(await page.evaluate(() => PianoAudio.isPlaying()), false);
    await checkWidth(page);

    await page.click('#settings summary');
    await page.selectOption('#source', 'self');
    await page.click('#settings summary');
    await page.click('#start');
    await language.selectOption('en');
    assert.ok(await page.locator('#session').isVisible());
    await page.click('#session-stop');
    await page.check('#review-pulse');
    await language.selectOption('bi');
    assert.equal(await page.locator('#review-pulse').isChecked(), true);
    await page.click('#save-review');
    await page.click('[data-view="history"]');
    await language.selectOption('en');
    assert.match(await page.locator('.history-item').innerText(), /E minor/);
    assert.doesNotMatch(await page.locator('.history-item').innerText(), /\p{Script=Han}/u);

    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#score svg');
    assert.equal(await language.inputValue(), 'en');
    await page.click('[data-view="guide"]');
    await selectKey(page, 'F#m');
    assert.match(await page.locator('#guide-reading').textContent(), /E♯/);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.click('#theme');
    await checkWidth(page);
    await page.click('#guide-practice');
    assert.equal(await page.locator('#key').inputValue(), 'F#m');
    assert.deepEqual(errors, []);
    console.log('Passed guide, language, practice, history and offline checks.');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
