(function (root) {
  'use strict';

  var generator = typeof module === 'object' && module.exports ? require('./generator.js') : root.SightGenerator;
  var sharps = ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'];
  var flats = ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭'];
  var studies = [
    { id: 'cadence', zh: '导音与主音', en: 'Leading note and tonic', meter: '3/4', bpm: 84,
      bars: [[[0, 1], [2, 1], [1, 1]], [[-1, 1], [0, 2]]] },
    { id: 'steps', zh: '级进与转向', en: 'Steps and turns', meter: '2/4', bpm: 72,
      bars: [[[0, 1], [1, 0.5], [2, 0.5]], [[3, 0.5], [2, 0.5], [1, 0.5], [0, 0.5]]] },
    { id: 'triad', zh: '分解和弦', en: 'Broken triads', meter: '3/4', bpm: 76,
      bars: [[[0, 1], [2, 1], [4, 1]], [[7, 1], [4, 0.5], [2, 0.5], [0, 1]]] },
    { id: 'bass', zh: '左手低音', en: 'Left hand bass', meter: '4/4', bpm: 80, clef: 'bass',
      bars: [[[0, 2], [4, 2]], [[2, 1], [3, 1], [4, 1], [0, 1]]] },
    { id: 'compound', zh: '六八拍分组', en: 'Grouping in 6/8', meter: '6/8', bpm: 78,
      bars: [[[0, 0.5], [1, 0.5], [2, 0.5], [4, 1.5]], [[3, 1], [2, 0.5], [0, 1.5]]] },
    { id: 'rests', zh: '休止与再进入', en: 'Rests and reentry', meter: '4/4', bpm: 76,
      bars: [[[null, 1], [0, 0.5], [2, 0.5], [4, 1], [3, 1]], [[2, 1], [null, 0.5], [1, 0.5], [0, 2]]] }
  ];

  function groupsForGrade(grade) {
    var groups = new Map();
    generator.keysForGrade(grade).forEach(function (key) {
      var fifths = 0;
      for (var degree = 0; degree < 7; degree++) {
        var accidental = generator.pitch(key, degree, 4).key.split('/')[0].slice(1);
        fifths += accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
      }
      if (!groups.has(fifths)) groups.set(fifths, { fifths: fifths });
      groups.get(fifths)[key.mode] = key;
    });
    function order(fifths) { return fifths >= 0 ? fifths : 7 - fifths; }
    return Array.from(groups.values()).sort(function (a, b) { return order(a.fifths) - order(b.fifths); });
  }

  function noteName(pitch) {
    var name = pitch.key.split('/')[0];
    return name[0].toUpperCase() + name.slice(1).replace(/b/g, '♭').replace(/#/g, '♯');
  }

  function makeExample(key, study) {
    var clef = study.clef || 'treble';
    var octave = clef === 'bass' ? ('CDE'.includes(key.tonic) ? 3 : 2) : 4;
    var events = [];
    var onset = 0;
    study.bars.forEach(function (bar, barIndex) {
      bar.forEach(function (step, index) {
        var id = ['guide', key.id, study.id, barIndex, index].join('-');
        var notes = [];
        if (step[0] !== null) {
          var pitch = generator.pitch(key, step[0], octave, study.id === 'cadence');
          pitch.id = id + '-note';
          notes.push(pitch);
        }
        events.push({ id: id, notes: notes, hand: clef === 'bass' ? 'left' : 'right',
          onset: onset, bar: barIndex, duration: step[1], velocity: index === 0 ? 0.73 : 0.65 });
        onset += step[1];
      });
    });
    return { key: key.id, bpm: study.bpm, meter: study.meter, clef: clef, events: events, playbackNotes: generator.makePlaybackNotes(events) };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { groupsForGrade: groupsForGrade, studies: studies, makeExample: makeExample };
    return;
  }

  var mount = document.getElementById('key-guide');
  var i18n = root.I18n;
  var audio = root.PianoAudio;
  var selected = 'G';
  var groups = [];
  var study = studies[0];
  var currentExample;
  var playing = false;
  var audioFailed = false;
  var desktop = root.matchMedia('(min-width: 760px)');

  function el(id) { return document.getElementById(id); }
  function t(zh, en) { return i18n.t(zh, en); }
  function signatureLabel(fifths) {
    if (!fifths) return t('无升降号', 'No sharps or flats');
    var count = Math.abs(fifths);
    var sign = fifths > 0 ? 'sharp' : 'flat';
    return t(count + (fifths > 0 ? ' 个升号' : ' 个降号'), count + ' ' + sign + (count === 1 ? '' : 's'));
  }
  function groupFor(id) {
    return groups.find(function (group) {
      return (group.major && group.major.id === id) || (group.minor && group.minor.id === id);
    });
  }
  function element(tag, text) {
    var result = document.createElement(tag);
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function paragraphs(container, zh, en) {
    container.replaceChildren();
    function add(lang, value) {
      var p = element('p', value);
      p.lang = lang;
      container.append(p);
    }
    if (i18n.mode() !== 'en') add('zh-CN', zh);
    if (i18n.mode() !== 'zh') add('en', en);
  }

  function renderIndex() {
    el('guide-index-title').textContent = t('按调号选调', 'Browse by key signature');
    var header = el('guide-columns');
    header.replaceChildren();
    [t('调号', 'Signature'), t('大调', 'Major'), t('小调', 'Minor')].forEach(function (label) {
      var cell = element('th', label);
      cell.scope = 'col';
      header.append(cell);
    });
    var body = el('guide-keys');
    body.replaceChildren();
    groups.forEach(function (group) {
      var row = element('tr');
      var sign = group.fifths < 0 ? '♭' : '♯';
      var label = element('th', group.fifths ? Math.abs(group.fifths) + sign : '0');
      label.scope = 'row';
      label.setAttribute('aria-label', signatureLabel(group.fifths));
      row.append(label);
      ['major', 'minor'].forEach(function (mode) {
        var key = group[mode];
        var cell = element('td');
        if (key) {
          var button = element('button', noteName(generator.pitch(key, 0, 4)));
          button.type = 'button';
          button.dataset.key = key.id;
          button.setAttribute('aria-label', i18n.keyName(key.id));
          button.setAttribute('aria-controls', 'guide-detail');
          cell.append(button);
        }
        row.append(cell);
      });
      body.append(row);
    });
  }

  function drawScore() {
    var VF = root.Vex.Flow || root.Vex;
    var host = el('guide-score');
    host.replaceChildren();
    var renderer = new VF.Renderer(host, VF.Renderer.Backends.SVG);
    var width = 392;
    var height = 118;
    renderer.resize(width, height);
    var ctx = renderer.getContext();
    ctx.setFillStyle('currentColor');
    ctx.setStrokeStyle('currentColor');
    var measures = [new VF.Stave(6, 8, 231), new VF.Stave(237, 8, width - 245)];
    var clef = currentExample.clef;
    var meter = currentExample.meter;
    var meterParts = meter.split('/').map(Number);
    measures[0].addClef(clef).addKeySignature(selected).addTimeSignature(meter);
    measures[1].setEndBarType(VF.Barline.type.END);
    measures.forEach(function (stave, index) {
      stave.setContext(ctx).draw();
      var notes = currentExample.events.filter(function (event) { return event.bar === index; }).map(function (event) {
        var dotted = event.duration === 1.5;
        var duration = { 0.5: '8', 1: 'q', 1.5: 'q', 2: 'h' }[event.duration];
        var rest = !event.notes.length;
        var keys = rest ? [clef === 'bass' ? 'd/3' : 'b/4'] : [event.notes[0].key];
        var note = new VF.StaveNote({ keys: keys, clef: clef, duration: duration + (rest ? 'r' : ''), dots: dotted ? 1 : 0, auto_stem: true });
        if (dotted) VF.Dot.buildAndAttach([note], { all: true });
        return note;
      });
      var voice = new VF.Voice({ num_beats: meterParts[0], beat_value: meterParts[1] }).addTickables(notes);
      VF.Accidental.applyAccidentals([voice], selected);
      var beat = meter === '6/8' ? new VF.Fraction(3, 8) : new VF.Fraction(1, 4);
      var beams = VF.Beam.generateBeams(notes, { groups: [beat] });
      new VF.Formatter().joinVoices([voice]).formatToStave([voice], stave);
      voice.draw(ctx, stave);
      beams.forEach(function (beam) { beam.setContext(ctx).draw(); });
    });
    var svg = host.querySelector('svg');
    svg.style.removeProperty('width');
    svg.style.removeProperty('height');
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.setAttribute('role', 'img');
    var noteValues = { 0.5: ['八分', 'eighth'], 1: ['四分', 'quarter'], 1.5: ['附点四分', 'dotted quarter'], 2: ['二分', 'half'] };
    function description(lang) {
      var en = lang === 'en';
      var bars = study.bars.map(function (_, index) {
        return currentExample.events.filter(function (event) { return event.bar === index; }).map(function (event) {
          var value = noteValues[event.duration][en ? 1 : 0];
          if (!event.notes.length) return value + (en ? ' rest' : '休止符');
          return en ? noteName(event.notes[0]) + ' ' + value + ' note' : noteName(event.notes[0]) + ' ' + value + '音符';
        }).join(en ? ', ' : '、');
      });
      return (en ? meter + ' time. ' : meter.replace('/', '／') + '拍。') + bars.join(en ? '. ' : '。') + (en ? '.' : '。');
    }
    svg.setAttribute('aria-label', t(description('zh'), description('en')));
  }

  function updateAudio() {
    var button = el('guide-listen');
    button.textContent = playing ? t('停止试听', 'Stop') : t('听谱例', 'Listen');
    button.setAttribute('aria-pressed', String(playing));
    el('guide-audio-status').textContent = audioFailed ? t('声音未能启动，请再点一次试听。', 'Audio could not start. Tap Listen to try again.') : '';
  }
  function stop() { if (playing) audio.stop(); }
  function listen() {
    if (playing) { stop(); return; }
    audioFailed = false;
    if (audio.unlock()) {
      playing = true;
      var started = audio.playScore(currentExample, 1, null, function (_, reason) {
        playing = false;
        audioFailed = reason === 'nosound';
        updateAudio();
      });
      if (!started) { playing = false; audioFailed = true; }
    } else audioFailed = true;
    updateAudio();
  }

  function renderDetail() {
    var group = groupFor(selected);
    var key = group.major && group.major.id === selected ? group.major : group.minor;
    var minor = key.mode === 'minor';
    var names = Array.from({ length: 8 }, function (_, degree) { return noteName(generator.pitch(key, degree, 4)); });
    var marks = (group.fifths < 0 ? flats : sharps).slice(0, Math.abs(group.fifths));
    currentExample = makeExample(key, study);
    var tonic = names[0];
    var third = names[2];
    var other = minor ? group.major : group.minor;
    el('guide-selected').textContent = i18n.keyName(selected);
    el('guide-detail-title').textContent = i18n.keyName(selected);
    var compare = el('guide-compare');
    compare.hidden = !other;
    if (other) {
      compare.dataset.key = other.id;
      compare.textContent = t('对照' + i18n.keyName(other.id, 'zh'), 'Compare ' + i18n.keyName(other.id, 'en'));
    }
    el('guide-signature-label').textContent = t('调号', 'Key signature');
    el('guide-signature').textContent = marks.length ? signatureLabel(group.fifths) + '　' + marks.join('　') : signatureLabel(0);
    el('guide-scale-label').textContent = minor ? t('自然小调音阶', 'Natural minor scale') : t('大调音阶', 'Major scale');
    var scale = el('guide-scale');
    scale.replaceChildren();
    names.forEach(function (name) { scale.append(element('li', name)); });
    el('guide-example-title').textContent = t('两小节谱例', 'Read and listen');
    var leading = noteName(generator.pitch(key, -1, 4, true));
    if (minor && leading.length === 1) leading += '♮';
    var cues = {
      cadence: minor
        ? ['先唱 ' + tonic + ' 到 ' + third + ' 的小三度。第二小节把 ' + names[6] + ' 升高半音，听 ' + leading + ' 怎样回到主音 ' + tonic + '。',
          'Sing the minor third from ' + tonic + ' to ' + third + '. In bar two, raise ' + names[6] + ' by a semitone. Listen for ' + leading + ' resolving to the tonic, ' + tonic + '.']
        : ['先唱 ' + tonic + ' 到 ' + third + ' 的大三度。第二小节跟着唱 ' + leading + ' 到 ' + tonic + '，听旋律怎样向上半音落在主音上。',
          'Sing the major third from ' + tonic + ' to ' + third + '. In bar two, sing ' + leading + ' to ' + tonic + ' and hear the melody rise a semitone to the tonic.'],
      steps: ['先找旋律的最高音 ' + names[3] + '。右手从 ' + tonic + ' 逐级上行，到第二小节的第一拍转向，四个八分音符均匀下行。',
        'Find the highest note, ' + names[3] + '. Step up from ' + tonic + ' with your right hand. Turn on the downbeat of bar two and come down in four even eighth notes.'],
      triad: ['弹之前先找出 ' + tonic + '、' + third + '、' + names[4] + ' 三个音。第一小节向上分解主和弦，眼睛提前找到第二小节高八度的 ' + tonic + '。',
        'Locate ' + tonic + ', ' + third + ' and ' + names[4] + ' before playing. Trace the tonic triad upward in bar one. Look ahead to the upper ' + tonic + ' that starts bar two.'],
      bass: ['左手先找到低音谱表上的 ' + tonic + ' 和 ' + names[4] + '。第一小节每个音保持两拍，第二小节换成每拍一个音。',
        'Find ' + tonic + ' and ' + names[4] + ' on the bass staff with your left hand. Hold each note for two beats in bar one, then play one note per beat in bar two.'],
      compound: ['每小节轻打两下拍子。第一小节，前三个八分音符合成一拍，' + names[4] + ' 独占第二拍。照这个律动弹下一小节。',
        'Tap twice per bar. In bar one, fit the first three eighth notes into one pulse, then give ' + names[4] + ' the entire second pulse. Carry that lilt into bar two.'],
      rests: ['先数第一拍的休止，在第二拍弹 ' + tonic + '。第二小节的八分休止只有半拍，心里继续数，准时接上 ' + names[1] + '。',
        'Count through the opening rest and enter on ' + tonic + ' on beat two. In bar two the eighth rest lasts half a beat. Keep counting and come back in on ' + names[1] + '.']
    };
    paragraphs(el('guide-reading'), cues[study.id][0], cues[study.id][1]);
    el('guide-study-label').textContent = t('六条短句练习', 'Six short studies');
    el('guide-study').replaceChildren();
    studies.forEach(function (item) {
      el('guide-study').add(new Option(t(item.zh, item.en), item.id, false, item.id === study.id));
    });
    el('guide-next').setAttribute('aria-label', t('下一条短句练习', 'Next short study'));
    el('guide-practice').textContent = t('练这个调', 'Practise this key');
    el('guide-keys').querySelectorAll('button').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.key === selected));
    });
    updateAudio();
    drawScore();
  }

  function selectKey(id) {
    stop();
    audioFailed = false;
    selected = id;
    renderDetail();
    if (!desktop.matches && el('guide-index').open) {
      el('guide-index').open = false;
      el('guide-detail-title').focus({ preventScroll: true });
      el('guide-detail').scrollIntoView({ block: 'nearest' });
    }
  }

  function selectStudy(next) {
    stop();
    audioFailed = false;
    study = next;
    renderDetail();
  }

  function show() {
    groups = groupsForGrade(el('grade').value);
    if (!groupFor(selected)) selected = 'G';
    if (!mount.childElementCount) {
      mount.innerHTML = '<details class="guide-index panel" id="guide-index"><summary><strong id="guide-index-title"></strong><span id="guide-selected"></span></summary><table aria-labelledby="guide-index-title"><thead><tr id="guide-columns"></tr></thead><tbody id="guide-keys"></tbody></table></details>' +
        '<article class="panel guide-detail" id="guide-detail" aria-labelledby="guide-detail-title"><header><h2 id="guide-detail-title" tabindex="-1"></h2><button type="button" class="text-button" id="guide-compare"></button></header>' +
        '<dl class="guide-facts"><div><dt id="guide-signature-label"></dt><dd id="guide-signature"></dd></div><div><dt id="guide-scale-label"></dt><dd><ol id="guide-scale"></ol></dd></div></dl>' +
        '<label for="guide-study" id="guide-study-label"></label><div class="guide-study-controls"><select id="guide-study"></select><button id="guide-next" type="button" class="button small">→</button></div>' +
        '<figure class="guide-example"><figcaption><strong id="guide-example-title"></strong><button type="button" class="button small" id="guide-listen"></button></figcaption><div id="guide-score"></div></figure>' +
        '<p class="hint" id="guide-audio-status" role="status"></p><div id="guide-reading"></div><button type="button" class="button primary wide" id="guide-practice"></button></article>';
      el('guide-index').open = desktop.matches;
      desktop.addEventListener('change', function () { el('guide-index').open = desktop.matches; });
      el('guide-keys').addEventListener('click', function (event) {
        var button = event.target.closest('button[data-key]');
        if (button) selectKey(button.dataset.key);
      });
      el('guide-compare').onclick = function () { selectKey(this.dataset.key); };
      el('guide-study').onchange = function () { selectStudy(studies[this.selectedIndex]); };
      el('guide-next').onclick = function () { selectStudy(studies[(studies.indexOf(study) + 1) % studies.length]); };
      el('guide-listen').onclick = listen;
      el('guide-practice').onclick = function () {
        document.dispatchEvent(new CustomEvent('guide:practice', { detail: { keyId: selected } }));
      };
    }
    renderIndex();
    renderDetail();
  }

  document.addEventListener('languagechange:app', function () { if (mount.childElementCount) show(); });
  document.addEventListener('gradechange:app', function () {
    stop();
    audioFailed = false;
    if (mount.childElementCount) show();
  });
  root.SightKeyGuide = { show: show, stop: stop };
})(typeof window !== 'undefined' ? window : globalThis);
