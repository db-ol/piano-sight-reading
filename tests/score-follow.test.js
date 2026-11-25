const test = require('node:test');
const assert = require('node:assert/strict');
const { midiTracker } = require('../js/score-follow.js');
const { generate, metersForGrade } = require('../js/generator.js');

test('following played notes keeps chords together and tolerates a wrong or missed attack', () => {
  const tracker = midiTracker([
    { bar: 0, onset: 0, midi: 60 }, { bar: 0, onset: 0, midi: 64 },
    { bar: 0, onset: 1, midi: 65 }, { bar: 1, onset: 2, midi: 67 },
    { bar: 2, onset: 4, midi: 67 }
  ]);
  assert.equal(tracker.match(new Set([60, 64])), 0);
  assert.equal(tracker.match(new Set([57])), null);
  assert.equal(tracker.match(new Set([67])), 1);
  assert.equal(tracker.match(new Set([67])), 2);
  tracker.seek(1);
  assert.equal(tracker.match(new Set([67])), 1);
});

test('every generated attack advances the follower to its written bar', () => {
  for (const grade of ['5', '7', '8']) {
    for (const meter of metersForGrade(grade)) {
      const score = generate({ grade, seed: 6, key: 'Cm', meter, difficulty: 'upper' });
      const tracker = midiTracker(score.playbackNotes);
      const attacks = new Map();
      for (const note of score.playbackNotes) {
        if (!attacks.has(note.onset)) attacks.set(note.onset, []);
        attacks.get(note.onset).push(note);
      }
      for (const notes of attacks.values()) {
        assert.equal(tracker.match(new Set(notes.map(note => note.midi))), notes[0].bar);
      }
    }
  }
});
