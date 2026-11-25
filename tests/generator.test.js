const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/generator.js');

const natural = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const major = [0, 2, 4, 5, 7, 9, 11];
const minor = [0, 2, 3, 5, 7, 8, 10];
const mod = (n, m) => ((n % m) + m) % m;

test('official cumulative keys and meters are complete', () => {
  assert.deepEqual(G.KEYS.map(k => k.id).sort(), ['C', 'G', 'F', 'D', 'A', 'Bb', 'Eb', 'E', 'Ab', 'Dm', 'Am', 'Em', 'Gm', 'Bm', 'F#m', 'Cm'].sort());
  assert.deepEqual(G.METERS.slice().sort(), ['2/4', '3/4', '4/4', '3/8', '6/8'].sort());
});

test('every key, meter and difficulty satisfies musical and notation bounds across seeds', () => {
  for (const key of G.KEYS) for (const meter of G.METERS) for (const difficulty of G.DIFFICULTIES) {
    for (let seed = 0; seed < 12; seed++) {
      const s = G.generate({ key: key.id, meter, difficulty: difficulty.id, seed });
      const context = `${key.id} ${meter} ${difficulty.id} ${seed}`;
      assert.ok(s.bars >= 8 && s.bars <= 12, context);
      assert.equal(s.keySignature, key.signature, context);
      assert.equal(s.events.at(-1).onset + s.events.at(-1).duration, s.totalBeats, context);
      const ids = new Set();
      for (let bar = 0; bar < s.bars; bar++) for (const hand of ['right', 'left']) {
        const events = s.events.filter(e => e.bar === bar && e.hand === hand);
        assert.ok(events.length > 0 && events.length <= 8, context);
        let cursor = s.barStarts[bar];
        for (const e of events) {
          assert.equal(e.onset, cursor, context);
          cursor += e.duration;
          if (e.restWholeBar) {
            assert.equal(e.notes.length, 0, context);
            assert.equal(e.duration, s.barLengths[bar], context);
          } else assert.ok((e.notes.length ? s.constraints.noteDurations : s.constraints.restDurations).includes(e.duration), context);
          assert.ok(e.notes.length <= 2, context);
          if (e.notes.length === 2) assert.ok(Math.abs(e.notes[1].midi - e.notes[0].midi) <= 12, context);
          for (const n of e.notes) {
            assert.ok(!ids.has(n.id), context);
            ids.add(n.id);
            const range = hand === 'right' ? s.constraints.rightRange : s.constraints.leftRange;
            assert.ok(n.midi >= range[0] && n.midi <= range[1], `${context} ${hand} ${n.midi}`);
            const [, letter, accidental, octave] = /^([a-g])([#b]*)\/(\d)$/.exec(n.key);
            const alteration = [...accidental].reduce((a, x) => a + (x === '#' ? 1 : -1), 0);
            assert.equal(n.midi, (Number(octave) + 1) * 12 + natural[letter] + alteration, context);
            const tonic = natural[key.tonic.toLowerCase()] + key.alteration;
            const scale = key.mode === 'minor' ? minor : major;
            const degree = mod(n.degree, 7);
            assert.equal(mod(n.midi - tonic, 12), mod(scale[degree] + (n.harmonic ? 1 : 0) + (n.chromatic ? 1 : 0), 12), context);
            if (n.harmonic) assert.equal(degree, 6, context);
          }
        }
        assert.equal(cursor, s.barStarts[bar] + s.barLengths[bar], context);
      }
    }
  }
});

test('melodic phrases have a dominant midpoint and a final dominant to tonic cadence', () => {
  for (const k of G.KEYS) for (const meter of G.METERS) {
    const s = G.generate({ key: k.id, meter, difficulty: 'upper', seed: 73 });
    assert.equal(s.harmony[s.bars / 2 - 1], 4);
    assert.deepEqual(s.harmony.slice(-2), [4, 0]);
    const penultimate = s.events.filter(e => e.bar === s.bars - 2 && e.hand === 'right').at(-1);
    const final = s.events.find(e => e.bar === s.bars - 1 && e.hand === 'right');
    assert.equal(final.notes[0].midi - penultimate.notes[0].midi, 1);
    if (k.mode === 'minor') assert.equal(penultimate.notes[0].harmonic, true);
    const first = s.events.filter(e => e.bar === (s.features.pickup ? 1 : 0) && e.hand === 'right');
    const reprise = s.events.filter(e => e.bar === s.bars / 2 && e.hand === 'right');
    assert.deepEqual(first.map(e => e.notes[0].degree), reprise.map(e => e.notes[0].degree));
  }
});

test('hands stay separated throughout sustained notes and retain bass roots at cadences', () => {
  for (const key of G.KEYS) for (const meter of G.METERS) for (const difficulty of G.DIFFICULTIES) {
    for (const seed of [0, 1, 2, 3, 17, 73, 811, 13411]) {
      const s = G.generate({ key: key.id, meter, difficulty: difficulty.id, seed });
      const context = `${key.id} ${meter} ${difficulty.id} ${seed}`;
      const left = s.playbackNotes.filter(n => n.hand === 'left');
      const right = s.playbackNotes.filter(n => n.hand === 'right');
      for (const l of left) for (const r of right) {
        if (l.onset < r.onset + r.duration && r.onset < l.onset + l.duration) {
          assert.ok(l.midi < r.midi, `${context} left ${l.midi} right ${r.midi} at ${l.onset}/${r.onset}`);
        }
      }
      for (const bar of [s.bars / 2 - 1, s.bars - 2, s.bars - 1]) {
        const firstBass = s.events.find(e => e.hand === 'left' && e.bar === bar);
        assert.ok(firstBass.notes.length > 0, context);
        assert.equal(firstBass.notes[0].degree, s.harmony[bar], context);
      }
    }
  }
});

test('long phrase notes settle on chord tones and chromatic approaches resolve by step', () => {
  for (const difficulty of G.DIFFICULTIES) for (const meter of G.METERS) {
    const s = G.generate({ key: 'Cm', meter, difficulty: difficulty.id, seed: 17 });
    for (let bar = 0; bar < s.bars; bar++) {
      const right = s.events.filter(e => e.hand === 'right' && e.bar === bar && e.notes.length);
      const last = right.at(-1);
      const approachIndex = right.findIndex(e => e.notes.some(n => n.chromatic));
      if (approachIndex >= 0) assert.equal(right[approachIndex + 1].notes[0].midi - right[approachIndex].notes[0].midi, 1);
      if (!last || bar === s.bars / 2 - 1 || bar >= s.bars - 2 || (difficulty.id === 'upper' && [2, 4].includes(bar))) continue;
      if (last.duration >= 1) assert.ok([0, 2, 4].includes(mod(last.notes[0].degree - s.harmony[bar], 7)), `${difficulty.id} ${meter} bar ${bar}`);
    }
  }
});

test('upper exercises contain the required representative rhythms and detail', () => {
  for (const meter of G.METERS) {
    const s = G.generate({ key: 'F#m', meter, difficulty: 'upper', seed: 2 });
    assert.ok(s.events.some(e => e.duration === 0.25));
    assert.ok(s.events.some(e => e.duration === 0.75));
    assert.ok(s.events.some(e => e.notes.length === 0));
    assert.ok(s.events.some(e => e.tieTo));
    assert.ok(s.events.some(e => e.slurTo));
    assert.ok(s.events.some(e => e.notes.some(n => n.chromatic)));
    assert.ok(s.events.some(e => e.dynamic === 'ff'));
    assert.ok(s.events.some(e => e.fermata && e.timingFlexible));
    assert.ok(s.events.some(e => e.articulation === 'accent'));
    assert.ok(s.events.some(e => e.articulation === 'tenuto'));
    assert.equal(s.features.pickup, false);
    assert.equal(s.features.clefChanges, false);
    assert.equal(s.features.pedal, false);
    for (const e of s.events.filter(e => e.tieTo)) {
      const destination = s.events.find(n => n.id === e.tieTo);
      assert.equal(destination.hand, e.hand);
      assert.equal(destination.onset, e.onset + e.duration);
      assert.deepEqual(destination.notes.map(n => n.midi), e.notes.map(n => n.midi));
      const playback = s.playbackNotes.find(n => n.id === e.notes[0].id);
      assert.equal(playback.duration, e.duration + destination.duration);
      assert.ok(!s.playbackNotes.some(n => n.id === destination.notes[0].id));
    }
  }
});

test('seed reproduces the whole score and different seeds give varied exercises', () => {
  const options = { key: 'Ab', meter: '6/8', difficulty: 'upper', seed: 13411 };
  assert.deepEqual(G.generate(options), G.generate(options));
  const variants = new Set(Array.from({ length: 40 }, (_, seed) => JSON.stringify(G.generate({ ...options, seed }).events.map(e => [e.duration, e.notes.map(n => n.midi)]))));
  assert.ok(variants.size >= 6);
});

test('pickup measures and their final complements preserve real timing', () => {
  for (const meter of G.METERS) {
    const s = G.generate({ key: 'Cm', meter, difficulty: 'upper', seed: 6 });
    assert.equal(s.features.pickup, true);
    assert.ok(s.pickupBeats > 0 && s.pickupBeats < s.barBeats);
    assert.equal(s.barLengths[0] + s.barLengths.at(-1), s.barBeats);
    assert.equal(s.totalBeats, (s.bars - 1) * s.barBeats);
    assert.equal(s.barStarts[1], s.pickupBeats);
    assert.equal(s.ritardando.fromBeat, s.barStarts[s.ritardandoStartBar]);
    const firstFull = s.events.filter(e => e.bar === 1 && e.hand === 'right');
    const reprise = s.events.filter(e => e.bar === s.bars / 2 && e.hand === 'right');
    assert.deepEqual(firstFull.map(e => e.notes[0].degree), reprise.map(e => e.notes[0].degree));
    assert.ok(s.playbackNotes.every(n => n.onset >= 0 && n.onset + n.duration <= s.totalBeats));
  }
});

test('generated collection covers all dynamics and published rest lengths', () => {
  const dynamics = new Set();
  const rests = new Set();
  let wholeBar = false;
  for (let seed = 0; seed < 12; seed++) for (const meter of G.METERS) {
    const s = G.generate({ meter, difficulty: 'upper', seed });
    s.events.forEach(e => {
      if (e.dynamic) dynamics.add(e.dynamic);
      if (!e.notes.length && !e.restWholeBar) rests.add(e.duration);
      if (e.restWholeBar) wholeBar = true;
    });
  }
  assert.deepEqual([...dynamics].sort(), ['pp', 'p', 'mp', 'mf', 'f', 'ff'].sort());
  assert.ok([0.5, 1, 2].every(d => rests.has(d)));
  assert.equal(wholeBar, true);
});

test('unsupported settings fail explicitly', () => {
  assert.throws(() => G.generate({ key: 'Db' }), RangeError);
  assert.throws(() => G.generate({ meter: '5/4' }), RangeError);
  assert.throws(() => G.generate({ difficulty: 'expert' }), RangeError);
});

test('advanced grades use the cumulative keys and meters and preserve the default grade', () => {
  assert.deepEqual(G.keysForGrade('7').slice(16).map(k => k.id), ['C#m', 'Fm']);
  assert.deepEqual(G.keysForGrade(8).slice(18).map(k => k.id), ['B', 'Db']);
  assert.deepEqual(G.metersForGrade(7).slice(5), ['9/8', '5/8', '5/4', '7/8', '7/4']);
  assert.deepEqual(G.metersForGrade(8).slice(10), ['12/8']);
  assert.throws(() => G.generate({ grade: 7, key: 'Db' }), RangeError);
  assert.throws(() => G.generate({ grade: 7, meter: '12/8' }), RangeError);
  assert.throws(() => G.generate({ grade: '3' }), RangeError);
  assert.deepEqual(G.generate({ seed: 123 }), G.generate({ grade: '5', seed: 123 }));
});

test('advanced scores have playable voices, complete bars, register changes and grade specific tempos and chords', () => {
  for (const grade of ['7', '8']) for (const key of G.keysForGrade(grade)) {
    for (const meter of G.metersForGrade(grade)) for (const level of G.DIFFICULTIES) {
      const score = G.generate({ grade, key: key.id, meter, difficulty: level.id, seed: 812 });
      assert.equal(score.grade, grade);
      assert.equal(score.bars, (grade === '7' ? [16, 18, 20] : [12, 16, 20])[G.DIFFICULTIES.indexOf(level)]);
      assert.equal(score.barBeats, G.beatGroups(meter).reduce((a, b) => a + b));
      assert.deepEqual(new Set(score.leftClefs), new Set(['bass', 'treble']));
      assert.ok(score.tempoChanges.length >= (grade === '8' ? 4 : 2));
      assert.ok(score.tempoChanges[0].factor > 1);
      assert.equal(score.tempoChanges.at(-1).factor, 1);
      for (const change of score.tempoChanges) assert.equal(change.fromBeat, score.barStarts[change.bar]);
      const maxChord = grade === '8' ? 3 : 2;
      for (const hand of ['right', 'left']) {
        const voice = score.events.filter(e => e.hand === hand);
        assert.equal(Math.max(...voice.map(e => e.notes.length)), maxChord);
        for (let bar = 0; bar < score.bars; bar++) {
          let cursor = score.barStarts[bar];
          for (const event of voice.filter(e => e.bar === bar)) {
            assert.equal(event.onset, cursor);
            assert.ok(score.constraints.noteDurations.includes(event.duration));
            assert.ok(!event.notes.length || event.notes.at(-1).midi - event.notes[0].midi <= score.constraints.maxChordSpan);
            for (const note of event.notes) {
              if (hand === 'right' && score.ottavaBars.includes(bar)) {
                const [name, octave] = note.key.split('/');
                assert.equal(note.writtenKey, name + '/' + (Number(octave) - 1));
              } else assert.equal(note.writtenKey, undefined);
            }
            cursor += event.duration;
          }
          assert.equal(cursor, score.barStarts[bar] + score.barBeats);
        }
      }
      const notes = score.playbackNotes;
      for (const right of notes.filter(n => n.hand === 'right')) {
        const overlapping = notes.filter(n => n.hand === 'left' && n.onset < right.onset + right.duration && n.onset + n.duration > right.onset);
        assert.ok(overlapping.every(left => left.midi < right.midi), score.id);
      }
      const finalBar = notes.filter(n => n.bar === score.bars - 1);
      assert.ok(finalBar.every(n => n.duration === score.barBeats && n.onset + n.duration === score.totalBeats));
    }
  }
});
