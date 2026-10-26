const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8765';
const output = path.resolve('artifacts/screenshots');
fs.mkdirSync(output, { recursive: true });

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const checks = [];
  try {
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        Object.defineProperty(crypto, 'getRandomValues', { value(array) { array[0] = 7; return array; } });
        window.testPort = { id: 'piano', name: 'Test piano', state: 'connected', onmidimessage: null };
        Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => ({ inputs: new Map([['piano', window.testPort]]), onstatechange: null }) });
      });
      await page.goto(base);
      await page.waitForSelector('#score svg');
      await page.evaluate(() => {
        const generate = SightGenerator.generate;
        SightGenerator.generate = options => { window.testScore = generate(options); return window.testScore; };
        const analyze = SightAlignment.analyze;
        SightAlignment.analyze = (...args) => { window.testResult = analyze(...args); return window.testResult; };
      });
      await page.click('#settings summary');
      await page.selectOption('#difficulty', 'upper');
      await page.selectOption('#key', 'C');
      await page.selectOption('#meter', '4/4');
      await page.selectOption('#source', 'midi');
      await page.click('#settings summary');
      await page.click('#new-piece');
      const targets = await page.evaluate(() => {
        const score = window.testScore;
        const chord = score.events.find(e => e.bar === 0 && e.hand === 'right' && e.notes.length === 2);
        const missing = score.playbackNotes.find(n => n.bar === 1 && n.hand === 'right');
        const ending = score.playbackNotes.find(n => n.bar === score.ritardandoStartBar && n.hand === 'right');
        const rhythmOnset = score.barStarts[3];
        const pauseOnset = score.barStarts[5];
        const notes = score.playbackNotes.filter(n => n.id !== missing.id).map(n => ({
          midi: n.midi + (n.id === chord.notes[1].id || n.id === ending.id ? 1 : 0),
          time: 1 + n.onset * 60 / score.bpm + (n.onset === rhythmOnset ? 0.2 : 0) + (n.onset >= pauseOnset ? 1.5 : 0),
          duration: Math.min(n.duration * 60 / score.bpm * 0.85, 0.35), confidence: 1
        }));
        notes.push({ midi: 90, time: 1 + score.barStarts[2] * 60 / score.bpm, duration: 0.2, confidence: 1 });
        window.testPerformed = notes;
        return { chord: chord.id, wrong: chord.notes[1].id, missing: missing.id, ending: ending.bar, rhythmBar: 3, pauseBar: 5 };
      });

      await page.click('#start');
      await page.waitForFunction(() => document.getElementById('phase').textContent === '请开始演奏');
      await page.evaluate(() => {
        const start = performance.now();
        const events = window.testPerformed.flatMap(n => [
          { at: start + n.time * 1000, data: [144, n.midi, 90] },
          { at: start + (n.time + n.duration) * 1000, data: [128, n.midi, 0] }
        ]).sort((a, b) => a.at - b.at || a.data[0] - b.data[0]);
        events.forEach(e => window.testPort.onmidimessage({ data: new Uint8Array(e.data), receivedTime: e.at }));
      });
      await page.click('#session-stop');
      await page.waitForSelector('#result-stats .stat');
      const midi = await page.evaluate(targets => {
        const first = document.querySelector('#bar-0 svg');
        const heads = [...first.querySelectorAll('.vf-notehead')].map(el => ({
          color: getComputedStyle(el.querySelector('path') || el).fill,
          parent: el.closest('.vf-stavenote')?.id
        }));
        const colors = {};
        for (const name of ['wrong', 'score-ink', 'missing', 'rhythm', 'pause']) {
          const el = document.createElement('span');
          el.style.color = 'var(--' + name + ')';
          document.body.append(el); colors[name] = getComputedStyle(el).color; el.remove();
        }
        const allColors = [...document.querySelectorAll('#score .vf-notehead')].map(el => getComputedStyle(el.querySelector('path') || el).fill);
        return {
          summary: window.testResult.summary,
          reliable: window.testResult.alignmentReliable,
          heads, colors, allColors,
          flags: [...document.querySelectorAll('#score .bar-flags')].map(el => el.textContent),
          endingContainers: document.querySelectorAll('#bar-' + targets.ending + ' .bar-flags').length,
          endingFlag: document.querySelector('#bar-' + targets.ending + ' .bar-flags')?.textContent,
          uncertainty: document.getElementById('uncertainty').textContent,
          width: document.documentElement.scrollWidth,
          stats: [...document.querySelectorAll('#result-stats .stat')].map(el => el.textContent)
        };
      }, targets);
      assert.equal(midi.reliable, true);
      assert.equal(midi.summary.wrong, 2);
      assert.equal(midi.summary.missing, 1);
      assert.equal(midi.summary.extra, 1);
      assert.ok(midi.summary.rhythm > 0);
      assert.equal(midi.summary.pauses, 1);
      assert.equal(midi.width, 390);
      const redHead = midi.heads.find(n => n.color === midi.colors.wrong);
      assert.ok(redHead, JSON.stringify(midi.heads));
      assert.ok(midi.heads.some(n => n.parent === redHead.parent && n.color === midi.colors['score-ink']), 'Only the wrong head of the chord should be red');
      for (const name of ['missing', 'rhythm', 'pause']) assert.ok(midi.allColors.includes(midi.colors[name]), name);
      for (const symbol of ['●', '○', '△', 'Ⅱ', '＋']) assert.ok(midi.flags.some(text => text.includes(symbol)), symbol);
      assert.equal(midi.endingContainers, 1);
      assert.match(midi.endingFlag, /rit\./);
      assert.match(midi.endingFlag, /●/);
      assert.match(midi.uncertainty, /渐慢/);
      await page.locator('#bar-0').screenshot({ path: path.join(output, `feedback-midi-${scheme}-chord.png`) });
      await page.locator('#score').screenshot({ path: path.join(output, `feedback-midi-${scheme}-score.png`) });
      await page.locator('#feedback').screenshot({ path: path.join(output, `feedback-midi-${scheme}-summary.png`) });
      checks.push({ scheme, source: 'midi', summary: midi.summary, chordHeads: midi.heads, markers: midi.flags });

      await page.click('[data-view="history"]');
      assert.equal(await page.locator('.history-item').count(), 1);
      assert.match(await page.locator('#history-summary').textContent(), /错音/);
      await page.click('[data-view="practice"]');
      await page.click('#settings summary');
      await page.selectOption('#source', 'microphone');
      await page.click('#settings summary');
      await page.evaluate(() => {
        SightInput.openMic = async () => ({ contextSampleRate: 22050, echoCancellation: false, noiseSuppression: false, autoGainControl: false });
        SightInput.start = () => {};
        SightInput.stop = async () => {
          const samples = new Float32Array(22050);
          const blob = new Blob([SightInput.wav(samples, 22050)], { type: 'audio/wav' });
          return { samples, sampleRate: 22050, duration: 1, blob, url: URL.createObjectURL(blob) };
        };
        SightTranscribe.transcribe = async () => ({ notes: window.testPerformed });
      });
      await page.click('#start');
      await page.waitForFunction(() => document.getElementById('phase').textContent === '请开始演奏');
      await page.click('#session-stop');
      await page.waitForFunction(() => document.getElementById('analysis-status').textContent.includes('分析完成'));
      const mic = await page.evaluate(() => ({
        summary: window.testResult.summary,
        uncertain: window.testResult.notes.every(n => n.uncertain),
        flags: [...document.querySelectorAll('#score .bar-flags')].map(el => el.textContent),
        stats: [...document.querySelectorAll('#result-stats .stat')].map(el => el.textContent),
        warning: document.getElementById('uncertainty').textContent
      }));
      assert.equal(mic.uncertain, true);
      assert.equal(mic.summary.wrong, 0);
      assert.equal(mic.summary.missing, 0);
      assert.equal(mic.summary.suspectedWrong, 2);
      assert.equal(mic.summary.suspectedMissing, 1);
      assert.ok(mic.flags.some(text => text.includes('●？')));
      assert.ok(mic.stats.some(text => text.includes('疑似错音')));
      assert.match(mic.warning, /不是确定错误/);
      await page.locator('#bar-0').screenshot({ path: path.join(output, `feedback-microphone-${scheme}-chord.png`) });
      await page.locator('#feedback').screenshot({ path: path.join(output, `feedback-microphone-${scheme}-summary.png`) });
      checks.push({ scheme, source: 'microphone', summary: mic.summary, markers: mic.flags });

      await page.click('[data-view="history"]');
      assert.equal(await page.locator('.history-item').count(), 2);
      assert.match(await page.locator('#history-summary').textContent(), /疑似错误不并入确定弱项/);
      await page.click('[data-view="practice"]');
      await page.evaluate(() => {
        SightTranscribe.transcribe = async () => ({ notes: window.testPerformed.map(n => ({ ...n, midi: 100 })) });
      });
      await page.click('#start');
      await page.waitForFunction(() => document.getElementById('phase').textContent === '请开始演奏');
      await page.click('#session-stop');
      await page.waitForFunction(() => document.getElementById('result-summary').textContent.includes('无法可靠定位'));
      assert.equal(await page.locator('#result-stats .stat').count(), 0);
      assert.equal(await page.locator('#score .bar-flags .wrong').count(), 0);
      await page.locator('#feedback').screenshot({ path: path.join(output, `feedback-unreliable-${scheme}.png`) });
      checks.push({ scheme, source: 'unrelated synthetic transcription', reliable: false, preciseStatisticsHidden: true });
      await context.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.resolve('artifacts/feedback-results.json'), JSON.stringify({ browser: browser.version(), checks, pageErrors: errors }, null, 2));
    console.log(JSON.stringify({ scenarios: checks.length, screenshots: output, pageErrors: errors }, null, 2));
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
