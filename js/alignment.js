(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./timing.js'));
  else root.SightAlignment = factory(root.SightTiming);
})(typeof self !== 'undefined' ? self : this, function (timing) {
  'use strict';

  function median(values) {
    if (!values.length) return null;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function flexible(score, event) {
    return !!event.timingFlexible || (finite(score.ritardandoStartBar) && event.bar >= score.ritardandoStartBar);
  }

  function expectedNotes(score) {
    if (Array.isArray(score.playbackNotes)) {
      return score.playbackNotes.map(function (note, index) {
        return Object.assign({}, note, {
          noteId: note.id || 'note-' + index,
          eventId: note.eventId || note.id || 'note-' + index,
          timingFlexible: flexible(score, note)
        });
      });
    }
    var notes = [];
    (score.events || []).forEach(function (event, eventIndex) {
      if (event.tieContinuation || event.tieEnd) return;
      (event.notes || []).forEach(function (note, index) {
        if (note.tieContinuation || note.tieEnd) return;
        notes.push({
          noteId: note.id || (event.id || 'event-' + eventIndex) + ':' + index,
          eventId: event.id || 'event-' + eventIndex,
          midi: note.midi,
          bar: event.bar,
          hand: event.hand,
          onset: event.onset,
          duration: event.duration,
          timingFlexible: flexible(score, event)
        });
      });
    });
    return notes;
  }

  function groupExpected(notes) {
    var groups = [];
    notes.slice().sort(function (a, b) { return a.onset - b.onset || a.midi - b.midi; }).forEach(function (note) {
      var group = groups[groups.length - 1];
      if (!group || Math.abs(note.onset - group.onset) > 0.00001) {
        group = { onset: note.onset, notes: [], timingFlexible: false };
        groups.push(group);
      }
      group.notes.push(note);
      group.timingFlexible = group.timingFlexible || note.timingFlexible;
    });
    return groups;
  }

  function groupPerformed(performed, windowSeconds) {
    var groups = [];
    performed.slice().sort(function (a, b) { return a.time - b.time || a.midi - b.midi; }).forEach(function (note) {
      var group = groups[groups.length - 1];
      if (!group || note.time - group.time > windowSeconds) {
        group = { time: note.time, notes: [] };
        groups.push(group);
      }
      group.notes.push(note);
    });
    return groups;
  }

  function pitches(notes) { return Array.from(new Set(notes.map(function (note) { return note.midi; }))); }

  function pitchCost(expected, actual) {
    var a = pitches(expected.notes);
    var b = pitches(actual.notes);
    var common = a.filter(function (midi) { return b.indexOf(midi) !== -1; }).length;
    return 1.25 * (1 - common / Math.max(a.length, b.length));
  }

  // Time is a tie breaker here so a pause cannot make the remaining phrase disappear.
  function alignGroups(expected, actual, secondsPerBeat, startTime) {
    var rows = expected.length + 1;
    var cols = actual.length + 1;
    var costs = new Float64Array(rows * cols);
    var paths = new Uint8Array(rows * cols);
    var skipCost = 0.95;
    var timeWeight = 0.45 / Math.max(rows, cols);
    var i;
    var j;
    for (i = 1; i < rows; i++) { costs[i * cols] = i * skipCost; paths[i * cols] = 1; }
    for (j = 1; j < cols; j++) { costs[j] = j * skipCost; paths[j] = 2; }
    for (i = 1; i < rows; i++) {
      for (j = 1; j < cols; j++) {
        var index = i * cols + j;
        var predictedTime = startTime + expected[i - 1].onset * secondsPerBeat;
        var timeCost = Math.min(1, Math.abs(actual[j - 1].time - predictedTime) / Math.max(secondsPerBeat, 0.1)) * timeWeight;
        var match = costs[(i - 1) * cols + j - 1] + pitchCost(expected[i - 1], actual[j - 1]) + timeCost;
        var missing = costs[(i - 1) * cols + j] + skipCost;
        var extra = costs[i * cols + j - 1] + skipCost;
        costs[index] = match;
        if (missing < costs[index] - 1e-8) { costs[index] = missing; paths[index] = 1; }
        if (extra < costs[index] - 1e-8) { costs[index] = extra; paths[index] = 2; }
      }
    }
    var matches = [];
    i = rows - 1;
    j = cols - 1;
    while (i || j) {
      var direction = paths[i * cols + j];
      if (direction === 1) { matches.push({ expected: i - 1, actual: null }); i--; }
      else if (direction === 2) { matches.push({ expected: null, actual: j - 1 }); j--; }
      else { matches.push({ expected: i - 1, actual: j - 1 }); i--; j--; }
    }
    return matches.reverse();
  }

  function estimateTempo(matches, expected, actual, target) {
    var ratios = [];
    var previous = null;
    matches.forEach(function (match) {
      if (match.expected === null || match.actual === null) return;
      var e = expected[match.expected];
      var a = actual[match.actual];
      if (previous && !e.timingFlexible && !previous.e.timingFlexible) {
        var beats = e.onset - previous.e.onset;
        var seconds = a.time - previous.a.time;
        if (beats > 0.001 && seconds > 0.025 && seconds / beats >= target * 0.35 && seconds / beats <= target * 3) {
          ratios.push(seconds / beats);
        }
      }
      previous = { e: e, a: a };
    });
    return ratios.length >= 3 ? median(ratios) : target;
  }

  function pairNotes(expected, actual) {
    var remaining = actual.slice();
    var matchedByPitch = new Map();
    var pairs = [];
    var unmatched = [];
    expected.forEach(function (note) {
      if (matchedByPitch.has(note.midi)) {
        pairs.push({ expected: note, actual: matchedByPitch.get(note.midi) });
        return;
      }
      var index = remaining.findIndex(function (n) { return n.midi === note.midi; });
      if (index !== -1) {
        var found = remaining.splice(index, 1)[0];
        matchedByPitch.set(note.midi, found);
        pairs.push({ expected: note, actual: found });
      } else unmatched.push(note);
    });
    unmatched.sort(function (a, b) { return a.midi - b.midi; });
    remaining.sort(function (a, b) { return a.midi - b.midi; });
    var rows = unmatched.length + 1;
    var cols = remaining.length + 1;
    var costs = new Float64Array(rows * cols).fill(Infinity);
    var paths = new Uint8Array(rows * cols);
    costs[0] = 0;
    var allowMissing = unmatched.length > remaining.length;
    var i;
    var j;
    for (i = 1; i < rows; i++) if (allowMissing) { costs[i * cols] = 0; paths[i * cols] = 1; }
    for (j = 1; j < cols; j++) if (!allowMissing) { costs[j] = 0; paths[j] = 2; }
    for (i = 1; i < rows; i++) {
      for (j = 1; j < cols; j++) {
        var index = i * cols + j;
        costs[index] = costs[(i - 1) * cols + j - 1] + Math.abs(unmatched[i - 1].midi - remaining[j - 1].midi);
        var alternative = allowMissing ? costs[(i - 1) * cols + j] : costs[i * cols + j - 1];
        if (alternative < costs[index]) { costs[index] = alternative; paths[index] = allowMissing ? 1 : 2; }
      }
    }
    var extraNotes = [];
    i = rows - 1;
    j = cols - 1;
    while (i || j) {
      var direction = paths[i * cols + j];
      if (direction === 1) { pairs.push({ expected: unmatched[--i], actual: null }); }
      else if (direction === 2) { extraNotes.push(remaining[--j]); }
      else { pairs.push({ expected: unmatched[--i], actual: remaining[--j] }); }
    }
    return { pairs: pairs, extras: extraNotes };
  }

  function analyze(score, performed, options) {
    options = options || {};
    var source = options.source || 'midi';
    var uncertainSource = source === 'microphone';
    var threshold = finite(options.confidenceThreshold) ? options.confidenceThreshold : 0.55;
    var targetBpm = finite(score.bpm) && score.bpm > 0 ? score.bpm : 80;
    var target = 60 / targetBpm;
    var rejected = 0;
    var valid = (performed || []).filter(function (note) {
      var good = finite(note.midi) && Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127 && finite(note.time) && note.time >= 0;
      if (!good) rejected++;
      return good;
    });
    var expected = groupExpected(expectedNotes(score).filter(function (note) { return finite(note.onset) && finite(note.midi); }));
    if (score.tempoChanges && score.tempoChanges.length) {
      expected.forEach(function (group) { group.onset = timing.beatsAt(score, group.onset); });
    }
    var actual = groupPerformed(valid, finite(options.chordWindow) ? options.chordWindow : 0.06);
    if (expected.length > 2000 || actual.length > 4000) throw new RangeError('Too many note groups to align');
    var offset = actual.length && expected.length ? actual[0].time - expected[0].onset * target : 0;
    var matches = alignGroups(expected, actual, target, offset);
    var secondsPerBeat = estimateTempo(matches, expected, actual, target);
    var firstMatch = matches.find(function (match) { return match.expected !== null && match.actual !== null; });
    if (firstMatch) offset = actual[firstMatch.actual].time - expected[firstMatch.expected].onset * secondsPerBeat;
    matches = alignGroups(expected, actual, secondsPerBeat, offset);
    secondsPerBeat = estimateTempo(matches, expected, actual, target);
    var results = [];
    var extras = [];
    var pauses = [];
    var summary = {
      total: 0, correct: 0, wrong: 0, missing: 0, extra: 0, rhythm: 0, pauses: 0, uncertain: 0,
      suspectedWrong: 0, suspectedMissing: 0, suspectedExtra: 0, suspectedRhythm: 0, suspectedPauses: 0,
      tempoBpm: actual.length > 1 ? 60 / secondsPerBeat : null,
      tempoRatio: actual.length > 1 ? target / secondsPerBeat : null,
      rejected: rejected
    };
    var previous = null;

    function addExtra(note, near) {
      var lowConfidence = finite(note.confidence) && note.confidence < threshold;
      var uncertain = uncertainSource || lowConfidence;
      extras.push({ midi: note.midi, time: note.time, confidence: note.confidence, uncertain: uncertain, bar: near ? near.bar : null, noteId: near ? near.noteId : null, status: uncertain ? 'uncertain' : 'extra' });
      if (uncertain) summary.suspectedExtra++;
      else summary.extra++;
    }

    matches.forEach(function (match) {
      if (match.expected === null) {
        var near = previous ? previous.e.notes[0] : (expected[0] ? expected[0].notes[0] : null);
        actual[match.actual].notes.forEach(function (note) { addExtra(note, near); });
        return;
      }
      var e = expected[match.expected];
      var a = match.actual === null ? null : actual[match.actual];
      var timingError = null;
      var rhythm = false;
      var pause = false;
      if (a && previous && !e.timingFlexible && !previous.e.timingFlexible) {
        var expectedInterval = (e.onset - previous.e.onset) * secondsPerBeat;
        var actualInterval = a.time - previous.a.time;
        timingError = actualInterval - expectedInterval;
        pause = timingError > Math.max(0.7, secondsPerBeat);
        rhythm = !pause && Math.abs(timingError) > Math.max(0.11, expectedInterval * 0.22);
        if (pause) {
          pauses.push({ bar: e.notes[0].bar, noteId: e.notes[0].noteId, onset: e.notes[0].onset, seconds: timingError, time: a.time, uncertain: uncertainSource });
          summary[uncertainSource ? 'suspectedPauses' : 'pauses']++;
        }
        if (rhythm) summary[uncertainSource ? 'suspectedRhythm' : 'rhythm']++;
      }
      var pairing = pairNotes(e.notes, a ? a.notes : []);
      pairing.pairs.forEach(function (pair) {
        var note = pair.expected;
        var played = pair.actual;
        var pitchStatus = !played ? 'missing' : played.midi === note.midi ? 'correct' : 'wrong';
        var lowConfidence = played && finite(played.confidence) && played.confidence < threshold;
        var uncertain = uncertainSource || !!lowConfidence;
        var status = uncertain ? 'uncertain' : pitchStatus !== 'correct' ? pitchStatus : pause ? 'pause' : rhythm ? 'rhythm' : 'correct';
        results.push({
          noteId: note.noteId, eventId: note.eventId, bar: note.bar, hand: note.hand,
          midi: note.midi, onset: note.onset, status: status, pitchStatus: pitchStatus,
          actualMidi: played ? played.midi : null, actualTime: played ? played.time : null,
          timingError: timingError, confidence: played ? played.confidence : null,
          uncertain: uncertain, rhythm: rhythm, pause: pause, timingFlexible: e.timingFlexible
        });
        summary.total++;
        if (uncertain) {
          summary.uncertain++;
          if (pitchStatus === 'wrong') summary.suspectedWrong++;
          if (pitchStatus === 'missing') summary.suspectedMissing++;
        } else summary[pitchStatus]++;
      });
      pairing.extras.forEach(function (note) { addExtra(note, e.notes[0]); });
      if (a) previous = { e: e, a: a };
    });

    var matchingNotes = results.filter(function (note) { return note.pitchStatus === 'correct'; }).length;
    var coverage = matchingNotes / Math.max(1, results.length, valid.length);
    var alignmentReliable = coverage >= 0.35;
    var alignmentQuality = coverage >= 0.7 ? 'strong' : alignmentReliable ? 'moderate' : 'weak';
    var limitations = ['这是练习参考，不是 ABRSM 官方分数。', '节奏反馈依据起音间隔，未自动评价音色、力度、分句和踏板。'];
    if (!alignmentReliable) limitations.push('共同音过少，无法可靠定位错音。请先核对选曲和输入，再结合录音检查。');
    if (results.some(function (note) { return note.pitchStatus === 'missing'; }) && expected.some(function (group, index) { return index > 0 && pitchCost(group, expected[index - 1]) === 0; })) {
      limitations.push('重复同音可能使漏音位置产生歧义，特别是开头等待与结尾缺失，需要听录音复核。');
    }
    if (uncertainSource) limitations.push('麦克风转录结果全部为候选，需要结合录音核对。未识别到的音不能证明漏弹。');
    if (expected.some(function (group) { return group.timingFlexible; })) limitations.push('标有渐慢或延长的片段不自动判断节奏和停顿。');
    if (!valid.length) limitations.push('没有收到有效音符。请先检查输入设备，再决定是否重试。');
    if (rejected) limitations.push('已忽略无效的输入事件。');
    return { notes: results, extras: extras, pauses: pauses, summary: summary, source: source, limitations: limitations, matches: matches, alignmentReliable: alignmentReliable, alignmentQuality: alignmentQuality };
  }

  return { analyze: analyze, expectedNotes: expectedNotes, groupPerformed: groupPerformed };
});
