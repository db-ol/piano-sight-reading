(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = { view: 'practice', phase: 'idle', score: null, result: null, recording: null, source: null, attempt: null, token: 0, timer: null, started: 0, speed: 1 };
  var english = SightMessages.english;
  var messages = new Map();
  function translated(zh, en) { return I18n.t(zh, en === undefined ? english(zh) : en); }
  function errorMessage(error, fallback) {
    return error && error.message && english(error.message) !== error.message ? error.message : fallback;
  }
  function setMessage(id, zh, en) {
    messages.set(id, [zh, en]);
    $(id).textContent = translated(zh, en);
  }
  function localize(build) {
    return I18n.t(build('zh'), build('en'));
  }
  function joinSentences(parts, lang) {
    return parts.filter(Boolean).map(function (part) { return lang === 'en' ? english(part) : part; }).join(lang === 'en' ? ' ' : '');
  }
  var toastTimer;
  function toast(message) { setMessage('toast', message); clearTimeout(toastTimer); toastTimer = setTimeout(function () { messages.delete('toast'); $('toast').textContent = ''; }, 5500); }
  function safePreference(key, value) { try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) {} }
  function theme(value) {
    document.documentElement.dataset.theme = value;
    themeLabel(value);
    SightScore.redraw();
  }
  function themeLabel(value) {
    var label = translated(value === 'dark' ? '切换浅色模式' : '切换深色模式');
    $('theme').setAttribute('aria-label', label);
    $('theme').title = label;
  }
  var mediaTheme = matchMedia('(prefers-color-scheme: dark)');
  theme(safePreference('sight-theme') || (mediaTheme.matches ? 'dark' : 'light'));
  mediaTheme.addEventListener('change', function () { if (!safePreference('sight-theme')) theme(mediaTheme.matches ? 'dark' : 'light'); });
  $('theme').onclick = function () { var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; safePreference('sight-theme', next); theme(next); };

  var savedGrade = safePreference('sight-grade');
  if (savedGrade === '7' || savedGrade === '8') $('grade').value = savedGrade;
  function gradeOptions() {
    var grade = $('grade').value;
    var previousKey = $('key').value, previousMeter = $('meter').value;
    $('key').options.length = 1;
    $('meter').options.length = 1;
    var keys = SightGenerator.keysForGrade(grade);
    var meters = SightGenerator.metersForGrade(grade);
    keys.forEach(function (key) { $('key').add(new Option(I18n.keyName(key.id), key.id)); });
    meters.forEach(function (meter) { $('meter').add(new Option(meter, meter)); });
    if (keys.some(function (key) { return key.id === previousKey; })) $('key').value = previousKey;
    if (meters.includes(previousMeter)) $('meter').value = previousMeter;
  }
  gradeOptions();
  $('grade').onchange = function () {
    gradeOptions();
    settingsSummary();
    safePreference('sight-grade', $('grade').value);
    if ($('workspace').hidden) state.score = null;
    else newPiece();
    document.dispatchEvent(new CustomEvent('gradechange:app', { detail: { grade: $('grade').value } }));
  };
  var caps = SightInput.capabilities();
  if (!caps.microphone) { $('source').value = 'self'; $('source').querySelector('[value="microphone"]').disabled = true; }
  if (!caps.midi) $('source').querySelector('[value="midi"]').disabled = true;
  function inputHint() {
    var value = $('source').value;
    var hint = value === 'midi' ? '连接电钢琴后点击开始。直接记录按键事件，不录制声音。' : value === 'self' ? '不申请麦克风权限。弹完后按拍子、音高和音乐细节做自评。' : '录音只在本机处理。自动识别为实验功能，需要回听核对。';
    var midiNotice = value === 'microphone' && !caps.midi ? '当前浏览器不支持 MIDI 直连。' : '';
    setMessage('input-hint', joinSentences([hint, midiNotice], 'zh'), joinSentences([hint, midiNotice], 'en'));
    updateControls();
  }
  $('source').onchange = inputHint;
  function settingsSummary() {
    $('settings-summary').textContent = $('difficulty').selectedOptions[0].text + ' · ' + $('key').selectedOptions[0].text;
  }
  ['difficulty', 'key', 'meter'].forEach(function (id) { $(id).onchange = settingsSummary; });
  function setDemoLabel(playing) {
    var label = playing ? '停止示范' : '听示范';
    $('demo').textContent = (playing ? '□ ' : '▷ ') + translated(label);
  }
  function stopSound() {
    if (state.view === 'guide') SightKeyGuide.stop();
    PianoAudio.stop(); PianoAudio.stopMetronome(); SightScore.highlight(null);
    setDemoLabel(false);
    setMessage('metronome', '节拍器');
    $('metronome').setAttribute('aria-pressed', 'false');
  }
  PianoAudio.onReset(function () { stopSound(); });
  function newPiece() {
    stopSound();
    state.result = null;
    state.recording = null;
    state.attempt = null;
    $('recording-audio').pause(); $('recording-audio').removeAttribute('src');
    $('feedback').hidden = true;
    var seed = crypto.getRandomValues(new Uint32Array(1))[0];
    var grade = $('grade').value;
    var keys = SightGenerator.keysForGrade(grade);
    var meters = SightGenerator.metersForGrade(grade);
    var selectedKey = $('key').value === 'random' ? keys[(seed >>> 8) % keys.length].id : $('key').value;
    var selectedMeter = $('meter').value === 'random' ? meters[(seed >>> 16) % meters.length] : $('meter').value;
    state.score = SightGenerator.generate({ grade: grade, seed: seed, key: selectedKey, meter: selectedMeter, difficulty: $('difficulty').value });
    pieceHeading();
    SightScore.render($('score'), state.score);
  }
  function pieceHeading() {
    var score = state.score;
    if (!score) return;
    $('piece-number').textContent = translated('原创练习') + ' · ' + String(score.seed).slice(-6);
    $('piece-title').textContent = translated(score.title);
    $('piece-meta').textContent = [gradeName(score.grade), I18n.keyName(score.key), score.meter, translated(score.bars + '小节', score.bars + ' bars'), '♩ = ' + score.bpm].join(' · ');
  }
  function gradeName(grade) {
    var options = Array.from($('grade').options);
    var option = options.find(function (item) { return item.value === String(grade); });
    return (option || options[0]).textContent;
  }
  function startLabel() {
    switch (state.phase) {
      case 'recording': return '结束这一遍';
      case 'analyzing': return '正在分析录音…';
      case 'setup': return '正在准备输入…';
    }
    if (state.view === 'exam') return '开始模拟考试';
    if ($('source').value === 'self') return $('follow-mode').value === 'auto' ? '不录音跟谱' : '开始自由练习';
    return $('source').value === 'midi' ? '连接并记录弹奏' : '录下这一遍';
  }
  function updateControls() {
    var busy = state.phase !== 'idle';
    ['new-piece', 'grade', 'difficulty', 'key', 'meter', 'source', 'speed', 'follow-mode'].forEach(function (id) { $(id).disabled = busy; });
    $('demo').disabled = busy;
    $('metronome').disabled = busy;
    $('analyze').disabled = busy;
    $('practice-tools').hidden = state.view === 'exam';
    $('session').hidden = !['preparing', 'recording', 'setup'].includes(state.phase);
    $('input-level').hidden = state.source !== 'microphone';
    $('start').disabled = state.phase === 'setup' || state.phase === 'preparing' || state.phase === 'analyzing';
    $('start-follow').hidden = busy || $('follow-mode').value !== 'auto' || $('source').value === 'self';
    setMessage('start', startLabel());
    document.querySelectorAll('.tabbar button').forEach(function (button) { button.disabled = busy; });
  }
  function showView(view, fresh) {
    stopSound();
    state.view = view;
    $('workspace').hidden = view !== 'practice' && view !== 'exam';
    $('guide-view').hidden = view !== 'guide';
    $(view === 'guide' ? 'guide-heading' : 'practice-heading').append($('grade-picker'));
    $(view === 'exam' ? 'practice-fields' : 'practice-tools').append($('tempo-control'));
    if (view === 'guide') { $('recording-audio').pause(); SightKeyGuide.show(); }
    $('history-view').hidden = view !== 'history';
    $('about-view').hidden = view !== 'about';
    $('exam-intro').hidden = view !== 'exam';
    setMessage('view-title', view === 'exam' ? '给自己一次真实的开始。' : '每天一首，稳稳向前。');
    document.querySelectorAll('.tabbar button').forEach(function (button) {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    updateControls();
    if (view === 'history') renderHistory();
    if (view === 'practice' || view === 'exam') {
      if (fresh || !state.score) newPiece();
      else SightScore.redraw();
    }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabbar button').forEach(function (button) { button.onclick = function () { showView(button.dataset.view); }; });
  document.addEventListener('guide:practice', function (event) {
    var keyId = event.detail && event.detail.keyId;
    if (state.phase !== 'idle' || !SightGenerator.keysForGrade($('grade').value).some(function (key) { return key.id === keyId; })) return;
    $('key').value = keyId;
    settingsSummary();
    showView('practice', true);
  });
  $('new-piece').onclick = newPiece;
  $('focus-score').onclick = function () {
    var enabled = document.body.classList.toggle('focus-mode');
    setMessage('focus-score', enabled ? '退出专注' : '专注看谱');
    SightScore.redraw();
    if (enabled) $('score').scrollIntoView({ block: 'start' });
  };
  $('demo').onclick = function () {
    if (PianoAudio.isPlaying()) { stopSound(); return; }
    stopSound();
    if (!PianoAudio.unlock()) { toast('当前设备无法播放示范，请检查浏览器与声音设置。'); return; }
    setDemoLabel(true);
    SightFollow.demoStart(state.score);
    PianoAudio.playScore(state.score, Number($('speed').value), function (note) {
      SightScore.highlight(note);
      SightFollow.demoNote(note);
    }, function (_, reason) {
      SightFollow.stop();
      setDemoLabel(false); SightScore.highlight(null);
      if (reason === 'nosound') toast('声音未能启动，请再次点击听示范。');
    });
  };
  $('metronome').onclick = function () {
    var wasOn = PianoAudio.metronomeOn();
    stopSound();
    if (wasOn) return;
    if (!PianoAudio.unlock()) { toast('当前设备无法启动声音。'); return; }
    PianoAudio.metronome(state.score.bpm * Number($('speed').value), SightGenerator.beatGroups(state.score.meter), function () { stopSound(); toast('节拍器未能启动，请再次点击。'); });
    setMessage('metronome', '停止节拍器'); $('metronome').setAttribute('aria-pressed', 'true');
  };
  $('speed').onchange = stopSound;

  function settingsDescription(settings, lang) {
    var en = lang === 'en';
    function flag(key) {
      if (settings[key] === false) return en ? 'off' : '关';
      if (settings[key] === true) return en ? 'on' : '开';
      return en ? 'unreported' : '未报告';
    }
    var rate = settings.contextSampleRate ? settings.contextSampleRate + ' Hz' : en ? 'unreported' : '未报告';
    return en ? 'Sample rate ' + rate + '. Echo cancellation ' + flag('echoCancellation') + ', noise suppression ' + flag('noiseSuppression') + ', automatic gain ' + flag('autoGainControl') + '.'
      : '处理采样率 ' + rate + '。回声消除' + flag('echoCancellation') + '，降噪' + flag('noiseSuppression') + '，自动增益' + flag('autoGainControl') + '。';
  }
  async function cancelSession(message) {
    SightFollow.stop();
    state.token++;
    clearInterval(state.timer);
    state.phase = 'idle';
    SightTranscribe.cancel();
    await SightInput.dispose();
    state.recording = null;
    $('recording-audio').pause(); $('recording-audio').removeAttribute('src');
    $('download-recording').removeAttribute('href');
    updateControls();
    if (message) toast(message);
  }
  function interrupted(message) {
    if (['setup', 'preparing', 'recording'].includes(state.phase)) cancelSession(message || '输入已中断，本次不生成反馈。请重新开始。');
  }
  async function startSession(selfOnly) {
    if (state.phase === 'recording') { await finishSession(); return; }
    if (state.phase !== 'idle') return;
    stopSound();
    $('recording-audio').pause();
    $('feedback').hidden = true;
    $('settings').open = false;
    state.phase = 'setup';
    state.source = selfOnly === true ? 'self' : $('source').value;
    state.speed = Number($('speed').value);
    var mine = ++state.token;
    setMessage('phase', '准备输入'); $('clock').textContent = '…';
    setMessage('session-hint', '请允许麦克风或 MIDI 权限。');
    setMessage('session-stop', '取消');
    updateControls();
    try {
      if (state.source === 'microphone') {
        var settings = await SightInput.openMic({ onInterrupted: interrupted, onLimit: finishSession, onLevel: function (level) { if (mine === state.token) $('input-level').value = level; } });
        if (mine !== state.token) return;
        setMessage('input-hint', settingsDescription(settings, 'zh'), settingsDescription(settings, 'en'));
      } else if (state.source === 'midi') {
        var devices = await SightInput.connectMIDI({ onInterrupted: interrupted, onNote: SightFollow.midiNote });
        if (!devices.connected) throw new Error('尚未发现 MIDI 键盘，请连接电钢琴后重试。');
      }
      if (mine !== state.token) return;
      if (state.view === 'exam') newPiece();
      state.result = null;
      state.recording = null;
      state.attempt = { id: Date.now() + '-' + mine, date: new Date().toISOString(), grade: state.score.grade || '5', key: state.score.key, meter: state.score.meter, difficulty: state.score.difficulty, seed: state.score.seed, source: state.source, mode: state.view, summary: {} };
      $('feedback').hidden = true;
      ['review-pulse', 'review-pitch', 'review-expression'].forEach(function (id) { $(id).checked = false; });
      $('save-review').disabled = false; setMessage('save-review', '保存本次自评');
      SightScore.render($('score'), state.score);
      if (state.view === 'exam') {
        state.phase = 'preparing';
        SightFollow.prepare();
        var deadline = performance.now() + 30000;
        setMessage('phase', '准备读谱'); $('clock').textContent = '30';
        setMessage('session-hint', '可以试弹部分或全部，准备音不会计入反馈。');
        state.timer = setInterval(function () {
          var remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
          $('clock').textContent = remaining;
          if (!remaining) { clearInterval(state.timer); beginPerformance(); }
        }, 100);
        updateControls(); $('session').scrollIntoView({ block: 'start' });
      } else beginPerformance();
    } catch (error) {
      if (mine === state.token) await cancelSession(errorMessage(error, '输入启动失败，请检查权限后重试。'));
    }
  }
  function beginPerformance() {
    try {
      if (state.source === 'microphone') SightInput.start();
      if (state.source === 'midi') SightInput.startMIDI();
      state.phase = 'recording'; state.started = performance.now();
      setMessage('phase', '请开始演奏'); $('clock').textContent = '0:00';
      var hints = ['保持连贯，弹完后点结束。', state.source !== 'self' && '单次记录最长三分钟。'];
      setMessage('session-hint', joinSentences(hints, 'zh'), joinSentences(hints, 'en')); setMessage('session-stop', '结束');
      if (state.source === 'self' && state.view === 'practice') $('clock').textContent = translated('自由');
      else state.timer = setInterval(function () {
        var seconds = Math.floor((performance.now() - state.started) / 1000);
        $('clock').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
        if (seconds >= 180 && state.source !== 'self') finishSession();
      }, 250);
      updateControls();
      SightFollow.start(state.score, state.speed, state.source);
    } catch (error) { cancelSession(errorMessage(error, '输入启动失败，请检查权限后重试。')); }
  }
  async function finishSession() {
    if (state.phase !== 'recording') return;
    SightFollow.stop();
    clearInterval(state.timer);
    state.phase = 'setup'; updateControls();
    var mine = state.token;
    try {
      var recording;
      if (state.source === 'microphone') recording = await SightInput.stop();
      else if (state.source === 'midi') recording = SightInput.stopMIDI();
      if (mine !== state.token) return;
      state.recording = recording;
      state.phase = 'idle'; updateControls();
      showFeedbackBase();
      if (state.source === 'microphone' && state.recording) {
        $('recording-audio').src = state.recording.url;
        $('download-recording').href = state.recording.url;
        $('recording-player').hidden = false;
        $('analysis-actions').hidden = false;
        await analyzeRecording();
      } else if (state.source === 'midi') processNotes(state.recording.notes, 'midi');
      else {
        setMessage('result-summary', '这一遍已经结束。回想拍子是否稳定，是否保持连贯，再记录自评。');
        setMessage('uncertainty', '本次没有采集音符，不会自动判断对错。');
      }
    } catch (error) { if (mine === state.token) { state.phase = 'idle'; updateControls(); toast(errorMessage(error, '无法完成本次录音。')); } }
  }
  function showFeedbackBase() {
    $('feedback').hidden = false;
    setMessage('result-summary', '已记录这一遍，正在准备反馈。');
    setMessage('uncertainty', '练习参考，不是官方评分。');
    $('result-stats').replaceChildren(); $('issues').replaceChildren();
    $('recording-player').hidden = true; $('analysis-actions').hidden = true;
    $('feedback').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  async function analyzeRecording() {
    if (!state.recording || state.phase !== 'idle') return;
    state.phase = 'analyzing'; updateControls();
    $('analyze').disabled = true; $('cancel-analysis').hidden = false; $('analysis-progress').hidden = false;
    var mine = state.token;
    setMessage('uncertainty', '实验识别，在本机处理。结果需要结合回听核对。');
    try {
      var result = await SightTranscribe.transcribe(state.recording, function (fraction, phase) {
        if (mine !== state.token) return;
        $('analysis-progress').value = fraction;
        var action = phase === 'loading' ? '正在加载本机识别模型' : '正在分析双手与和弦';
        var percent = Math.round(fraction * 100);
        setMessage('analysis-status', action + '，' + percent + '％。请保持页面在前台。', english(action) + ', ' + percent + '%. Keep this page open.');
      });
      if (mine !== state.token) return;
      processNotes(result.notes, 'microphone');
      setMessage('analysis-status', !result.notes.length ? '分析完成，未取得可定位的音符，请回听自评。' : state.result && state.result.alignmentReliable === false ? '分析完成，但无法可靠对齐，请回听自评。' : '分析完成。彩色标记是疑似位置，回听后再决定是否需要重练。');
    } catch (error) {
      if (mine === state.token) {
        setMessage('result-summary', '这段录音可以回听和自评。');
        setMessage('analysis-status', errorMessage(error, '自动分析失败，请回听自评。'));
      }
    } finally {
      if (mine === state.token) {
        state.phase = 'idle'; updateControls(); $('analyze').disabled = false;
        $('cancel-analysis').hidden = true; $('analysis-progress').hidden = true;
      }
    }
  }
  function pitchName(midi) {
    if (midi === null || midi === undefined) return '？';
    return ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
  }
  function processNotes(notes, source) {
    state.result = null;
    $('result-stats').replaceChildren(); $('issues').replaceChildren();
    if (!notes.length) {
      setMessage('result-summary', '没有取得可分析的音符。请检查输入音量、连接和麦克风位置，或回听后自评。');
      setMessage('uncertainty', '没有输入不代表全部弹错，本次不生成错音统计。');
      return;
    }
    var expected = Object.assign({}, state.score, { bpm: state.score.bpm * state.speed });
    var result = SightAlignment.analyze(expected, notes, { source: source });
    state.result = result;
    if (result.alignmentReliable === false) {
      setMessage('result-summary', '暂时无法可靠定位，请先核对选曲和输入。');
      setMessage('uncertainty', '检测音符与谱面的重合太少，本次不把位置或错误统计当作可靠结论。请回听后自评。');
      SightScore.render($('score'), state.score);
      return;
    }
    renderDetails(result, source);
    var s = result.summary;
    var mic = source === 'microphone';
    var pauses = mic ? s.suspectedPauses : s.pauses;
    var timing = mic ? s.suspectedRhythm : s.rhythm;
    function summary(lang) {
      var tempo = Math.round(s.tempoBpm);
      return joinSentences([
        mic && '以下是待核对的识别线索。',
        tempo && (lang === 'en' ? 'Estimated tempo is ' + tempo + ' quarter notes per minute.' : '估计速度约为每分钟' + tempo + '个四分音符。'),
        pauses ? '先挑出停顿处慢练，再试着保持拍子连贯地向前。' : timing ? '可以重点练习标出的起音间隔，先保持均匀的拍子。' : '本次未发现明显的局部节奏偏差，继续留意力度和乐句。',
        s.tempoRatio && s.tempoRatio < 0.85 && '整体速度偏慢与节奏不稳是两回事，可以先求连贯。'
      ], lang);
    }
    setMessage('result-summary', summary('zh'), summary('en'));
    var caveats = [mic ? '麦克风转录可能把泛音、踏板和混响当成音符，也可能漏掉和弦里的弱音。所有标记都是疑似，不是确定错误。' : '根据 MIDI 按键事件分析音高与起音。音色、乐句、力度处理不在自动评分范围内。'];
    caveats = caveats.concat(result.limitations.filter(function (text) { return text.includes('重复同音') || text.includes('渐慢'); }));
    setMessage('uncertainty', joinSentences(caveats, 'zh'), joinSentences(caveats, 'en'));
    SightScore.render($('score'), state.score, result);
    state.attempt.summary = s;
    state.attempt.kind = 'analysis';
    saveAttempt();
  }
  function renderDetails(result, source) {
    var s = result.summary;
    var mic = source === 'microphone';
    var counts = mic ? [s.suspectedWrong, s.suspectedMissing, s.suspectedExtra, s.suspectedRhythm, s.suspectedPauses, s.uncertain] : [s.wrong, s.missing, s.extra, s.rhythm, s.pauses, s.correct];
    var labels = ['错音', '漏音', '多弹', '节奏处', '停顿处', mic ? '待核对音' : '音高正确'];
    $('result-stats').replaceChildren();
    labels.forEach(function (label, index) {
      var box = document.createElement('div'); box.className = 'stat';
      var value = document.createElement('strong'); value.textContent = counts[index];
      var name = document.createElement('span');
      name.textContent = mic && index < 5 ? translated('疑似' + label, 'Possible ' + english(label).toLowerCase()) : translated(label);
      box.append(value, name); $('result-stats').append(box);
    });
    $('issues').replaceChildren();
    result.notes.forEach(function (n) {
      var zh = [], en = [];
      var pitch = pitchName(n.midi);
      if (n.pitchStatus === 'wrong') {
        zh.push('谱面' + pitch + '，检测到' + pitchName(n.actualMidi));
        en.push('expected ' + pitch + ', detected ' + pitchName(n.actualMidi));
      }
      if (n.pitchStatus === 'missing') { zh.push('未检测到' + pitch); en.push('missing ' + pitch); }
      if (n.rhythm) { zh.push('起音间隔偏差'); en.push('uneven timing'); }
      if (n.pause) { zh.push('出现额外等待'); en.push('extra pause'); }
      if (zh.length) issue(n.bar, (mic ? '待核对，' : '') + (n.hand === 'left' ? '左手，' : '右手，') + zh.join('，'),
        (mic ? 'check ' : '') + (n.hand === 'left' ? 'left hand, ' : 'right hand, ') + en.join(', '));
    });
    result.extras.forEach(function (n) { issue(n.bar, (mic ? '疑似多弹' : '多弹') + pitchName(n.midi), (mic ? 'possible extra ' : 'extra ') + pitchName(n.midi)); });
    if (!$('issues').childElementCount) {
      var li = document.createElement('li');
      li.textContent = translated('未发现需要定位的异常。自动分析不能代替听觉判断。');
      $('issues').append(li);
    }
  }
  function issue(bar, zh, en) {
    var li = document.createElement('li');
    var button = document.createElement('button');
    var number = (bar || 0) + 1;
    button.textContent = translated('第' + number + '小节，' + zh, 'Bar ' + number + ', ' + en);
    button.onclick = function () { var element = $('bar-' + (bar || 0)); if (element) element.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    li.append(button); $('issues').append(li);
  }
  function saveAttempt() {
    var saved = SightStorage.save(state.attempt);
    if (!saved) toast('本机存储不可用，本次结果未保存。可以先保存录音。');
    return saved;
  }
  $('save-review').onclick = function () {
    if (!state.attempt) return;
    state.attempt.review = { pulse: $('review-pulse').checked, pitch: $('review-pitch').checked, expression: $('review-expression').checked };
    if (!state.attempt.kind) state.attempt.kind = 'self';
    if (saveAttempt()) { $('save-review').disabled = true; setMessage('save-review', '已保存本次自评'); toast('已保存到本机练习记录。'); }
  };
  $('start').onclick = startSession;
  $('start-follow').onclick = function () { startSession(true); };
  $('follow-mode').addEventListener('change', updateControls);
  $('session-stop').onclick = function () { if (state.phase === 'recording') finishSession(); else cancelSession('已取消本次准备。'); };
  $('analyze').onclick = analyzeRecording;
  $('cancel-analysis').onclick = function () { SightTranscribe.cancel(); setMessage('analysis-status', '正在取消，请稍候。'); };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      if (['setup', 'preparing', 'recording'].includes(state.phase)) interrupted('页面进入后台，本次已停止。返回后请重新开始。');
      if (state.phase === 'analyzing') SightTranscribe.cancel();
    }
  });
  function renderHistory() {
    var records = SightStorage.read();
    var verified = records.filter(function (r) { return r.source === 'midi' && r.kind === 'analysis'; });
    var micCount = records.filter(function (r) { return r.source === 'microphone'; }).length;
    var totals = { wrong: 0, missing: 0, extra: 0, rhythm: 0, pauses: 0 };
    verified.forEach(function (r) { Object.keys(totals).forEach(function (key) { totals[key] += Number(r.summary[key]) || 0; }); });
    var names = { wrong: ['错音', 'wrong notes'], missing: ['漏音', 'missing notes'], extra: ['多弹', 'extra notes'], rhythm: ['局部节奏', 'timing'], pauses: ['停顿', 'pauses'] };
    var common = Object.keys(totals).filter(function (key) { return totals[key] > 0; }).sort(function (a, b) { return totals[b] - totals[a]; });
    var reviews = records.filter(function (record) { return record.review; });
    var categories = { pulse: ['拍子与连贯性', 'pulse and continuity'], pitch: ['音高与节奏', 'pitch and rhythm'], expression: ['音乐细节', 'expression'] };
    var needs = Object.keys(categories).map(function (key) {
      return { label: categories[key], count: reviews.filter(function (r) { return !r.review[key]; }).length };
    }).filter(function (item) { return item.count; }).sort(function (a, b) { return b.count - a.count; });
    $('history-summary').textContent = localize(function (lang) {
      var en = lang === 'en';
      if (!records.length) return en ? 'Play a piece and save your first review to start your history.' : '还没有练习记录。完整弹一遍，再留下第一次自评。';
      var lines = [en ? 'You have saved ' + records.length + (records.length === 1 ? ' practice session.' : ' practice sessions.') : '已记录' + records.length + '次练习。'];
      if (common.length) {
        var issues = common.map(function (key) { return en ? names[key][1] + ' (' + totals[key] + ')' : names[key][0] + '（' + totals[key] + '）'; });
        lines.push(en ? 'Frequent MIDI findings include ' + issues.join(', ') + '.' : 'MIDI 反馈中较常见的是' + issues.join('、') + '。');
      }
      if (micCount) lines.push(en ? 'Microphone takes (' + micCount + ') are reviewed separately because note detection is experimental.' : '麦克风记录共' + micCount + '次，疑似错误不并入确定弱项。');
      if (needs.length) {
        var areas = needs.map(function (item) { return en ? item.label[1] + ' (' + item.count + ')' : item.label[0] + '（' + item.count + '次）'; });
        lines.push(en ? 'Your reviews suggest practising ' + areas.join(', ') + '.' : '自评中需要加强的是' + areas.join('、') + '。');
      } else if (reviews.length) lines.push(en ? 'You met all your self review goals. Keep listening for the shape of each phrase.' : '你记录的自评中，各项都已做到。继续留意音乐走向。');
      return lines.join(en ? ' ' : '');
    });
    $('history-list').replaceChildren();
    records.forEach(function (record) {
      var article = document.createElement('article'); article.className = 'history-item';
      var content = document.createElement('div'); var title = document.createElement('h3');
      var key = SightGenerator.ALL_KEYS.find(function (k) { return k.id === record.key || k.label === record.key; });
      var difficulty = SightGenerator.DIFFICULTIES.find(function (d) { return d.id === record.difficulty || d.label === record.difficulty; });
      var option = difficulty && $('difficulty').querySelector('[value="' + difficulty.id + '"]');
      title.textContent = [gradeName(record.grade), key ? I18n.keyName(key.id) : record.key, record.meter, option ? option.textContent : record.difficulty].join(' · ');
      var description = document.createElement('p');
      description.textContent = localize(function (lang) {
        var en = lang === 'en';
        var mic = record.source === 'microphone';
        var lines = [];
        if (record.kind === 'self') lines.push(en ? 'Self review' : '自评记录');
        else lines.push(mic ? (en ? 'Experimental microphone feedback' : '麦克风实验识别，待核对') : (en ? 'MIDI feedback' : 'MIDI 按键反馈'));
        if (record.kind === 'analysis') {
          var wrong = mic ? record.summary.suspectedWrong : record.summary.wrong;
          var pauses = mic ? record.summary.suspectedPauses : record.summary.pauses;
          lines.push(en ? (mic ? 'Possible ' : '') + 'wrong notes (' + wrong + '), ' + (mic ? 'possible ' : '') + 'pauses (' + pauses + ')' : (mic ? '疑似错音' : '错音') + wrong + '，' + (mic ? '疑似停顿' : '停顿') + pauses);
        }
        if (record.review) {
          var review = record.review;
          lines.push(en ? [
            review.pulse ? 'steady pulse' : 'practise pulse',
            review.pitch ? 'mostly accurate pitch' : 'practise pitch',
            review.expression ? 'observed expression' : 'practise expression'
          ].join(', ') : '自评已记录，' + (review.pulse ? '拍子稳定' : '继续练拍子') + '，' + (review.pitch ? '音高大体准确' : '继续练音高') + '，' + (review.expression ? '注意了音乐细节' : '继续练音乐细节'));
        }
        return lines.join(en ? '. ' : '。') + (en ? '.' : '。');
      });
      content.append(title, description); var date = document.createElement('time'); date.dateTime = record.date;
      date.textContent = new Date(record.date).toLocaleDateString(I18n.mode() === 'en' ? 'en' : 'zh-CN', { month: 'short', day: 'numeric' });
      article.append(content, date); $('history-list').append(article);
    });
    $('clear-history').disabled = !records.length;
  }
  $('clear-history').onclick = function () { if (confirm(translated('清空本机全部练习记录？此操作不能恢复。'))) { if (SightStorage.clear()) renderHistory(); else toast('无法清除本机记录。'); } };
  $('cache-model').onclick = async function () {
    $('cache-model').disabled = true;
    try {
      await SightTranscribe.cache(function (fraction) {
        var percent = Math.round(fraction * 100);
        setMessage('cache-status', '正在缓存模型，' + percent + '％。', 'Saving the offline model, ' + percent + '%.');
      });
      setMessage('cache-status', '识别组件已缓存，可以离线分析。浏览器清理网站数据后需要重新下载。');
    }
    catch (error) { setMessage('cache-status', errorMessage(error, '离线识别组件下载失败，请联网重试。')); }
    finally { $('cache-model').disabled = false; }
  };
  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () {
    updateControls();
    if (!$('workspace').hidden) SightScore.redraw();
  }, 150); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function () { setMessage('offline-status', '基础练习已可离线使用'); }).catch(function () { setMessage('offline-status', '离线缓存未就绪'); });
  else setMessage('offline-status', '当前浏览器不支持离线缓存');
  function refreshLanguage() {
    messages.forEach(function (pair, id) { $(id).textContent = translated(pair[0], pair[1]); });
    Array.from($('key').options).forEach(function (option) { if (option.value !== 'random') option.text = I18n.keyName(option.value); });
    settingsSummary();
    pieceHeading();
    themeLabel(document.documentElement.dataset.theme);
    setDemoLabel(state.view !== 'guide' && PianoAudio.isPlaying());
    if (state.phase === 'recording' && state.source === 'self' && state.view === 'practice') $('clock').textContent = translated('自由');
    if (state.result && state.result.alignmentReliable !== false) renderDetails(state.result, state.source);
    if (state.view === 'history') renderHistory();
  }
  document.addEventListener('languagechange:app', refreshLanguage);
  setMessage('view-title', '每天一首，稳稳向前。');
  setMessage('focus-score', '专注看谱');
  setMessage('save-review', '保存本次自评');
  setMessage('analysis-status', '在本机分析双手与和弦，结果可能有误。');
  if (!messages.has('offline-status')) setMessage('offline-status', '正在准备离线资源');
  newPiece(); inputHint(); settingsSummary();
})();
