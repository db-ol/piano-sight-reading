const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('local model transcribes a synthetic chord and releases temporary tensors', async () => {
  global.tf = require('../vendor/tf.min.js');
  require('../vendor/basic-pitch.js');
  const originalFetch = global.fetch;
  global.fetch = async url => {
    const file = path.resolve(__dirname, '..', String(url));
    const body = fs.readFileSync(file);
    return new Response(body, { status: 200, headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' } });
  };
  try {
    const Transcribe = require('../js/transcribe.js');
    const samples = new Float32Array(22050 * 3);
    [60, 64, 67].forEach(midi => {
      const hz = 440 * 2 ** ((midi - 69) / 12);
      for (let i = 4410; i < 44100; i++) {
        const t = (i - 4410) / 22050;
        const envelope = Math.min(1, t * 150) * Math.exp(-t * 2);
        samples[i] += 0.12 * envelope * (Math.sin(2 * Math.PI * hz * t) + 0.35 * Math.sin(4 * Math.PI * hz * t) + 0.14 * Math.sin(6 * Math.PI * hz * t));
      }
    });
    const graph = await Transcribe.load();
    const tensors = tf.memory().numTensors;
    for (let run = 0; run < 2; run++) {
      const result = await Transcribe.transcribe({ samples, sampleRate: 22050, duration: 3 });
      assert.equal(result.experimental, true);
      for (const pitch of [60, 64, 67]) {
        assert.ok(result.notes.some(note => note.midi === pitch && Math.abs(note.time - 0.2) < 0.06));
      }
      assert.equal(tf.memory().numTensors, tensors);
    }
    graph.dispose();
  } finally {
    global.fetch = originalFetch;
  }
});
