const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8765';

async function main() {
  const browser = await chromium.launch({
    channel: 'chrome', headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.pianoPort = { id: 'test', name: 'Piano', state: 'connected' };
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: async () => ({ inputs: new Map([['test', window.pianoPort]]) })
      });
      window.screenLocks = [];
      Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => {
        if (window.denyWake) throw new DOMException('Denied', 'NotAllowedError');
        const lock = new EventTarget();
        lock.released = false;
        lock.release = async () => { lock.released = true; lock.dispatchEvent(new Event('release')); };
        screenLocks.push(lock);
        if (window.delayWake) await new Promise(resolve => { window.grantWake = resolve; });
        return lock;
      } } });
    });
    await page.goto(base);
    await page.waitForSelector('#score svg');
    await page.evaluate(async () => {
      window.delayWake = true;
      const pending = SightFollow.prepare();
      SightFollow.stop();
      window.grantWake();
      await pending;
      window.delayWake = false;
    });
    assert.ok(await page.evaluate(() => screenLocks.every(lock => lock.released)), 'Late locks must be released');
    const locksAfterRestart = await page.evaluate(async () => {
      window.delayWake = true;
      const pending = SightFollow.prepare();
      SightFollow.stop();
      SightFollow.prepare();
      window.grantWake();
      await pending;
      window.delayWake = false;
      const active = screenLocks.filter(lock => !lock.released).length;
      SightFollow.stop();
      return [active, screenLocks.filter(lock => !lock.released).length];
    });
    assert.deepEqual(locksAfterRestart, [1, 0]);
    await page.clock.install();
    await page.evaluate(() => {
      const generate = SightGenerator.generate;
      SightGenerator.generate = options => (window.currentStudy = generate(options));
    });
    const currentBar = async () => Number(await page.getAttribute('.follow-current', 'data-bar'));
    async function assertVisibleBar() {
      const box = await page.locator('.follow-current').evaluate(el => {
        const box = el.getBoundingClientRect();
        const strip = document.getElementById('session').getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, controls: strip.bottom, height: innerHeight };
      });
      assert.ok(box.top >= box.controls - 1 && box.bottom <= box.height + 1, JSON.stringify(box));
    }
    async function setSource(value) {
      await page.click('#settings summary');
      await page.selectOption('#source', value);
      await page.click('#settings summary');
    }
    async function rotate(width, height, bar) {
      const previous = await page.locator('#bar-' + bar).elementHandle();
      await page.setViewportSize({ width, height });
      await page.waitForFunction(oldBar => !oldBar.isConnected, previous);
      await previous.dispose();
      assert.equal(await currentBar(), bar);
      await assertVisibleBar();
    }

    const toolbarSpeed = page.locator('#practice-tools #speed');
    const settingsSpeed = page.locator('#practice-fields #speed');
    assert.ok(await toolbarSpeed.isVisible());
    await page.click('#settings summary');
    await settingsSpeed.selectOption('0.8');
    await page.click('#settings summary');
    await toolbarSpeed.waitFor({ state: 'visible' });
    assert.equal(await toolbarSpeed.inputValue(), '0.8');
    await toolbarSpeed.selectOption('1');
    await page.click('#start-follow');
    assert.equal(await page.locator('#source').inputValue(), 'microphone');
    assert.equal(await currentBar(), 0);
    assert.ok(await page.evaluate(() => screenLocks.some(lock => !lock.released)));
    await page.click('#session-stop');
    assert.ok(await page.evaluate(() => screenLocks.every(lock => lock.released)));
    assert.match(await page.locator('#uncertainty').textContent(), /没有采集/);

    await page.click('#settings summary');
    assert.equal(await page.locator('#follow-mode').inputValue(), 'auto');
    await page.selectOption('#source', 'self');
    await page.selectOption('#key', 'G');
    await page.selectOption('#meter', '4/4');
    await page.click('#settings summary');
    await page.click('#new-piece');
    await page.click('#start');
    assert.equal(await currentBar(), 0);
    await page.clock.fastForward(11000);
    assert.ok(await currentBar() >= 2);
    await assertVisibleBar();
    await page.click('#follow-pause');
    const paused = await currentBar();
    await page.clock.fastForward(11000);
    assert.equal(await currentBar(), paused);
    await page.click('#follow-pause');
    await page.clock.fastForward(6000);
    assert.ok(await currentBar() > paused);
    await page.click('#session-stop');
    assert.equal(await page.locator('.follow-current').count(), 0);

    await page.click('[data-view="exam"]');
    await setSource('midi');
    await page.click('#start');
    await page.clock.fastForward(29000);
    assert.equal(await page.locator('.follow-current').count(), 0);
    assert.ok(await page.evaluate(() => screenLocks.some(lock => !lock.released)), 'Keep the screen on during preparation');
    await page.clock.fastForward(1200);
    assert.equal(await currentBar(), 0);
    await page.clock.fastForward(15000);
    assert.equal(await currentBar(), 0, 'MIDI waits for played notes');
    await rotate(800, 390, 0);
    await rotate(375, 667, 0);
    await page.evaluate(() => {
      const start = performance.now();
      for (const note of currentStudy.playbackNotes.filter(n => n.bar <= 4)) {
        pianoPort.onmidimessage({ data: [144, note.midi, 95], receivedTime: start + note.onset * 500 });
      }
    });
    await page.clock.fastForward(100);
    assert.equal(await currentBar(), 4);
    await rotate(800, 390, 4);
    await page.click('#follow-pause');
    await rotate(375, 667, 4);
    await rotate(800, 390, 4);
    assert.equal(await page.locator('#follow-pause').getAttribute('aria-pressed'), 'true');
    await page.click('#follow-pause');
    await page.click('#session-stop');

    await page.click('#settings summary');
    await page.selectOption('#source', 'self');
    await page.selectOption('#speed', '0.6');
    await page.click('#settings summary');
    await page.click('#start');
    await page.clock.fastForward(30100);
    const firstBarMs = await page.evaluate(() => currentStudy.barStarts[1] * 60000 / currentStudy.bpm);
    await page.clock.fastForward(Math.ceil(firstBarMs * 1.15));
    assert.equal(await currentBar(), 0, 'Exam page turns should respect a slower selected tempo');
    await page.clock.fastForward(Math.ceil(firstBarMs * 0.6));
    assert.equal(await currentBar(), 1);
    await page.click('#session-stop');

    await page.click('[data-view="practice"]');
    await page.click('#demo');
    assert.ok(await page.locator('#follow-demo-stop').isVisible());
    await page.click('#follow-demo-stop');
    assert.equal(await page.locator('.follow-current').count(), 0);
    await page.click('#settings summary');
    await page.selectOption('#source', 'self');
    await page.selectOption('#follow-mode', 'off');
    await page.click('#settings summary');
    await page.reload();
    await page.waitForSelector('#score svg');
    await setSource('self');
    await page.click('#start');
    await page.clock.fastForward(15000);
    assert.equal(await page.locator('.follow-current').count(), 0);
    await page.click('#session-stop');
    await page.click('#settings summary');
    await page.selectOption('#source', 'microphone');
    await page.selectOption('#follow-mode', 'auto');
    await page.click('#settings summary');
    await page.evaluate(() => { window.denyWake = true; });
    await page.click('#start');
    await page.waitForSelector('.follow-current');
    await page.clock.fastForward(13000);
    assert.ok(await currentBar() > 0, 'Microphone recording should turn pages at the selected tempo');
    assert.deepEqual(errors, []);
    console.log('Passed phone page turns, pause and resume, exam preparation, MIDI and microphone input, demo, rotation, screen wake lock and manual preference checks.');
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
