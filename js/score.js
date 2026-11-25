(function (root) {
  'use strict';
  var VF = root.Vex.Flow || root.Vex;
  var references = {};
  var shownScore;
  var shownResult;
  var host;
  function color(name) { return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim(); }
  function rhythm(duration) {
    var values = { 4: ['w', false], 3: ['h', true], 2: ['h', false], 1.5: ['q', true], 1: ['q', false], 0.75: ['8', true], 0.5: ['8', false], 0.25: ['16', false] };
    return values[duration] || ['q', false];
  }
  function statusFor(note, result) {
    if (!result) return null;
    return result.notes.find(function (item) { return item.noteId === note.id; });
  }
  function markColor(mark) {
    if (!mark) return color('score-ink');
    var status = mark.status;
    if (status === 'uncertain') {
      if (mark.pitchStatus === 'wrong') return color('wrong');
      if (mark.pitchStatus === 'missing') return color('missing');
      if (mark.pause) return color('pause');
      if (mark.rhythm) return color('rhythm');
      return color('score-ink');
    }
    return status === 'correct' ? color('score-ink') : color(status);
  }
  function render(container, score, result) {
    host = container;
    shownScore = score;
    shownResult = result;
    references = {};
    container.replaceChildren();
    var computed = getComputedStyle(container);
    var columns = computed.gridTemplateColumns.split(' ').length;
    var width = (container.clientWidth - 10 - (columns > 1 ? 8 : 0)) / (columns > 1 ? 2 : 1);
    var scale = width < 380 ? 0.85 : 1;
    var advanced = score.grade === '7' || score.grade === '8';
    if (advanced) scale = Math.min(scale, width / 435);
    var topSpace = advanced ? 16 : 0;
    var virtual = Math.floor(width / scale);
    for (var bar = 0; bar < score.bars; bar++) {
      var system = document.createElement('div');
      system.className = 'score-system';
      system.dataset.bar = bar;
      system.id = 'bar-' + bar;
      var renderer = new VF.Renderer(system, VF.Renderer.Backends.SVG);
      renderer.resize(width, (235 + topSpace) * scale);
      var ctx = renderer.getContext();
      ctx.scale(scale, scale);
      ctx.setFillStyle(color('score-ink'));
      ctx.setStrokeStyle(color('score-ink'));
      var treble = new VF.Stave(15, 12 + topSpace, virtual - 25).addClef('treble').addKeySignature(score.key);
      var leftClef = score.leftClefs ? score.leftClefs[bar] : 'bass';
      var bass = new VF.Stave(15, 117 + topSpace, virtual - 25).addClef(leftClef).addKeySignature(score.key);
      if (bar === 0) { treble.addTimeSignature(score.meter); bass.addTimeSignature(score.meter); }
      if (bar === score.bars - 1) { treble.setEndBarType(VF.Barline.type.END); bass.setEndBarType(VF.Barline.type.END); }
      var startX = Math.max(treble.getNoteStartX(), bass.getNoteStartX());
      treble.setNoteStartX(startX);
      bass.setNoteStartX(startX);
      treble.setContext(ctx).draw();
      bass.setContext(ctx).draw();
      new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
      new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
      var voices = [];
      var allBeams = [];
      ['right', 'left'].forEach(function (hand, handIndex) {
        var events = score.events.filter(function (e) { return e.bar === bar && e.hand === hand; });
        var staveNotes = events.map(function (event) {
          var rests = !event.notes.length;
          var r = event.restWholeBar ? ['w', false] : rhythm(event.duration);
          var note = new VF.StaveNote({
            clef: handIndex ? leftClef : 'treble',
            keys: rests ? [handIndex && leftClef === 'bass' ? 'd/3' : 'b/4'] : event.notes.map(function (n) { return n.writtenKey || n.key; }),
            duration: r[0] + (rests ? 'r' : ''),
            dots: r[1] ? 1 : 0,
            auto_stem: true
          });
          if (r[1]) VF.Dot.buildAndAttach([note], { all: true });
          if (event.restWholeBar) { note.setDuration(new VF.Fraction(Math.round(event.duration * 4), 16)); note.setCenterAlignment(true); }
          event.notes.forEach(function (n, index) {
            var c = markColor(statusFor(n, result));
            note.setKeyStyle(index, { fillStyle: c, strokeStyle: c });
          });
          if (event.articulation) {
            var codes = { staccato: 'a.', tenuto: 'a-', accent: 'a>', fermata: 'a@a' };
            if (codes[event.articulation]) note.addModifier(new VF.Articulation(codes[event.articulation]).setPosition(VF.Modifier.Position.ABOVE), 0);
          }
          if (event.fermata && event.articulation !== 'fermata') note.addModifier(new VF.Articulation('a@a').setPosition(VF.Modifier.Position.ABOVE), 0);
          if (event.dynamic) note.addModifier(new VF.Annotation(event.dynamic).setFont('Times', 14, 'italic').setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
          references[event.id] = { note: note, event: event, ctx: ctx, system: system, scale: scale, virtual: virtual };
          return note;
        });
        var parts = score.meter.split('/').map(Number);
        var voice = new VF.Voice({ num_beats: parts[0], beat_value: parts[1] }).setMode(VF.Voice.Mode.SOFT).addTickables(staveNotes);
        VF.Accidental.applyAccidentals([voice], score.key);
        voices.push(voice);
        var groups = SightGenerator.beatGroups(score.meter).map(function (quarters) { return new VF.Fraction(quarters * 2, 8); });
        allBeams.push.apply(allBeams, VF.Beam.generateBeams(staveNotes, { groups: groups, beam_rests: false }));
      });
      var formatter = new VF.Formatter().joinVoices([voices[0]]).joinVoices([voices[1]]);
      formatter.format(voices, virtual - startX - 28);
      voices[0].draw(ctx, treble);
      voices[1].draw(ctx, bass);
      allBeams.forEach(function (beam) { beam.setContext(ctx).draw(); });
      if (score.ottavaBars && score.ottavaBars.includes(bar)) {
        var melody = voices[0].getTickables();
        var ottava = new VF.TextBracket({ start: melody[0], stop: melody[melody.length - 1], text: '8', superscript: 'va', position: 'top' });
        ottava.render_options.color = color('score-ink');
        ottava.setContext(ctx).draw();
      }
      var number = document.createElement('span');
      number.className = 'bar-number';
      number.textContent = String(bar + 1).padStart(2, '0');
      system.append(number);
      var svg = system.querySelector('svg');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', barLabel(score, bar));
      var tempo = score.tempoChanges && score.tempoChanges.find(function (change) { return change.bar === bar && change.text; });
      var ritardando = score.ritardando && (score.barStarts ? score.barStarts[bar] : bar * score.barBeats) === score.ritardando.fromBeat;
      if (ritardando || tempo) {
        var tempoMark = document.createElement('span');
        tempoMark.className = 'bar-flags';
        tempoMark.textContent = ritardando ? 'rit.' : tempo.text;
        system.append(tempoMark);
      }
      container.append(system);
    }
    score.events.forEach(function (event) {
      var a = references[event.id];
      if (event.tieTo && references[event.tieTo]) {
        var b = references[event.tieTo];
        var indices = event.notes.map(function (_, index) { return index; });
        if (a.system === b.system) new VF.StaveTie({ first_note: a.note, last_note: b.note, first_indices: indices, last_indices: indices }).setContext(a.ctx).draw();
        else {
          new VF.StaveTie({ first_note: a.note, first_indices: indices, last_indices: indices }).setContext(a.ctx).draw();
          new VF.StaveTie({ last_note: b.note, first_indices: indices, last_indices: indices }).setContext(b.ctx).draw();
        }
      }
      if (event.slurTo && references[event.slurTo]) {
        var end = references[event.slurTo];
        if (a.system === end.system) new VF.Curve(a.note, end.note, { cps: [{ x: 0, y: 14 }, { x: 0, y: 14 }] }).setContext(a.ctx).draw();
        else {
          new VF.Curve(a.note, undefined, { cps: [{ x: 0, y: 10 }, { x: 0, y: 10 }] }).setContext(a.ctx).draw();
          new VF.Curve(undefined, end.note, { cps: [{ x: 0, y: 10 }, { x: 0, y: 10 }] }).setContext(end.ctx).draw();
        }
      }
    });
    if (score.hairpins) score.hairpins.forEach(function (hairpin) {
      var a = references[hairpin.from || hairpin.fromId];
      var b = references[hairpin.to || hairpin.toId];
      if (a && b && a.system === b.system) new VF.StaveHairpin({ first_note: a.note, last_note: b.note }, hairpin.type === 'dim' ? VF.StaveHairpin.type.DECRESC : VF.StaveHairpin.type.CRESC).setPosition(VF.Modifier.Position.BELOW).setContext(a.ctx).draw();
    });
    if (result) decorate(result);
  }
  function decorate(result) {
    var byBar = {};
    result.notes.forEach(function (n) {
      var label = n.pitchStatus === 'wrong' ? '●' : n.pitchStatus === 'missing' ? '○' : n.pause ? 'Ⅱ' : n.rhythm ? '△' : '';
      if (!label) return;
      if (!byBar[n.bar]) byBar[n.bar] = new Set();
      byBar[n.bar].add(label + (n.uncertain ? '？' : ''));
    });
    result.extras.forEach(function (n) {
      if (n.bar === null) return;
      if (!byBar[n.bar]) byBar[n.bar] = new Set();
      byBar[n.bar].add('＋' + (n.uncertain ? '？' : ''));
    });
    Object.keys(byBar).forEach(function (bar) {
      var system = host.querySelector('[data-bar="' + bar + '"]');
      if (!system) return;
      var flags = system.querySelector('.bar-flags');
      if (!flags) { flags = document.createElement('span'); flags.className = 'bar-flags'; system.append(flags); }
      var marks = document.createElement('span'); marks.className = 'wrong';
      marks.textContent = Array.from(byBar[bar]).join(' ');
      flags.append(marks);
    });
  }
  function highlight(note) {
    if (!host) return;
    host.querySelectorAll('.active').forEach(function (el) { el.classList.remove('active'); });
    if (!note) return;
    var bar = host.querySelector('[data-bar="' + note.bar + '"]');
    if (bar) bar.classList.add('active');
  }
  function barLabel(score, bar) {
    return I18n.t('第' + (bar + 1) + '小节，' + score.keyLabel + '，' + score.meter,
      'Bar ' + (bar + 1) + ', ' + I18n.keyName(score.key, 'en') + ', ' + score.meter);
  }
  document.addEventListener('languagechange:app', function () {
    if (!host) return;
    host.querySelectorAll('.score-system svg').forEach(function (svg, bar) {
      svg.setAttribute('aria-label', barLabel(shownScore, bar));
    });
  });
  root.SightScore = { render: render, highlight: highlight, redraw: function () { if (host && shownScore && host.clientWidth) render(host, shownScore, shownResult); } };
})(window);
