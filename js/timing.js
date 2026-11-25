(function (root) {
  'use strict';

  function beatsAt(score, beat) {
    // Express elapsed time in beats at the opening tempo.
    var rit = score.ritardando;
    function withRitardando(position) {
      if (!rit || position <= rit.fromBeat) return position;
      var span = Math.max(1, (score.totalBeats || score.bars * score.barBeats) - rit.fromBeat);
      var extra = position - rit.fromBeat;
      return position + (rit.factor - 1) * extra * extra / (2 * span);
    }
    var changes = score.tempoChanges || [];
    var previous = 0, elapsed = 0, factor = 1;
    for (var i = 0; i < changes.length && changes[i].fromBeat < beat; i++) {
      var change = changes[i];
      var boundary = withRitardando(change.fromBeat);
      elapsed += (boundary - previous) / factor;
      previous = boundary;
      factor = change.factor;
    }
    return elapsed + (withRitardando(beat) - previous) / factor;
  }

  var api = { beatsAt: beatsAt };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SightTiming = api;
})(typeof self !== 'undefined' ? self : this);
