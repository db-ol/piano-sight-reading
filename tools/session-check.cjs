const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8765';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const checks = [];
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.goto(base);
    await page.waitForSelector('#score svg');
    await page.click('#settings summary');
    await page.selectOption('#source', 'self');
    await page.click('#settings summary');
    await page.click('[data-view="exam"]');
    const initial = await page.locator('#piece-number').textContent();
    await page.click('#start');
    assert.notEqual(await page.locator('#piece-number').textContent(), initial);
    assert.equal(await page.locator('#phase').textContent(), '准备读谱');
    await page.clock.fastForward(29000);
    assert.equal(await page.locator('#phase').textContent(), '准备读谱');
    await page.clock.fastForward(1100);
    assert.equal(await page.locator('#phase').textContent(), '请开始演奏');
    assert.equal(await page.locator('#demo').isVisible(), false);
    await page.click('#session-stop');
    assert.match(await page.locator('#uncertainty').textContent(), /没有采集/);
    checks.push('new unseen score, full 30 second preparation and transition to performance');
    await page.click('[data-view="practice"]');
    await page.click('#start');
    assert.equal(await page.locator('#clock').textContent(), '自由');
    await page.clock.fastForward(181000);
    assert.equal(await page.locator('#phase').textContent(), '请开始演奏');
    await page.click('#session-stop');
    checks.push('free practice has no three minute cutoff');
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('Full', 'QuotaExceededError'); }; });
    await page.click('#save-review');
    assert.equal(await page.locator('#save-review').isDisabled(), false);
    assert.match(await page.locator('#toast').textContent(), /未保存/);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    checks.push('unavailable local storage never reports a successful save');
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => new Promise((resolve, reject) => { window.rejectPermission = reject; });
    });
    await page.click('#settings summary');
    await page.selectOption('#source', 'microphone');
    await page.click('#settings summary');
    await page.click('#start');
    assert.equal(await page.locator('#phase').textContent(), '准备输入');
    await page.click('#session-stop');
    await page.click('#settings summary');
    await page.selectOption('#source', 'self');
    await page.click('#settings summary');
    await page.click('#start');
    await page.evaluate(() => window.rejectPermission(new DOMException('Denied', 'NotAllowedError')));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#phase').textContent(), '请开始演奏');
    assert.equal(await page.locator('#session').isVisible(), true);
    await page.click('#session-stop');
    checks.push('late rejected microphone permission cannot cancel a newer session');
    await context.close();

    const denied = await browser.newContext();
    const deniedPage = await denied.newPage();
    deniedPage.on('pageerror', error => errors.push(error.message));
    await deniedPage.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); };
    });
    await deniedPage.goto(base);
    await deniedPage.waitForSelector('#score svg');
    await deniedPage.click('#start');
    await deniedPage.waitForFunction(() => !document.getElementById('start').disabled);
    assert.match(await deniedPage.locator('#toast').textContent(), /权限/);
    assert.equal(await deniedPage.locator('#session').isVisible(), false);
    checks.push('permission denial returns to a usable idle state');
    await denied.close();

    assert.deepEqual(errors, []);
    fs.mkdirSync('artifacts', { recursive: true });
    fs.writeFileSync('artifacts/session-results.json', JSON.stringify({ browser: browser.version(), checks, pageErrors: errors }, null, 2));
    console.log(JSON.stringify({ checks, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
