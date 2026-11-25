(function (root) {
  'use strict';

  function midiTracker(notes) {
    var onsets = [];
    notes.forEach(function (note) {
      var onset = onsets[onsets.length - 1];
      if (!onset || Math.abs(onset.beat - note.onset) > 0.0001) {
        onset = { beat: note.onset, bar: note.bar, pitches: new Set() };
        onsets.push(onset);
      }
      onset.pitches.add(note.midi);
    });
    var next = 0;
    var misses = 0;
    return {
      seek: function (bar) {
        var index = onsets.findIndex(function (onset) { return onset.bar >= bar; });
        next = index < 0 ? onsets.length : index;
        misses = 0;
      },
      match: function (played) {
        var best = -1;
        var bestWeight = 0;
        // Prefer the next attack. A short lookahead allows omitted notes and uneven chords.
        var limit = Math.min(onsets.length, next + 3 + Math.min(misses, 5));
        for (var i = next; i < limit; i++) {
          var expected = onsets[i].pitches;
          var hits = 0;
          played.forEach(function (pitch) { if (expected.has(pitch)) hits++; });
          var weight = hits / played.size - (i - next) * 0.08;
          if (hits && weight > bestWeight) { best = i; bestWeight = weight; }
        }
        if (best < 0) { misses++; return null; }
        misses = 0;
        next = best + 1;
        return onsets[best].bar;
      }
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { midiTracker: midiTracker };
    return;
  }
  var mode = document.getElementById('follow-mode');
  var pause = document.getElementById('follow-pause');
  var host = document.getElementById('score');
  var session = document.getElementById('session');
  var phone = root.matchMedia('(max-width: 700px), (max-width: 1000px) and (max-height: 550px)');
  var preference;
  try { preference = root.localStorage.getItem('sight-follow-mode'); } catch (error) {}
  function applyPreference() {
    mode.value = preference === 'off' || preference === 'auto' ? preference : phone.matches ? 'auto' : 'off';
  }
  applyPreference();
  phone.addEventListener('change', applyPreference);
  mode.addEventListener('change', function () {
    preference = mode.value;
    try { root.localStorage.setItem('sight-follow-mode', preference); } catch (error) {}
    if (preference === 'off') stop();
  });

  var demoStop = document.createElement('button');
  demoStop.type = 'button';
  demoStop.id = 'follow-demo-stop';
  demoStop.className = 'button';
  demoStop.hidden = true;
  demoStop.onclick = function () { document.getElementById('demo').click(); };
  document.body.append(demoStop);
  var run = null;
  var marked = null;
  var timer;
  var chordTimer;
  var chord = new Set();
  var chordTime = 0;
  var screenWanted = false;
  var requestingScreen = false;
  var screenLock = null;

  async function prepare() {
    if (mode.value !== 'auto' || document.hidden) return;
    screenWanted = true;
    if (!navigator.wakeLock || screenLock || requestingScreen) return;
    requestingScreen = true;
    try {
      var lock = await navigator.wakeLock.request('screen');
      if (!screenWanted || document.hidden) {
        lock.release().catch(function () {});
        return;
      }
      screenLock = lock;
      lock.addEventListener('release', function () { if (screenLock === lock) screenLock = null; }, { once: true });
    } catch (error) {} finally { requestingScreen = false; }
  }
  function releaseScreen() {
    screenWanted = false;
    if (screenLock) screenLock.release().catch(function () {});
    screenLock = null;
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) releaseScreen(); });

  function labels() {
    var paused = run && run.paused;
    pause.textContent = paused ? I18n.t('继续翻谱', 'Resume turns') : I18n.t('暂停翻谱', 'Pause turns');
    pause.setAttribute('aria-pressed', String(!!paused));
    demoStop.textContent = I18n.t('停止示范', 'Stop demo');
  }
  document.addEventListener('languagechange:app', labels);
  labels();

  function topInset() {
    return session.hidden ? 10 : Math.ceil(session.getBoundingClientRect().height) + 14;
  }
  function reveal(bar, force) {
    if (!run) return;
    var element = document.getElementById('bar-' + bar);
    if (!element) return;
    if (!force && marked === element) return;
    run.bar = bar;
    if (marked) marked.classList.remove('follow-current');
    marked = element;
    marked.classList.add('follow-current');
    var rect = element.getBoundingClientRect();
    var inset = topInset();
    var following = element.nextElementSibling;
    var bottom = root.innerHeight - (demoStop.hidden ? 8 : demoStop.offsetHeight + 18);
    var nextFits = !following || following.getBoundingClientRect().bottom <= bottom;
    if (force || rect.top < inset - 1 || rect.bottom > bottom || !nextFits) {
      root.scrollTo({ top: root.scrollY + rect.top - inset, behavior: 'instant' });
    }
  }
  function stop() {
    releaseScreen();
    clearTimeout(timer);
    clearTimeout(chordTimer);
    chord.clear();
    if (marked) marked.classList.remove('follow-current');
    marked = null;
    run = null;
    pause.hidden = true;
    demoStop.hidden = true;
    document.documentElement.classList.remove('following-score');
  }
  function nextTurn() {
    if (!run || run.paused || !run.times) return;
    var elapsed = performance.now() - run.origin;
    var bar = run.bar;
    while (bar + 1 < run.times.length && run.times[bar + 1] <= elapsed) bar++;
    reveal(bar, false);
    if (bar + 1 < run.times.length) timer = setTimeout(nextTurn, Math.max(1, run.times[bar + 1] - elapsed));
  }
  function start(score, speed, source) {
    if (run || mode.value !== 'auto') stop();
    if (mode.value !== 'auto') return;
    prepare();
    run = { bar: 0, source: source, paused: false, origin: performance.now() };
    if (source === 'midi') run.midi = midiTracker(score.playbackNotes);
    else if (source !== 'demo') {
      run.times = score.barStarts.map(function (beat) {
        return SightTiming.beatsAt(score, beat) * 60000 / (score.bpm * speed);
      });
    }
    pause.hidden = source === 'demo';
    demoStop.hidden = source !== 'demo';
    document.documentElement.classList.add('following-score');
    labels();
    reveal(0, true);
    nextTurn();
  }
  function flushChord() {
    clearTimeout(chordTimer);
    if (run && run.midi && !run.paused && chord.size) {
      var bar = run.midi.match(chord);
      if (bar !== null) reveal(bar, false);
    }
    chord.clear();
  }
  function midiNote(pitch, time) {
    if (!run || !run.midi || run.paused) return;
    if (chord.size && time - chordTime >= 55) flushChord();
    if (!chord.size) {
      chordTime = time;
      chordTimer = setTimeout(flushChord, 55);
    }
    chord.add(pitch);
  }
  pause.onclick = function () {
    if (!run) return;
    var now = performance.now();
    if (!run.paused) {
      clearTimeout(timer);
      flushChord();
      run.paused = true;
      run.pausedAt = now;
      run.pausedScroll = root.scrollY;
    } else {
      run.paused = false;
      run.origin += now - run.pausedAt;
      if (Math.abs(root.scrollY - run.pausedScroll) > 50) {
        var inset = topInset();
        var visible = Array.from(host.children).find(function (bar) {
          return bar.getBoundingClientRect().bottom > inset + 20;
        });
        if (visible) {
          run.bar = Number(visible.dataset.bar);
          if (run.midi) run.midi.seek(run.bar);
          if (run.times) run.origin = now - run.times[run.bar];
        }
      }
      reveal(run.bar, true);
      nextTurn();
    }
    labels();
  };
  function restoreBar() {
    if (!run) return;
    reveal(run.bar, true);
    if (run.paused) run.pausedScroll = root.scrollY;
  }
  new MutationObserver(function () {
    if (!marked || !marked.isConnected) restoreBar();
  }).observe(host, { childList: true });
  root.addEventListener('resize', restoreBar);
  if (root.ResizeObserver) new ResizeObserver(restoreBar).observe(host);

  root.SightFollow = {
    prepare: prepare,
    start: start,
    stop: stop,
    midiNote: midiNote,
    demoStart: function (score) { start(score, 1, 'demo'); },
    demoNote: function (note) { if (run && run.source === 'demo') reveal(note.bar, false); }
  };
})(typeof window === 'undefined' ? globalThis : window);
