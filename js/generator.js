(function (root) {
  'use strict';

  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var NATURALS = [0, 2, 4, 5, 7, 9, 11];
  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var MINOR = [0, 2, 3, 5, 7, 8, 10];
  var KEYS = [
    ['C', 'C 大调', 'C', 0, 'major', 'C'],
    ['G', 'G 大调', 'G', 0, 'major', 'G'],
    ['F', 'F 大调', 'F', 0, 'major', 'F'],
    ['D', 'D 大调', 'D', 0, 'major', 'D'],
    ['A', 'A 大调', 'A', 0, 'major', 'A'],
    ['Bb', '降 B 大调', 'B', -1, 'major', 'Bb'],
    ['Eb', '降 E 大调', 'E', -1, 'major', 'Eb'],
    ['E', 'E 大调', 'E', 0, 'major', 'E'],
    ['Ab', '降 A 大调', 'A', -1, 'major', 'Ab'],
    ['Dm', 'd 小调', 'D', 0, 'minor', 'Dm'],
    ['Am', 'a 小调', 'A', 0, 'minor', 'Am'],
    ['Em', 'e 小调', 'E', 0, 'minor', 'Em'],
    ['Gm', 'g 小调', 'G', 0, 'minor', 'Gm'],
    ['Bm', 'b 小调', 'B', 0, 'minor', 'Bm'],
    ['F#m', '升 f 小调', 'F', 1, 'minor', 'F#m'],
    ['Cm', 'c 小调', 'C', 0, 'minor', 'Cm'],
    ['C#m', '升 c 小调', 'C', 1, 'minor', 'C#m'],
    ['Fm', 'f 小调', 'F', 0, 'minor', 'Fm'],
    ['B', 'B 大调', 'B', 0, 'major', 'B'],
    ['Db', '降 D 大调', 'D', -1, 'major', 'Db']
  ].map(function (k) {
    return { id: k[0], label: k[1], tonic: k[2], alteration: k[3], mode: k[4], signature: k[5] };
  });
  var METERS = ['2/4', '3/4', '4/4', '3/8', '6/8'];
  var gradeKeys = { '5': KEYS.slice(0, 16), '7': KEYS.slice(0, 18), '8': KEYS };
  var gradeSevenMeters = METERS.concat(['9/8', '5/8', '5/4', '7/8', '7/4']);
  var gradeMeters = { '5': METERS, '7': gradeSevenMeters, '8': gradeSevenMeters.concat(['12/8']) };
  var beatPatterns = {
    '2/4': [1, 1], '3/4': [1, 1, 1], '4/4': [1, 1, 1, 1], '3/8': [1.5],
    '6/8': [1.5, 1.5], '9/8': [1.5, 1.5, 1.5], '12/8': [1.5, 1.5, 1.5, 1.5],
    '5/8': [1.5, 1], '5/4': [3, 2], '7/8': [1, 1, 1.5], '7/4': [2, 2, 3]
  };
  function gradeId(grade) {
    var id = grade == null ? '5' : String(grade);
    if (!Object.hasOwn(gradeKeys, id)) throw new RangeError('Unsupported grade: ' + id);
    return id;
  }
  function keysForGrade(grade) { return gradeKeys[gradeId(grade)]; }
  function metersForGrade(grade) { return gradeMeters[gradeId(grade)]; }
  function beatGroups(meter) { return beatPatterns[meter]; }
  var DIFFICULTIES = [
    { id: 'lower', label: '五级下限', bars: 8 },
    { id: 'middle', label: '五级中间', bars: 8 },
    { id: 'upper', label: '五级上限', bars: 12 }
  ];
  var NOTE_DURATIONS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
  var REST_DURATIONS = [0.5, 1, 2, 4];
  var RHYTHMS = {
    '2/4': {
      lower: [[1, 1], [0.5, 0.5, 1]],
      middle: [[1.5, 0.5], [0.5, 0.5, 1], [0.5, 1, 0.5]],
      upper: [[0.75, 0.25, 1], [0.5, 0.25, 0.25, 1], [0.5, 1, 0.5]]
    },
    '3/4': {
      lower: [[1, 1, 1], [1, 2], [0.5, 0.5, 1, 1]],
      middle: [[1.5, 0.5, 1], [0.5, 0.5, 1, 1], [1, 1, 1]],
      upper: [[0.75, 0.25, 0.5, 0.5, 1], [0.5, 1, 0.5, 1], [1, 0.25, 0.25, 0.5, 1]]
    },
    '4/4': {
      lower: [[1, 1, 1, 1], [1, 1, 2], [1, 1, 0.5, 0.5, 1]],
      middle: [[1.5, 0.5, 1, 1], [1, 0.5, 0.5, 1, 1], [0.5, 1, 0.5, 2]],
      upper: [[0.75, 0.25, 0.5, 0.5, 1, 1], [0.5, 1, 0.5, 1.5, 0.5], [1, 0.25, 0.25, 0.5, 1, 1]]
    },
    '3/8': {
      lower: [[0.5, 0.5, 0.5], [1, 0.5]],
      middle: [[0.5, 1], [0.75, 0.25, 0.5], [0.5, 0.5, 0.5]],
      upper: [[0.75, 0.25, 0.5], [0.5, 0.25, 0.25, 0.5], [0.25, 0.25, 0.5, 0.5]]
    },
    '6/8': {
      lower: [[1.5, 1.5], [0.5, 0.5, 0.5, 1.5]],
      middle: [[0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [1, 0.5, 1, 0.5], [1.5, 0.5, 0.5, 0.5]],
      upper: [[0.75, 0.25, 0.5, 1, 0.5], [0.5, 0.25, 0.25, 0.5, 0.5, 0.5, 0.5], [1, 0.5, 0.5, 1]]
    }
  };
  var MOTIFS = [[0, 1, 2, 1, 0, 2, 1], [2, 1, 0, 1, 2, 1, 0], [0, 2, 1, 0, 1, 2, 1], [2, 0, 1, 2, 1, 0, 1]];
  var VELOCITY = { pp: 0.35, p: 0.45, mp: 0.56, mf: 0.68, f: 0.8, ff: 0.9 };

  function mod(n, m) { return ((n % m) + m) % m; }

  function random(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var value = Math.imul(state ^ (state >>> 15), 1 | state);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pitch(key, degree, octave, harmonic, chromatic) {
    var tonicIndex = LETTERS.indexOf(key.tonic);
    var scale = key.mode === 'minor' ? MINOR : MAJOR;
    var diatonic = tonicIndex + degree;
    var letterIndex = mod(diatonic, 7);
    var noteOctave = octave + Math.floor(diatonic / 7);
    var raised = harmonic && key.mode === 'minor' && mod(degree, 7) === 6 ? 1 : 0;
    var midi = 12 * (octave + 1) + NATURALS[tonicIndex] + key.alteration
      + 12 * Math.floor(degree / 7) + scale[mod(degree, 7)] + raised + (chromatic || 0);
    var accidental = midi - (12 * (noteOctave + 1) + NATURALS[letterIndex]);
    var suffix = accidental < 0 ? 'b'.repeat(-accidental) : '#'.repeat(accidental);
    return {
      midi: midi,
      key: LETTERS[letterIndex].toLowerCase() + suffix + '/' + noteOctave,
      name: LETTERS[letterIndex] + suffix + noteOctave,
      degree: degree,
      harmonic: !!raised,
      chromatic: !!chromatic
    };
  }

  function makePlaybackNotes(events) {
    var byId = new Map(events.map(function (e) { return [e.id, e]; }));
    var notes = [];
    events.forEach(function (e) {
      if (e.tieEnd) return;
      var duration = e.duration;
      var next = e;
      var visited = new Set();
      while (next.tieTo && !visited.has(next.id)) {
        visited.add(next.id);
        next = byId.get(next.tieTo);
        if (!next) break;
        duration += next.duration;
      }
      e.notes.forEach(function (n) {
        notes.push({
          id: n.id, eventId: e.id, midi: n.midi, onset: e.onset, duration: duration,
          hand: e.hand, bar: e.bar, velocity: e.velocity,
          articulation: e.articulation, timingFlexible: !!e.timingFlexible
        });
      });
    });
    return notes.sort(function (a, b) { return a.onset - b.onset || a.midi - b.midi; });
  }

  var DIVISIONS = {
    1: [[0.5, 0.5], [0.75, 0.25], [0.25, 0.25, 0.5]],
    1.5: [[1, 0.5], [0.5, 1], [0.5, 0.5, 0.5]],
    2: [[1, 1], [1.5, 0.5], [1, 0.5, 0.5]],
    3: [[1, 2], [2, 1], [1.5, 0.5, 1]]
  };
  function advancedScore(grade, key, meter, level, seed, rng) {
    var rank = DIFFICULTIES.indexOf(level);
    var bars = (grade === '7' ? [16, 18, 20] : [12, 16, 20])[rank];
    var middle = bars / 2;
    var groups = beatGroups(meter);
    var barBeats = groups.reduce(function (a, b) { return a + b; }, 0);
    var id = ['g' + grade, seed.toString(36), key.id, meter.replace('/', ''), level.id].join('-');
    var motif = MOTIFS[Math.floor(rng() * MOTIFS.length)];
    var sequence = [[0, 5, 1, 4], [0, 3, 1, 4], [0, 2, 5, 3]][Math.floor(rng() * 3)];
    var rhythmOffset = Math.floor(rng() * 6);
    var bassOffset = Math.floor(rng() * 4);
    var answerOffsets = Array.from({ length: middle }, function () { return Math.floor(rng() * motif.length); });
    var progression = [];
    var events = [];
    var hairpins = [];
    var leftClefs = [];
    var barStarts = Array.from({ length: bars }, function (_, i) { return i * barBeats; });
    var tonic = pitch(key, 0, 4).midi;
    var tempoChanges = [];
    function tempo(bar, factor, text) { tempoChanges.push({ bar: bar, fromBeat: barStarts[bar], factor: factor, text: text }); }
    if (grade === '8') {
      tempo(middle, 1.04, 'accel.');
      tempo(middle + 1, 1.10, '');
      tempo(middle + 2, 1.16, '');
    } else tempo(middle, 1.14, 'Più mosso');
    tempo(bars - 3, 1, 'Tempo I');

    for (var bar = 0; bar < bars; bar++) {
      var phase = bar % middle;
      var final = bar === bars - 1;
      var dominant = bar === middle - 1 || bar === bars - 2;
      var root = final || phase === 0 ? 0 : dominant ? 4 : sequence[phase % sequence.length];
      progression.push(root);
      var high = bar === middle || bar === middle + 1;
      leftClefs.push(high ? 'treble' : 'bass');
      var rightOctave = high ? 5 : 4;
      var leftOctave = high ? 4 : (tonic <= 66 ? 3 : 2);
      var writtenGroups = final && NOTE_DURATIONS.includes(barBeats) ? [barBeats] : groups;
      var dynamic = final ? 'p' : phase === 0 ? (high ? 'f' : 'mp') : bar < middle ? 'mp' : 'mf';
      var handEvents = { right: [], left: [] };
      function add(hand, offset, duration, degrees) {
        var octave = hand === 'left' ? leftOctave : rightOctave;
        function voice(register) { return degrees.map(function (d) { return pitch(key, d, register, root === 4); }); }
        var notes = voice(octave);
        var onset = barStarts[bar] + offset;
        if (hand === 'left' && notes.length) {
          var overlaps = handEvents.right.filter(function (e) { return e.onset < onset + duration && e.onset + e.duration > onset; });
          var ceiling = Math.min.apply(null, overlaps.flatMap(function (e) { return e.notes.map(function (n) { return n.midi; }); }));
          if (notes[notes.length - 1].midi >= ceiling) notes = voice(octave - 1);
        }
        var eventId = id + '-' + bar + '-' + hand + '-' + offset;
        notes.forEach(function (note, i) {
          note.id = eventId + '-' + i;
          if (high && hand === 'right') note.writtenKey = pitch(key, degrees[i], octave - 1, root === 4).key;
        });
        var event = { id: eventId, bar: bar, hand: hand, onset: onset, duration: duration,
          notes: notes, velocity: VELOCITY[dynamic], timingFlexible: bar >= bars - 2 };
        events.push(event);
        handEvents[hand].push(event);
        return event;
      }
      var active = (phase + rhythmOffset) % groups.length;
      var step = 0;
      var offset = 0;
      writtenGroups.forEach(function (length, group) {
        var moving = group === active || (rank === 2 && groups.length > 2 && group === (active + 2) % groups.length);
        var pattern = final || !moving ? [length] : DIVISIONS[length][(phase + rhythmOffset + rank) % 3];
        pattern.forEach(function (duration, index) {
          var anchor = root > 3 ? root - 7 : root;
          var degree = anchor + motif[(step + answerOffsets[phase]) % motif.length];
          if (bar >= middle && !high) degree = anchor + 2 - (degree - anchor);
          if (!group && !index) degree = anchor + (phase % 3 === 1 ? 2 : 0);
          var lastNote = group === groups.length - 1 && index === pattern.length - 1;
          if (dominant && lastNote) degree = bar === bars - 2 ? -1 : 4;
          var notes = [degree];
          if (final) notes = grade === '8' ? [-5, -3, 0] : [-3, 0];
          else if (!group && !index && phase % 3 === 0) notes = grade === '8' ? [degree, degree + 2, degree + 4] : [degree, degree + 2];
          else if (!dominant && phase % 4 === 2 && lastNote && pattern.length > 1) notes = [];
          var e = add('right', offset, duration, notes);
          if (!offset && (phase === 0 || final)) e.dynamic = dynamic;
          if (!index && moving && !final && phase % 4 === 1) e.articulation = 'accent';
          if (lastNote && !final && phase % 4 === 3) e.articulation = 'tenuto';
          offset += duration;
          step++;
        });
      });
      offset = 0;
      writtenGroups.forEach(function (length, group) {
        var moving = !final && (group + phase + bassOffset) % groups.length === 0;
        var pattern = moving ? DIVISIONS[length][(phase + bassOffset) % 2] : [length];
        pattern.forEach(function (duration, i) {
          var degrees = [root];
          if (final || (group === 0 && i === 0)) degrees = grade === '8' ? [root, root + 2, root + 4] : [root, root + 4];
          else if (i > 0 || group % 2 === 1) degrees = [root + (i > 0 ? 2 : 4)];
          var e = add('left', offset, duration, degrees);
          if (!final && group % 2 && phase % 3 === 1) e.articulation = 'staccato';
          offset += duration;
        });
      });
      if (final) {
        ['right', 'left'].forEach(function (hand) {
          var attacks = handEvents[hand];
          for (var i = 1; i < attacks.length; i++) {
            attacks[i - 1].tieTo = attacks[i].id;
            attacks[i - 1].tieStart = true;
            attacks[i].tieEnd = true;
          }
        });
      } else if (phase % 3 === 0) {
        var first = handEvents.right[0], last = handEvents.right[handEvents.right.length - 1];
        if (first !== last) {
          first.slurTo = last.id;
          hairpins.push({ from: first.id, to: last.id, type: bar < middle ? 'cresc' : 'dim' });
        }
      }
    }
    events.sort(function (a, b) { return a.onset - b.onset || (a.hand === 'right' ? -1 : 1); });
    return {
      id: id, seed: seed, grade: grade, title: ['晨光', '小径', '晚风', '窗边', '远山', '微雨'][Math.floor(rng() * 6)],
      key: key.id, keyLabel: key.label, keySignature: key.signature, mode: key.mode, meter: meter,
      difficulty: level.id, difficultyLabel: (grade === '7' ? '七级' : '八级') + ['下限', '中段', '上限'][rank],
      bpm: (grade === '8' ? 78 : 72) + rank * 8, bars: bars, barBeats: barBeats, barStarts: barStarts,
      barLengths: Array(bars).fill(barBeats), totalBeats: barBeats * bars, pickupBeats: 0, beatUnit: groups[0],
      events: events, playbackNotes: makePlaybackNotes(events), leftClefs: leftClefs, harmony: progression,
      ottavaBars: [middle, middle + 1],
      tempoChanges: tempoChanges, ritardandoStartBar: bars - 2, ritardando: { fromBeat: barStarts[bars - 2], factor: 1.2 },
      hairpins: hairpins, features: { original: true, motif: motif.slice(), cadence: 'dominant-tonic', pickup: false, clefChanges: true, pedal: false },
      constraints: { source: '本站进阶练习使用的音域与速度范围', rightRange: [48, 96], leftRange: [36, 84],
        maxNotesPerHand: grade === '7' ? 2 : 3, maxChordSpan: 12, maxOnsetsPerHandPerBar: 8,
        noteDurations: NOTE_DURATIONS.slice(), restDurations: NOTE_DURATIONS.slice() }
    };
  }

  function generate(options) {
    options = options || {};
    var grade = gradeId(options.grade);
    var seed = options.seed == null ? Math.floor(Math.random() * 4294967296) : Number(options.seed) >>> 0;
    var rng = random(seed);
    var keyId = options.key || 'C';
    var key = keysForGrade(grade).find(function (k) { return k.id === keyId; });
    if (!key) throw new RangeError('Unsupported key: ' + keyId);
    var meter = options.meter || '4/4';
    if (!metersForGrade(grade).includes(meter)) throw new RangeError('Unsupported meter: ' + meter);
    var difficulty = options.difficulty || 'middle';
    var level = DIFFICULTIES.find(function (d) { return d.id === difficulty; });
    if (!level) throw new RangeError('Unsupported difficulty: ' + difficulty);
    if (grade !== '5') return advancedScore(grade, key, meter, level, seed, rng);
    var upper = difficulty === 'upper';
    var lower = difficulty === 'lower';
    var parts = meter.split('/').map(Number);
    var barBeats = parts[0] * 4 / parts[1];
    var bars = level.bars;
    var phraseLength = bars / 2;
    var pickup = upper && seed % 3 === 0;
    var pickupBeats = pickup ? (meter === '6/8' ? 1.5 : meter === '3/8' ? 0.5 : 1) : 0;
    var barLengths = Array(bars).fill(barBeats);
    if (pickup) { barLengths[0] = pickupBeats; barLengths[bars - 1] = barBeats - pickupBeats; }
    var totalBeats = 0;
    var barStarts = barLengths.map(function (length) { var start = totalBeats; totalBeats += length; return start; });
    var progression = bars === 8 ? [0, 3, 0, 4, 0, 3, 4, 0] : [0, 0, 3, 0, 1, 4, 0, 3, 1, 4, 4, 0];
    if (pickup) progression[0] = 4;
    var motif = MOTIFS[Math.floor(rng() * MOTIFS.length)];
    var rhythmChoice = Math.floor(rng() * RHYTHMS[meter][difficulty].length);
    var title = ['晨光', '小径', '晚风', '窗边', '远山', '微雨'][Math.floor(rng() * 6)];
    var tonicAtFour = pitch(key, 0, 4).midi;
    var rightOctave = tonicAtFour > 67 ? 3 : 4;
    var leftOctave = tonicAtFour - 12 > 54 ? 2 : 3;
    var events = [];
    var id = 's' + seed.toString(36) + '-' + keyId.replace('#', 's') + '-' + meter.replace('/', '') + '-' + difficulty;
    var ritardandoStartBar = upper ? bars - 2 : bars - 1;

    function event(bar, hand, localOnset, duration, degrees, opts) {
      opts = opts || {};
      var octave = hand === 'right' ? rightOctave : leftOctave;
      var harmony = progression[bar];
      var notes = degrees.map(function (d) { return pitch(key, d, octave, harmony === 4); });
      if (hand === 'left' && notes.length) {
        var start = barStarts[bar] + localOnset;
        var ceiling = 68;
        events.forEach(function (e) {
          if (e.hand !== 'right' || e.onset >= start + duration || e.onset + e.duration <= start) return;
          e.notes.forEach(function (n) { ceiling = Math.min(ceiling, n.midi); });
        });
        if (notes.some(function (n) { return n.midi >= ceiling; })) {
          var lowerNotes = degrees.map(function (d) { return pitch(key, d, octave - 1, harmony === 4); });
          if (lowerNotes.every(function (n) { return n.midi >= 43; })) notes = lowerNotes;
          else notes = notes.filter(function (n) { return n.midi < ceiling; });
        }
      }
      var eventId = id + '-b' + bar + '-' + (hand === 'right' ? 'r' : 'l') + '-' + localOnset;
      notes.forEach(function (n, i) { n.id = eventId + '-n' + i; });
      var dynamic = bar < phraseLength ? (lower ? 'mp' : ['pp', 'p', 'mp'][seed % 3]) : (upper ? ['mf', 'f'][seed % 2] : 'mf');
      if (upper && bar === bars - 2) dynamic = 'ff';
      if (bar === bars - 1) dynamic = 'p';
      var e = {
        id: eventId, bar: bar, hand: hand, onset: barStarts[bar] + localOnset,
        duration: duration, notes: notes, velocity: VELOCITY[dynamic],
        timingFlexible: bar >= ritardandoStartBar
      };
      if (hand === 'right' && localOnset === 0 && [0, phraseLength, bars - 2, bars - 1].indexOf(bar) >= 0) e.dynamic = dynamic;
      Object.assign(e, opts);
      events.push(e);
      return e;
    }

    for (var bar = 0; bar < bars; bar++) {
      var chord = progression[bar];
      var final = bar === bars - 1;
      var pickupBar = pickup && bar === 0;
      var dominantEnd = bar === phraseLength - 1 || bar === bars - 2;
      var rhythm = final || pickupBar ? [barLengths[bar]] : RHYTHMS[meter][difficulty][(rhythmChoice + bar % phraseLength) % RHYTHMS[meter][difficulty].length].slice();
      if (upper && (bar === (pickup ? 1 : 0) || bar === phraseLength)) rhythm = RHYTHMS[meter].upper[0].slice();
      if (upper && bar === 2) {
        rhythm = meter === '3/8' ? [0.5, 0.5, 0.5] : meter === '6/8' ? [0.5, 0.5, 0.5, 1.5] : [0.5, 0.5, 1].concat(barBeats === 4 ? [1, 1] : barBeats === 3 ? [1] : []);
      }
      var rightEvents = [];
      var onset = 0;
      rhythm.forEach(function (duration, i) {
        var degree;
        if (pickupBar) degree = motif[0] - 1;
        else if (final) degree = 0;
        else if (dominantEnd) {
          var cadence = bar === bars - 2 ? [4, 3, 1, -1] : [4, 5, 6, 4];
          degree = i === rhythm.length - 1 ? cadence[cadence.length - 1] : cadence[Math.min(i, cadence.length - 2)];
        } else {
          var anchor = chord === 4 ? 4 : chord === 3 ? 3 : chord === 1 ? 1 : 0;
          var motifIndex = i % motif.length;
          var answer = bar >= phraseLength && bar % phraseLength > 0;
          degree = anchor + (answer ? 2 - motif[motifIndex] : motif[motifIndex]);
          var beforeRest = bar === (pickup ? 3 : 1) && i === rhythm.length - 2 && [0.5, 1, 2].indexOf(rhythm[rhythm.length - 1]) >= 0;
          if ((i === rhythm.length - 1 || beforeRest) && duration >= 1) degree = anchor + (degree - anchor > 1 ? 2 : 0);
        }
        var degrees = [degree];
        if (!lower && i === 0 && (final || bar === phraseLength || (upper && bar % 3 === 0))) {
          degrees.push(degree + 2);
        }
        var rest = bar === (pickup ? 3 : 1) && i === rhythm.length - 1 && [0.5, 1, 2].indexOf(duration) >= 0;
        var e = event(bar, 'right', onset, duration, rest ? [] : degrees);
        if (!rest && !final && bar % 4 === 1 && i === 0) e.articulation = lower ? 'staccato' : 'accent';
        if (!rest && !lower && bar % 4 === 2 && i === rhythm.length - 1) e.articulation = 'tenuto';
        rightEvents.push(e);
        onset += duration;
      });

      if (upper && bar === 4 && rightEvents.length >= 2) {
        var approach = rightEvents[rightEvents.length - 2];
        var resolution = rightEvents[rightEvents.length - 1];
        var chromatic = pitch(key, 3, rightOctave, false, 1);
        chromatic.id = approach.id + '-n0';
        approach.notes = [chromatic];
        var fifth = pitch(key, 4, rightOctave);
        fifth.id = resolution.id + '-n0';
        resolution.notes = [fifth];
      }

      if (upper && bar === 2) {
        var from = rightEvents[1];
        var to = rightEvents[2];
        to.notes = from.notes.map(function (n, i) { return Object.assign({}, n, { id: to.id + '-n' + i }); });
        from.tieTo = to.id;
        from.tieStart = true;
        to.tieEnd = true;
      }
      var sounding = rightEvents.filter(function (e) { return e.notes.length; });
      if ((bar % 2 === 0 || (pickup && bar === 1)) && sounding.length > 1 && !(upper && bar === 2)) {
        sounding[0].slurTo = sounding[sounding.length - 1].id;
        sounding[0].slurStart = true;
        sounding[sounding.length - 1].slurEnd = true;
      }
      if (upper && final) rightEvents[0].fermata = true;

      var wholeBarRest = pickupBar || (upper && bar === 4);
      var bassRhythm = final || lower || wholeBarRest ? [barLengths[bar]] : meter === '3/8' ? [1, 0.5] : meter === '6/8' ? [1.5, 1.5] : barBeats === 3 ? [1, 2] : barBeats === 4 ? [2, 2] : [1, 1];
      onset = 0;
      bassRhythm.forEach(function (duration, i) {
        var bassDegrees;
        if (final) bassDegrees = [0, 4];
        else if (lower) bassDegrees = bar % 2 === 0 ? [chord, chord + 4] : [chord];
        else if (i === 0) bassDegrees = [chord, chord + 4];
        else bassDegrees = upper ? [chord + 2, chord + 4] : [chord + 2];
        var rest = wholeBarRest || (upper && bar === 7 && i === bassRhythm.length - 1 && [0.5, 1, 2].indexOf(duration) >= 0);
        event(bar, 'left', onset, duration, rest ? [] : bassDegrees, wholeBarRest ? { restWholeBar: true } : {});
        onset += duration;
      });
    }

    events.sort(function (a, b) { return a.onset - b.onset || (a.hand === 'right' ? -1 : 1); });
    var hairpins = [];
    if (!lower) [2, bars - 2].forEach(function (bar, index) {
      var notes = events.filter(function (e) { return e.bar === bar && e.hand === 'right' && e.notes.length; });
      if (notes.length > 1) hairpins.push({ from: notes[0].id, to: notes[notes.length - 1].id, type: index ? 'dim' : 'cresc' });
    });
    var bpm = meter === '6/8' ? (lower ? 78 : upper ? 96 : 87) : meter === '3/8' ? (lower ? 66 : upper ? 84 : 75) : (lower ? 60 : upper ? 80 : 72);
    return {
      id: id, grade: grade, seed: seed, title: title, key: keyId, keyLabel: key.label,
      keySignature: key.signature, mode: key.mode, meter: meter, difficulty: difficulty,
      difficultyLabel: level.label, bpm: bpm, bars: bars, barBeats: barBeats,
      totalBeats: totalBeats, barLengths: barLengths, barStarts: barStarts, pickupBeats: pickupBeats,
      beatUnit: meter === '6/8' ? 1.5 : meter === '3/8' ? 0.5 : 1,
      events: events, playbackNotes: makePlaybackNotes(events), harmony: progression,
      ritardandoStartBar: ritardandoStartBar,
      ritardando: { fromBeat: barStarts[ritardandoStartBar], factor: 1.25 },
      hairpins: hairpins,
      features: { original: true, motif: motif.slice(), cadence: 'dominant-tonic', pickup: pickup, clefChanges: false, pedal: false },
      constraints: {
        source: '本网站的保守练习范围，绝对音域与速度不是官方规定',
        rightRange: [55, 84], leftRange: [43, 67], maxNotesPerHand: 2,
        maxChordSpan: 12, maxOnsetsPerHandPerBar: 8,
        noteDurations: NOTE_DURATIONS.slice(), restDurations: REST_DURATIONS.slice(),
        limitations: ['三个难度是本站教学分档', '当前使用固定的问答乐句与调性和声，不代表所有考试音乐风格']
      }
    };
  }

  var api = { KEYS: gradeKeys['5'], ALL_KEYS: KEYS, METERS: METERS, DIFFICULTIES: DIFFICULTIES,
    keysForGrade: keysForGrade, metersForGrade: metersForGrade, beatGroups: beatGroups,
    generate: generate, pitch: pitch, makePlaybackNotes: makePlaybackNotes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SightGenerator = api;
})(typeof self !== 'undefined' ? self : this);
