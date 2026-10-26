const test = require('node:test');
const assert = require('node:assert/strict');
const Input = require('../js/input.js');
const Transcribe = require('../js/transcribe.js');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('PCM WAV preserves duration, sample rate and clipping', () => {
  const buffer = Input.wav(new Float32Array([-2, -1, 0, 0.5, 1, 2]), 48000);
  const data = new DataView(buffer);
  assert.equal(buffer.byteLength, 56);
  assert.equal(data.getUint32(24, true), 48000);
  assert.equal(data.getUint32(40, true), 12);
  assert.equal(data.getInt16(44, true), -32768);
  assert.equal(data.getInt16(48, true), 0);
  assert.equal(data.getInt16(54, true), 32767);
});

test('resampling preserves duration and a piano reference frequency', () => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / 48000));
  const output = Transcribe.downsample(samples, 48000);
  assert.equal(output.length, 22050);
  let crossings = 0;
  let error = 0;
  for (let i = 100; i < output.length - 100; i++) {
    if (output[i - 1] <= 0 && output[i] > 0) crossings++;
    error += Math.abs(output[i] - Math.sin(2 * Math.PI * 440 * i / 22050));
  }
  assert.ok(Math.abs(crossings / ((output.length - 200) / 22050) - 440) < 2);
  assert.ok(error / (output.length - 200) < 0.005);
});

test('downsampling suppresses frequencies above target Nyquist', () => {
  const samples = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 18000 * i / 48000));
  const output = Transcribe.downsample(samples, 48000);
  const middle = output.subarray(100, output.length - 100);
  const rms = Math.sqrt(middle.reduce((sum, v) => sum + v * v, 0) / middle.length);
  assert.ok(rms < 0.03);
});

test('resampling rejects invalid sample rates and preserves constant input', () => {
  assert.throws(() => Transcribe.downsample(new Float32Array(10), 0));
  const output = Transcribe.downsample(new Float32Array(4410).fill(0.4), 44100);
  assert.equal(output.length, 2205);
  assert.ok(output.every(value => Math.abs(value - 0.4) < 0.00001));
});

test('MIDI keeps chord notes and recognizes velocity zero as note off', () => {
  const recording = { origin: 1000, notes: [], active: {} };
  Input.midiMessage(recording, [0x90, 60, 90], 1250, 'piano');
  Input.midiMessage(recording, [0x90, 64, 80], 1250, 'piano');
  Input.midiMessage(recording, [0x90, 60, 0], 1750, 'piano');
  Input.midiMessage(recording, [0x80, 64, 0], 1850, 'piano');
  assert.equal(recording.notes.length, 2);
  assert.equal(recording.notes[0].time, 0.25);
  assert.equal(recording.notes[0].duration, 0.5);
  assert.equal(recording.notes[1].duration, 0.6);
  assert.deepEqual(recording.active, {});
});

test('MIDI repeated pitches, channels and devices remain independent', () => {
  const recording = { origin: 0, notes: [], active: {} };
  Input.midiMessage(recording, [0x90, 60, 90], 100, 'a');
  Input.midiMessage(recording, [0x90, 60, 90], 200, 'b');
  Input.midiMessage(recording, [0x91, 60, 90], 300, 'a');
  Input.midiMessage(recording, [0x90, 60, 90], 400, 'a');
  assert.equal(recording.notes.length, 1);
  assert.ok(Math.abs(recording.notes[0].duration - 0.3) < 0.000001);
  assert.equal(Object.keys(recording.active).length, 3);
  Input.midiMessage(recording, [0xB0, 64, 127], 500, 'a');
  assert.equal(recording.notes.length, 1);
});

test('recorder excludes preparation audio, mixes channels and respects its sample limit', () => {
  let Processor;
  const messages = [];
  const sandbox = {
    Float32Array, sampleRate: 48000, currentFrame: 0,
    AudioWorkletProcessor: class {
      constructor() { this.port = { postMessage: message => messages.push(message) }; }
    },
    registerProcessor: (_, value) => { Processor = value; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/recorder-worklet.js'), 'utf8'), sandbox);
  const recorder = new Processor();
  const stereo = [[new Float32Array(128).fill(0.5), new Float32Array(128).fill(0.1)]];
  recorder.process(stereo);
  assert.equal(messages.filter(message => message.type === 'samples').length, 0);
  recorder.port.onmessage({ data: 'start' });
  recorder.limit = 10;
  recorder.process(stereo);
  assert.equal(recorder.active, false);
  const audio = messages.find(message => message.type === 'samples').samples;
  assert.equal(audio.length, 10);
  assert.ok(audio.every(value => Math.abs(value - 0.3) < 0.000001));
  assert.equal(messages.filter(message => message.type === 'limit').length, 1);
});
