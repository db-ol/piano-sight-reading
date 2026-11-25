const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/alignment.js');
const G = require('../js/generator.js');

const score = {
  bpm: 120,
  events: [
    { id: 'a', bar: 0, hand: 'rh', onset: 0, duration: 1, notes: [{ id: 'a0', midi: 60 }, { id: 'a1', midi: 64 }, { id: 'a2', midi: 67 }] },
    { id: 'b', bar: 0, hand: 'rh', onset: 1, duration: 1, notes: [{ id: 'b0', midi: 62 }] },
    { id: 'c', bar: 0, hand: 'rh', onset: 2, duration: 1, notes: [{ id: 'c0', midi: 65 }] },
    { id: 'd', bar: 0, hand: 'rh', onset: 3, duration: 1, notes: [{ id: 'd0', midi: 64 }] },
    { id: 'e', bar: 1, hand: 'rh', onset: 4, duration: 1, notes: [{ id: 'e0', midi: 67 }] },
    { id: 'f', bar: 1, hand: 'rh', onset: 5, duration: 1, notes: [{ id: 'f0', midi: 69 }] },
    { id: 'g', bar: 1, hand: 'rh', onset: 6, duration: 1, notes: [{ id: 'g0', midi: 71 }] },
    { id: 'h', bar: 1, hand: 'rh', onset: 7, duration: 1, notes: [{ id: 'h0', midi: 72 }] },
    { id: 'i', bar: 2, hand: 'rh', onset: 8, duration: 1, notes: [{ id: 'i0', midi: 69 }] },
    { id: 'j', bar: 2, hand: 'rh', onset: 9, duration: 1, notes: [{ id: 'j0', midi: 65 }] },
    { id: 'k', bar: 2, hand: 'rh', onset: 10, duration: 1, notes: [{ id: 'k0', midi: 67 }] },
    { id: 'l', bar: 2, hand: 'rh', onset: 11, duration: 1, notes: [{ id: 'l0', midi: 60 }] }
  ]
};

function performance(speed = 1) {
  return score.events.flatMap(e => e.notes.map(n => ({ midi: n.midi, time: 2 + e.onset * 0.5 / speed, duration: 0.4 / speed, confidence: 1 })));
}

test('a printed tempo change and return preserve the written note positions in feedback', () => {
  const timing = require('../js/timing.js');
  const changes = [{ fromBeat: 4, factor: 2 }, { fromBeat: 8, factor: 1 }];
  const piece = { ...score, tempoChanges: changes };
  const elapsed = [0, 1, 2, 3, 4, 4.5, 5, 5.5, 6, 7, 8, 9];
  assert.deepEqual(score.events.map(e => timing.beatsAt(piece, e.onset)), elapsed);
  const take = score.events.flatMap(e => e.notes.map(n => ({ midi: n.midi, time: elapsed[e.onset] * 0.5 })));
  const result = A.analyze(piece, take);
  assert.equal(result.summary.rhythm, 0);
  assert.equal(result.summary.pauses, 0);
  assert.equal(result.summary.tempoBpm, score.bpm);
  assert.equal(result.notes.at(-1).onset, 11);
  const slowing = { ...piece, totalBeats: 12, ritardando: { fromBeat: 8, factor: 1.5 } };
  assert.equal(timing.beatsAt(slowing, 12), 11);
});

test('a correct chord and melody have no issues despite initial silence', () => {
  const result = A.analyze(score, performance());
  assert.equal(result.summary.correct, 14);
  for (const key of ['wrong', 'missing', 'extra', 'rhythm', 'pauses']) assert.equal(result.summary[key], 0, key);
  assert.equal(result.summary.tempoBpm, 120);
  assert.ok(result.notes.every(n => n.status === 'correct'));
});

test('one changed chord tone identifies only its stable note id', () => {
  const played = performance();
  played[1].midi = 63;
  const result = A.analyze(score, played);
  assert.equal(result.summary.wrong, 1);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.summary.extra, 0);
  assert.deepEqual(result.notes.filter(n => n.status === 'wrong').map(n => [n.noteId, n.actualMidi]), [['a1', 63]]);
});

test('a missing chord tone preserves the other two chord tones', () => {
  const played = performance();
  played.splice(1, 1);
  const result = A.analyze(score, played);
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.wrong, 0);
  assert.equal(result.notes.find(n => n.noteId === 'a1').status, 'missing');
  assert.equal(result.notes.find(n => n.noteId === 'a2').status, 'correct');
});

test('an omitted onset does not shift the rest of the phrase', () => {
  const played = performance().filter(n => n.time !== 4);
  const result = A.analyze(score, played);
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.wrong, 0);
  assert.equal(result.summary.rhythm, 0);
  assert.equal(result.notes.find(n => n.noteId === 'e0').status, 'missing');
});

test('extra chord tones and extra intervening onsets are reported separately', () => {
  const played = performance();
  played.push({ midi: 73, time: 2, duration: 0.4 });
  played.push({ midi: 53, time: 3.75, duration: 0.1 });
  const result = A.analyze(score, played);
  assert.equal(result.summary.extra, 2);
  assert.equal(result.summary.wrong, 0);
  assert.equal(result.summary.missing, 0);
  assert.deepEqual(result.extras.map(n => n.midi).sort(), [53, 73]);
});

test('a uniformly slower performance reports the tempo without false rhythm errors', () => {
  const result = A.analyze(score, performance(0.8));
  assert.equal(result.summary.correct, 14);
  assert.equal(result.summary.rhythm, 0);
  assert.equal(result.summary.pauses, 0);
  assert.equal(result.summary.tempoBpm, 96);
  assert.equal(result.summary.tempoRatio, 0.8);
});

test('a delayed note and a recovery create local rhythm feedback', () => {
  const played = performance();
  played.find(n => n.time === 4).time += 0.2;
  const result = A.analyze(score, played);
  assert.equal(result.summary.rhythm, 2);
  assert.equal(result.notes.find(n => n.noteId === 'e0').status, 'rhythm');
  assert.equal(result.notes.find(n => n.noteId === 'f0').status, 'rhythm');
  assert.equal(result.summary.wrong, 0);
  assert.equal(result.summary.pauses, 0);
});

test('a pause is not hidden by tempo estimation or propagated through later notes', () => {
  const played = performance().map(n => ({ ...n, time: n.time >= 4 ? n.time + 2 : n.time }));
  const result = A.analyze(score, played);
  assert.equal(result.summary.pauses, 1);
  assert.equal(result.summary.rhythm, 0);
  assert.equal(result.summary.tempoBpm, 120);
  assert.equal(result.pauses[0].noteId, 'e0');
  assert.equal(result.pauses[0].seconds, 2);
  assert.equal(result.notes.find(n => n.noteId === 'f0').status, 'correct');
});

test('all microphone findings are candidates and an absent detection is not certain omission', () => {
  const played = performance();
  played[1].midi = 63;
  played.splice(3, 1);
  const result = A.analyze(score, played, { source: 'microphone' });
  assert.equal(result.summary.wrong, 0);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.summary.uncertain, 14);
  assert.equal(result.summary.suspectedWrong, 1);
  assert.equal(result.summary.suspectedMissing, 1);
  assert.ok(result.notes.every(n => n.status === 'uncertain'));
});

test('low confidence observations remain uncertain even outside microphone mode', () => {
  const played = performance();
  played[1].confidence = 0.25;
  const result = A.analyze(score, played);
  assert.equal(result.summary.uncertain, 1);
  assert.equal(result.notes.find(n => n.noteId === 'a1').status, 'uncertain');
});

test('rolled attacks within the chord window do not become extra onsets', () => {
  const played = performance();
  played[1].time += 0.02;
  played[2].time += 0.04;
  const result = A.analyze(score, played);
  assert.equal(result.summary.correct, 14);
  assert.equal(result.summary.extra, 0);
  assert.equal(result.summary.rhythm, 0);
});

test('notated ritardando does not count as rhythm errors or pauses', () => {
  const flexible = { ...score, ritardandoStartBar: 2 };
  const played = performance().map(n => ({ ...n, time: n.time >= 6 ? n.time + (n.time - 5.5) * 2 : n.time }));
  const result = A.analyze(flexible, played);
  assert.equal(result.summary.rhythm, 0);
  assert.equal(result.summary.pauses, 0);
  assert.equal(result.summary.tempoBpm, 120);
});

test('a fermata also exempts the following onset interval', () => {
  const flexible = structuredClone(score);
  flexible.events[3].timingFlexible = true;
  const played = performance().map(n => ({ ...n, time: n.time >= 4 ? n.time + 2 : n.time }));
  const result = A.analyze(flexible, played);
  assert.equal(result.summary.pauses, 0);
  assert.equal(result.summary.rhythm, 0);
});

test('precomputed playback notes avoid requiring a new attack for tied notes', () => {
  const tied = {
    bpm: 120,
    events: [
      { id: 'first', onset: 0, duration: 1, notes: [{ id: 'first-note', midi: 60 }] },
      { id: 'last', onset: 1, duration: 1, tieEnd: true, notes: [{ id: 'last-note', midi: 60 }] }
    ],
    playbackNotes: [{ id: 'first-note', midi: 60, onset: 0, duration: 2, bar: 0, hand: 'rh' }]
  };
  const result = A.analyze(tied, [{ midi: 60, time: 0, duration: 1 }]);
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.correct, 1);
  assert.equal(A.expectedNotes({ ...tied, playbackNotes: undefined }).length, 1);
});

test('one physical key supports overlapping unison notes in both hands', () => {
  const unison = { bpm: 120, events: [
    { id: 'r', onset: 0, duration: 1, hand: 'rh', notes: [{ id: 'r0', midi: 60 }] },
    { id: 'l', onset: 0, duration: 1, hand: 'lh', notes: [{ id: 'l0', midi: 60 }] }
  ] };
  const result = A.analyze(unison, [{ midi: 60, time: 0, duration: 1 }]);
  assert.equal(result.summary.correct, 2);
  assert.equal(result.summary.missing, 0);
});

test('empty and malformed recordings are handled without inventing evidence', () => {
  const result = A.analyze(score, [{ midi: NaN, time: 0 }, { midi: 60, time: -1 }, { midi: 128, time: 0 }], { source: 'microphone' });
  assert.equal(result.summary.rejected, 3);
  assert.equal(result.summary.tempoBpm, null);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.summary.suspectedMissing, 14);
  assert.equal(result.summary.uncertain, 14);
  assert.ok(result.limitations.some(text => text.includes('没有收到')));
});

test('analysis preserves the original score and performance arrays', () => {
  const played = performance();
  const before = JSON.stringify({ score, played });
  A.analyze(score, played);
  assert.equal(JSON.stringify({ score, played }), before);
});

function repeatedScore() {
  const melody = [60, 62, 64, 65, 60, 62, 64, 65, 67, 69, 71, 72];
  return {
    bpm: 120,
    events: melody.map((midi, i) => ({ id: 'e' + i, bar: Math.floor(i / 4), onset: i, duration: 1, notes: [{ id: 'n' + i, midi }] }))
  };
}

function playMelody(s) {
  return s.events.map(e => ({ midi: e.notes[0].midi, time: 2 + e.onset * 0.5, duration: 0.4 }));
}

test('a wrong first note does not cause the recording to start on the next bar', () => {
  const s = repeatedScore();
  const played = playMelody(s);
  played[0].midi = 61;
  const result = A.analyze(s, played);
  assert.equal(result.summary.wrong, 1);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.summary.extra, 0);
  assert.equal(result.notes.find(n => n.noteId === 'n0').status, 'wrong');
});

test('an omitted opening note is recovered from the following melodic contour', () => {
  const s = repeatedScore();
  const result = A.analyze(s, playMelody(s).slice(1));
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.wrong, 0);
  assert.equal(result.notes.find(n => n.noteId === 'n0').status, 'missing');
  assert.equal(result.summary.rhythm, 0);
});

test('a missing final phrase stays at the end rather than moving to an earlier repetition', () => {
  const s = repeatedScore();
  const result = A.analyze(s, playMelody(s).slice(0, -4));
  assert.deepEqual(result.notes.filter(n => n.pitchStatus === 'missing').map(n => n.noteId), ['n8', 'n9', 'n10', 'n11']);
  assert.equal(result.summary.wrong, 0);
  assert.equal(result.summary.rhythm, 0);
});

test('starting late is distinct from a pause in the music', () => {
  const s = repeatedScore();
  const result = A.analyze(s, playMelody(s).map(n => ({ ...n, time: n.time + 10 })));
  assert.equal(result.summary.correct, 12);
  assert.equal(result.summary.pauses, 0);
  assert.equal(result.summary.rhythm, 0);
  assert.equal(result.summary.tempoBpm, 120);
});

test('a completely unrelated melody does not receive a reliable location assessment', () => {
  const s = repeatedScore();
  const result = A.analyze(s, playMelody(s).map(n => ({ ...n, midi: 90 })));
  assert.equal(result.summary.correct, 0);
  assert.equal(result.alignmentReliable, false);
  assert.equal(result.alignmentQuality, 'weak');
  assert.ok(result.limitations.some(text => text.includes('无法可靠定位')));
});

test('a pause inside a repeated pattern is retained at the correct occurrence', () => {
  const s = repeatedScore();
  const played = playMelody(s).map((n, i) => ({ ...n, time: n.time + (i >= 4 ? 3 : 0) }));
  const result = A.analyze(s, played);
  assert.equal(result.summary.correct, 12);
  assert.equal(result.summary.missing, 0);
  assert.equal(result.summary.pauses, 1);
  assert.equal(result.pauses[0].noteId, 'n4');
  assert.equal(result.pauses[0].seconds, 3);
});

test('a skipped repeated phrase does not become multiple wrong notes', () => {
  const s = repeatedScore();
  const played = playMelody(s).filter((n, i) => i < 4 || i >= 8);
  const result = A.analyze(s, played);
  assert.deepEqual(result.notes.filter(n => n.pitchStatus === 'missing').map(n => n.noteId), ['n4', 'n5', 'n6', 'n7']);
  assert.equal(result.summary.wrong, 0);
  assert.equal(result.summary.pauses, 0);
});

test('a repeated key with a missing attack discloses ambiguous location', () => {
  const s = repeatedScore();
  s.events.forEach(e => { e.notes[0].midi = 60; });
  const result = A.analyze(s, playMelody(s).slice(1));
  assert.equal(result.summary.missing, 1);
  assert.ok(result.limitations.some(text => text.includes('歧义')));
});

test('an unrelated extra bass note is not substituted for a nearby wrong treble tone', () => {
  const played = performance();
  played[2].midi = 68;
  played.push({ midi: 41, time: 2, duration: 0.4 });
  const result = A.analyze(score, played);
  assert.equal(result.summary.wrong, 1);
  assert.equal(result.summary.extra, 1);
  assert.equal(result.notes.find(n => n.noteId === 'a2').actualMidi, 68);
  assert.equal(result.extras[0].midi, 41);
});

function playGenerated(s, startTime) {
  const keys = new Set();
  return s.playbackNotes.filter(n => {
    const key = n.onset + ':' + n.midi;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  }).map(n => ({ midi: n.midi, time: startTime + n.onset * 60 / s.bpm, duration: n.duration * 60 / s.bpm }));
}

test('generated scores align through pickups, rests, ties and every selectable configuration', () => {
  for (const key of G.KEYS) for (const meter of G.METERS) for (const difficulty of G.DIFFICULTIES) {
    for (const seed of [0, 2]) {
      const s = G.generate({ key: key.id, meter, difficulty: difficulty.id, seed });
      const played = playGenerated(s, 1.7);
      const result = A.analyze(s, played);
      const context = `${key.id} ${meter} ${difficulty.id} ${seed}`;
      assert.equal(result.summary.correct, s.playbackNotes.length, context);
      for (const issue of ['wrong', 'missing', 'extra', 'rhythm', 'pauses']) assert.equal(result.summary[issue], 0, `${context} ${issue}`);
      assert.ok(result.alignmentReliable, context);
      assert.ok(Math.abs(result.summary.tempoBpm - s.bpm) < 1e-6, context);
    }
  }
});

test('a local mistake in generated polyphony preserves the rest of every configuration', () => {
  for (const key of G.KEYS) for (const meter of G.METERS) for (const difficulty of G.DIFFICULTIES) {
    const s = G.generate({ key: key.id, meter, difficulty: difficulty.id, seed: 2 });
    const played = playGenerated(s, 1);
    const target = s.playbackNotes.find(n => n.bar === 2 && n.hand === 'right' && s.playbackNotes.filter(other => other.onset === n.onset && other.midi === n.midi).length === 1);
    assert.ok(target);
    played.find(n => n.midi === target.midi && n.time === 1 + target.onset * 60 / s.bpm).midi += 24;
    const result = A.analyze(s, played);
    const context = `${key.id} ${meter} ${difficulty.id}`;
    assert.equal(result.summary.wrong, 1, context);
    assert.equal(result.summary.missing, 0, context);
    assert.equal(result.summary.extra, 0, context);
    assert.equal(result.summary.rhythm, 0, context);
    assert.equal(result.notes.find(n => n.noteId === target.id).status, 'wrong', context);
  }
});
