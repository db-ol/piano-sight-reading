const test = require('node:test');
const assert = require('node:assert/strict');
const generator = require('../js/generator.js');
const guide = require('../js/key-guide.js');

test('every grade groups all of its keys by the written signature', () => {
  for (const grade of ['5', '7', '8']) {
    const groups = guide.groupsForGrade(grade);
    const keys = groups.flatMap(group => [group.major, group.minor].filter(Boolean));
    assert.deepEqual(keys.map(k => k.id).sort(), generator.keysForGrade(grade).map(k => k.id).sort());
    for (const group of groups) {
      const scales = [group.major, group.minor].filter(Boolean).map(key =>
        Array.from({ length: 7 }, (_, degree) => generator.pitch(key, degree, 4).key.split('/')[0]).sort());
      const altered = scales[0].filter(name => name.length > 1);
      assert.equal(altered.length, Math.abs(group.fifths));
      assert.ok(altered.every(note => note.endsWith(group.fifths < 0 ? 'b' : '#')));
      if (scales.length === 2) assert.deepEqual(scales[0], scales[1]);
    }
  }
});

test('six different studies in every key have complete bars and faithfully timed playback', () => {
  for (const key of generator.keysForGrade('8')) {
    const rhythms = new Set();
    for (const study of guide.studies) {
      const score = guide.makeExample(key, study);
      const [beats, unit] = score.meter.split('/').map(Number);
      const barLength = beats * 4 / unit;
      const sounding = score.events.filter(event => event.notes.length);
      assert.deepEqual(score.playbackNotes.map(note => [note.onset, note.duration, note.midi]),
        sounding.map(event => [event.onset, event.duration, event.notes[0].midi]));
      for (const bar of [0, 1]) {
        const events = score.events.filter(event => event.bar === bar);
        assert.equal(events[0].onset, bar * barLength);
        assert.equal(events.reduce((sum, e) => sum + e.duration, 0), barLength);
      }
      assert.equal(sounding.at(-1).notes[0].degree, 0);
      if (study.id === 'rests') assert.equal(score.events.length - sounding.length, 2);
      if (study.id === 'bass') assert.ok(sounding.every(event => event.hand === 'left' && event.notes[0].midi <= 72));
      rhythms.add(JSON.stringify(score.events.map(event => [event.notes[0]?.degree, event.duration])));
    }
    assert.equal(rhythms.size, 6);
  }
});

test('cadences use the major or minor third and spell the leading note for the key', () => {
  const minorLeading = { Am: 'g#', Em: 'd#', Bm: 'a#', 'F#m': 'e#', Dm: 'c#', Gm: 'f#', Cm: 'b', 'C#m': 'b#', Fm: 'e' };
  const cadence = guide.studies.find(study => study.id === 'cadence');
  for (const key of generator.keysForGrade('8')) {
    const pitches = guide.makeExample(key, cadence).events.map(event => event.notes[0]);
    assert.equal(pitches[1].midi - pitches[0].midi, key.mode === 'minor' ? 3 : 4);
    assert.equal(pitches[4].midi - pitches[3].midi, 1);
    if (key.mode === 'minor') assert.equal(pitches[3].key.split('/')[0], minorLeading[key.id]);
  }
});
