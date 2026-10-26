const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function stream() {
  const track = { stopped: false, muted: false, readyState: 'live', getSettings: () => ({}),
    stop() { this.stopped = true; this.readyState = 'ended'; }, addEventListener() {} };
  return { track, getTracks: () => [track], getAudioTracks: () => [track] };
}

function inputSandbox(getUserMedia, requestMIDIAccess) {
  const urls = [];
  const revoked = [];
  const worklets = [];
  let holdStop = false;
  class Context {
    constructor() { this.state = 'running'; this.sampleRate = 48000; this.audioWorklet = { addModule: async () => {} }; }
    async resume() {}
    async close() { this.state = 'closed'; }
    addEventListener() {}
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
  }
  class Worklet {
    constructor() {
      worklets.push(this);
      this.port = { postMessage: message => {
        if (message === 'stop' && !holdStop) queueMicrotask(() => {
          if (this.port.onmessage) this.port.onmessage({ data: { type: 'stopped' } });
        });
      }, close() { this.closed = true; } };
    }
    connect() {}
    disconnect() {}
  }
  class TestURL extends URL {}
  TestURL.createObjectURL = () => { const url = 'blob:' + urls.length; urls.push(url); return url; };
  TestURL.revokeObjectURL = value => { revoked.push(value); };
  const audioSession = { type: 'playback' };
  const root = { navigator: { mediaDevices: { getUserMedia }, requestMIDIAccess, audioSession },
    AudioContext: Context, AudioWorkletNode: Worklet, URL: TestURL, performance,
    document: { currentScript: { src: 'https://example.test/js/input.js' }, addEventListener() {} }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/input.js'), 'utf8'), {
    window: root, URL: TestURL, Blob, Float32Array, ArrayBuffer, DataView, setTimeout, clearTimeout, console
  });
  return { api: root.SightInput, urls, revoked, worklets, audioSession, holdStop: value => { holdStop = value; } };
}

test('late microphone permission cannot replace a restarted session', async () => {
  const oldPermission = deferred();
  const oldStream = stream();
  const newStream = stream();
  let calls = 0;
  const harness = inputSandbox(() => ++calls === 1 ? oldPermission.promise : Promise.resolve(newStream));
  const pending = harness.api.openMic();
  assert.equal(harness.audioSession.type, 'play-and-record');
  const rejection = assert.rejects(pending, /取消/);
  harness.api.dispose();
  assert.equal(harness.audioSession.type, 'auto');
  await harness.api.openMic();
  assert.equal(harness.audioSession.type, 'play-and-record');
  oldPermission.resolve(oldStream);
  await rejection;
  assert.equal(harness.audioSession.type, 'play-and-record');
  assert.equal(oldStream.track.stopped, true);
  assert.equal(newStream.track.stopped, false);
  harness.api.start();
  await harness.api.stop();
  assert.equal(harness.audioSession.type, 'auto');
  assert.equal(newStream.track.stopped, true);
});

test('disposing a pending stop discards its result and leaves the new recording intact', async () => {
  const streams = [stream(), stream()];
  let calls = 0;
  const harness = inputSandbox(() => Promise.resolve(streams[calls++]));
  await harness.api.openMic();
  harness.api.start();
  harness.holdStop(true);
  const first = harness.api.stop();
  const duplicate = harness.api.stop();
  harness.api.dispose();
  assert.equal(harness.worklets[0].port.onmessage, null);
  assert.equal(harness.worklets[0].port.closed, true);
  await harness.api.openMic();
  harness.api.start();
  assert.equal(await first, null);
  assert.equal(await duplicate, null);
  assert.equal(harness.urls.length, 0);
  assert.equal(streams[1].track.stopped, false);
  harness.holdStop(false);
  const result = await harness.api.stop();
  assert.equal(result.source, 'microphone');
  assert.equal(harness.urls.length, 1);
  harness.api.dispose();
  assert.deepEqual(harness.revoked, ['blob:0']);
});

test('microphone audio session cleanup preserves a later playback selection', async () => {
  const harness = inputSandbox(async () => stream());
  await harness.api.openMic();
  assert.equal(harness.audioSession.type, 'play-and-record');
  harness.audioSession.type = 'playback';
  harness.api.dispose();
  assert.equal(harness.audioSession.type, 'playback');
});

test('late MIDI permission is discarded and disconnect during preparation is reported', async () => {
  const permission = deferred();
  const piano = { id: 'piano', name: '钢琴', state: 'connected' };
  const controller = { id: 'controller', name: '控制器', state: 'connected' };
  const access = { inputs: new Map([['piano', piano], ['controller', controller]]) };
  const harness = inputSandbox(null, () => permission.promise);
  const pending = harness.api.connectMIDI();
  const rejection = assert.rejects(pending, /取消/);
  harness.api.dispose();
  permission.resolve(access);
  await rejection;
  assert.equal(access.onstatechange, undefined);
  let interruptions = 0;
  const devices = await harness.api.connectMIDI({ onInterrupted() { interruptions++; } });
  assert.equal(devices.connected, 2);
  piano.state = 'disconnected';
  access.onstatechange();
  assert.equal(interruptions, 1);
  assert.equal(piano.onmidimessage, null);
  harness.api.dispose();
  assert.equal(access.onstatechange, null);
});

test('cancelling while the model downloads returns promptly and permits a retry', async () => {
  const download = deferred();
  let requested = false;
  const graph = {};
  const root = { tf: { enableProdMode() {}, setBackend: async () => true, ready: async () => {},
    loadGraphModel() { requested = true; return download.promise; } }, BasicPitchNotes: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/transcribe.js'), 'utf8'), {
    window: root, URL, AbortController, Float32Array, setTimeout, clearTimeout, Set
  });
  let progress = 0;
  const pending = root.SightTranscribe.transcribe({ samples: new Float32Array([0]), sampleRate: 22050 }, () => { progress++; });
  const rejection = assert.rejects(pending, /取消/);
  while (!requested) await new Promise(resolve => setImmediate(resolve));
  root.SightTranscribe.cancel();
  await rejection;
  const afterCancel = progress;
  download.resolve(graph);
  await root.SightTranscribe.load();
  assert.equal(progress, afterCancel);
  const result = await root.SightTranscribe.transcribe({ samples: new Float32Array([0]), sampleRate: 22050 });
  assert.equal(result.notes.length, 0);
});
