const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8');
const piece = { bpm: 120, bars: 1, barBeats: 4, playbackNotes: [{ id: 'one', midi: 60, onset: 0, duration: 1, velocity: 0.7 }] };

function harness(contextModes = []) {
  let wall = 10000;
  let timerId = 0;
  const timers = new Map();
  const contexts = [];
  const documentEvents = new Map();
  const windowEvents = new Map();

  function param() {
    return {
      value: 0,
      setValueAtTime(value) { this.value = value; },
      exponentialRampToValueAtTime() {},
      linearRampToValueAtTime() {},
      setTargetAtTime() {},
      cancelScheduledValues() {}
    };
  }
  function node() { return { connect() {}, disconnect() { this.disconnected = true; } }; }

  class FakeAudioContext {
    constructor() {
      this.mode = contextModes[contexts.length] || 'running';
      this.state = this.mode === 'stuck' ? 'suspended' : 'running';
      this.currentTime = 1;
      this.destination = node();
      this.events = new Map();
      this.oscillators = [];
      this.buffers = [];
      this.closeCalls = 0;
      contexts.push(this);
    }
    createDynamicsCompressor() { return Object.assign(node(), { threshold: param(), ratio: param() }); }
    createGain() { return Object.assign(node(), { gain: param() }); }
    createPeriodicWave() { return {}; }
    createBiquadFilter() { return Object.assign(node(), { Q: param(), frequency: param() }); }
    createBuffer() { return {}; }
    createBufferSource() {
      const result = Object.assign(node(), { start(time) { this.startedAt = time; } });
      this.buffers.push(result);
      return result;
    }
    createOscillator() {
      const result = Object.assign(node(), {
        frequency: param(), stops: [],
        setPeriodicWave() {},
        start(time) { this.startedAt = time; },
        stop(time) { this.stops.push(time); }
      });
      this.oscillators.push(result);
      return result;
    }
    addEventListener(name, fn) {
      if (!this.events.has(name)) this.events.set(name, new Set());
      this.events.get(name).add(fn);
    }
    removeEventListener(name, fn) { this.events.get(name)?.delete(fn); }
    emit(name) { for (const fn of this.events.get(name) || []) fn(); }
    resume() {
      if (this.mode === 'stuck') return new Promise(() => {});
      this.state = 'running';
      this.emit('statechange');
      return Promise.resolve();
    }
    suspend() { this.state = 'suspended'; this.emit('statechange'); return Promise.resolve(); }
    close() { this.closeCalls++; this.state = 'closed'; this.emit('statechange'); return Promise.resolve(); }
  }
  const root = {
    SightTiming: require('../js/timing.js'),
    AudioContext: FakeAudioContext,
    navigator: { audioSession: {} },
    document: { visibilityState: 'visible', addEventListener(name, fn) { documentEvents.set(name, fn); } },
    addEventListener(name, fn) { windowEvents.set(name, fn); }
  };
  vm.runInNewContext(source, {
    self: root, Float32Array, Date: { now: () => wall },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, due: wall + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    audio: root.PianoAudio,
    contexts,
    hide() { root.document.visibilityState = 'hidden'; documentEvents.get('visibilitychange')(); },
    show() { root.document.visibilityState = 'visible'; documentEvents.get('visibilitychange')(); },
    windowEvent(name, event = {}) { windowEvents.get(name)(event); },
    advance(ms, audioClock = true) {
      wall += ms;
      if (audioClock) contexts.forEach(c => { if (c.state === 'running') c.currentTime += ms / 1000; });
      for (const [id, timer] of Array.from(timers)) {
        if (timer.due <= wall && timers.has(id)) { timers.delete(id); timer.fn(); }
      }
    }
  };
}

test('the first tap after hiding rebuilds the audio context and can schedule sound immediately', () => {
  const h = harness();
  assert.equal(h.audio.unlock(), true);
  const old = h.contexts[0];
  h.hide();
  h.show();
  assert.equal(h.contexts.length, 1);
  assert.equal(h.audio.unlock(), true);
  assert.equal(h.contexts.length, 2);
  assert.equal(old.closeCalls, 1);
  const current = h.contexts[1];
  assert.equal(current.buffers[0].startedAt, 0);
  assert.equal(h.audio.playScore(piece, 1), true);
  assert.ok(current.oscillators.length > 0);
  assert.equal(old.oscillators.length, 0);
  assert.equal(h.audio.isPlaying(), true);
});

test('hiding stops the demonstration and metronome and updates the controls', () => {
  const h = harness();
  let resets = 0;
  let stopped;
  h.audio.onReset(() => { resets++; });
  h.audio.unlock();
  h.audio.playScore(piece, 1, null, value => { stopped = value; });
  h.audio.metronome(80, 4);
  const oscillators = h.contexts[0].oscillators;
  h.hide();
  assert.equal(h.audio.isPlaying(), false);
  assert.equal(h.audio.metronomeOn(), false);
  assert.equal(stopped, true);
  assert.equal(resets, 1);
  assert.ok(oscillators.every(o => o.stops.length >= 2));
});

test('the metronome leaves three eighth notes in the final group of seven eight', () => {
  const h = harness();
  h.audio.unlock();
  h.audio.metronome(120, [1, 1, 1.5]);
  h.advance(2000);
  const clicks = h.contexts[0].oscillators;
  assert.deepEqual(clicks.map(o => Math.round(o.startedAt * 1000)), [1100, 1600, 2100, 2850]);
  assert.deepEqual(clicks.map(o => o.frequency.value), [1760, 1320, 1320, 1760]);
});

test('pagehide and a restored page invalidate audio until the next tap', () => {
  const h = harness();
  h.audio.unlock();
  h.windowEvent('pagehide');
  h.audio.unlock();
  assert.equal(h.contexts.length, 2);
  h.windowEvent('pageshow', { persisted: true });
  assert.equal(h.contexts.length, 2);
  h.audio.unlock();
  assert.equal(h.contexts.length, 3);
});

test('an interruption while visible stops sound and rebuilds on the next tap', () => {
  const h = harness();
  h.audio.unlock();
  h.audio.playScore(piece, 1);
  const old = h.contexts[0];
  old.state = 'interrupted';
  old.emit('statechange');
  assert.equal(h.audio.isPlaying(), false);
  h.audio.unlock();
  assert.equal(h.contexts.length, 2);
  assert.equal(old.closeCalls, 1);
});

test('a context with a stopped clock is rebuilt even when its state says running', () => {
  const h = harness();
  h.audio.unlock();
  h.advance(1200, false);
  h.audio.unlock();
  assert.equal(h.contexts.length, 2);
  assert.equal(h.contexts[0].closeCalls, 1);
});

test('a healthy running clock does not rebuild on repeated taps', () => {
  const h = harness();
  h.audio.unlock();
  h.advance(1200);
  h.audio.unlock();
  assert.equal(h.contexts.length, 1);
  assert.equal(h.contexts[0].closeCalls, 0);
});

test('a resume promise that never settles times out and the next tap recovers', () => {
  const h = harness(['stuck', 'running']);
  const endings = [];
  h.audio.unlock();
  h.audio.playScore(piece, 1, null, (stopped, reason) => endings.push({ stopped, reason }));
  assert.equal(h.contexts[0].oscillators.length, 0);
  h.advance(2100);
  assert.deepEqual(endings, [{ stopped: true, reason: 'nosound' }]);
  assert.equal(h.audio.isPlaying(), false);
  h.audio.unlock();
  h.audio.playScore(piece, 1);
  assert.equal(h.contexts.length, 2);
  assert.ok(h.contexts[1].oscillators.length > 0);
});
