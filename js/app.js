(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var state = { view: 'practice', phase: 'idle', score: null, result: null, recording: null, source: null, attempt: null, token: 0, timer: null, started: 0, speed: 1 };
  var toastTimer;
  function toast(message) { $('toast').textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(function () { $('toast').textContent = ''; }, 5500); }
  function safePreference(key, value) { try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) {} }
  function theme(value) {
    document.documentElement.dataset.theme = value;
    $('theme').setAttribute('aria-label', value === 'dark' ? '切换浅色模式' : '切换深色模式');
    SightScore.redraw();
  }
  var mediaTheme = matchMedia('(prefers-color-scheme: dark)');
  theme(safePreference('sight-theme') || (mediaTheme.matches ? 'dark' : 'light'));
  mediaTheme.addEventListener('change', function () { if (!safePreference('sight-theme')) theme(mediaTheme.matches ? 'dark' : 'light'); });
  $('theme').onclick = function () { var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; safePreference('sight-theme', next); theme(next); };

  SightGenerator.KEYS.forEach(function (key) { $('key').add(new Option(key.label, key.id)); });
  SightGenerator.METERS.forEach(function (meter) { $('meter').add(new Option(meter, meter)); });
  var caps = SightInput.capabilities();
  if (!caps.microphone) { $('source').value = 'self'; $('source').querySelector('[value="microphone"]').disabled = true; }
  if (!caps.midi) $('source').querySelector('[value="midi"]').disabled = true;
  function inputHint() {
    var value = $('source').value;
    $('input-hint').textContent = value === 'midi' ? '连接电钢琴后点击开始。直接记录按键事件，不录制声音。' : value === 'self' ? '不申请麦克风权限。弹完后按拍子、音高和音乐细节做自评。' : '录音只在本机处理。自动识别为实验功能，需要回听核对。' + (!caps.midi ? ' 当前浏览器不支持 MIDI 直连。' : '');
    updateControls();
  }
  $('source').onchange = inputHint;
  ['difficulty', 'key', 'meter'].forEach(function (id) { $(id).onchange = function () {
    $('settings-summary').textContent = $('difficulty').selectedOptions[0].text + ' · ' + $('key').selectedOptions[0].text;
  }; });
  function stopSound() {
    PianoAudio.stop(); PianoAudio.stopMetronome(); SightScore.highlight(null);
    $('demo').textContent = '▷ 听示范';
    $('metronome').textContent = '节拍器';
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
    var selectedKey = $('key').value === 'random' ? SightGenerator.KEYS[(seed >>> 8) % SightGenerator.KEYS.length].id : $('key').value;
    var selectedMeter = $('meter').value === 'random' ? SightGenerator.METERS[(seed >>> 16) % SightGenerator.METERS.length] : $('meter').value;
    state.score = SightGenerator.generate({ seed: seed, key: selectedKey, meter: selectedMeter, difficulty: $('difficulty').value });
    $('piece-number').textContent = '原创练习 · ' + String(seed).slice(-6);
    $('piece-title').textContent = state.score.title;
    $('piece-meta').textContent = state.score.keyLabel + ' · ' + state.score.meter + ' · ' + state.score.bars + '小节 · ♩ = ' + state.score.bpm;
    SightScore.render($('score'), state.score);
  }
  function updateControls() {
    var busy = state.phase !== 'idle';
    ['new-piece', 'difficulty', 'key', 'meter', 'source', 'speed'].forEach(function (id) { $(id).disabled = busy; });
    $('demo').disabled = busy;
    $('metronome').disabled = busy;
    $('analyze').disabled = busy;
    $('practice-tools').hidden = state.view === 'exam';
    $('session').hidden = !['preparing', 'recording', 'setup'].includes(state.phase);
    $('input-level').hidden = state.source !== 'microphone';
    $('start').disabled = state.phase === 'setup' || state.phase === 'preparing' || state.phase === 'analyzing';
    $('start').textContent = state.phase === 'recording' ? '结束这一遍' : state.phase === 'analyzing' ? '正在分析录音…' : state.phase === 'setup' ? '正在准备输入…' : state.view === 'exam' ? '开始模拟考试' : $('source').value === 'self' ? '开始自由练习' : $('source').value === 'midi' ? '连接并记录弹奏' : '录下这一遍';
    document.querySelectorAll('.tabbar button').forEach(function (button) { button.disabled = busy; });
  }
  function showView(view) {
    stopSound();
    state.view = view;
    $('workspace').hidden = view === 'history' || view === 'about';
    $('history-view').hidden = view !== 'history';
    $('about-view').hidden = view !== 'about';
    $('exam-intro').hidden = view !== 'exam';
    $('view-title').textContent = view === 'exam' ? '给自己一次真实的开始。' : '每天一首，稳稳向前。';
    document.querySelectorAll('.tabbar button').forEach(function (button) {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    updateControls();
    if (view === 'history') renderHistory();
    if (view === 'practice' || view === 'exam') SightScore.redraw();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tabbar button').forEach(function (button) { button.onclick = function () { showView(button.dataset.view); }; });
  $('new-piece').onclick = newPiece;
  $('focus-score').onclick = function () {
    var enabled = document.body.classList.toggle('focus-mode');
    $('focus-score').textContent = enabled ? '退出专注' : '专注看谱';
    SightScore.redraw();
    if (enabled) $('score').scrollIntoView({ block: 'start' });
  };
  $('demo').onclick = function () {
    if (PianoAudio.isPlaying()) { stopSound(); return; }
    stopSound();
    if (!PianoAudio.unlock()) { toast('当前设备无法播放示范，请检查浏览器与声音设置。'); return; }
    $('demo').textContent = '□ 停止示范';
    PianoAudio.playScore(state.score, Number($('speed').value), SightScore.highlight, function (_, reason) {
      $('demo').textContent = '▷ 听示范'; SightScore.highlight(null);
      if (reason === 'nosound') toast('声音未能启动，请再次点击听示范。');
    });
  };
  $('metronome').onclick = function () {
    var wasOn = PianoAudio.metronomeOn();
    stopSound();
    if (wasOn) return;
    if (!PianoAudio.unlock()) { toast('当前设备无法启动声音。'); return; }
    var beatLength = state.score.meter === '6/8' || state.score.meter === '3/8' ? 1.5 : 1;
    var beats = state.score.meter === '6/8' ? 2 : state.score.meter === '3/8' ? 1 : Number(state.score.meter.split('/')[0]);
    PianoAudio.metronome(state.score.bpm * Number($('speed').value) / beatLength, beats, function () { stopSound(); toast('节拍器未能启动，请再次点击。'); });
    $('metronome').textContent = '停止节拍器'; $('metronome').setAttribute('aria-pressed', 'true');
  };
  $('speed').onchange = stopSound;

  function settingsDescription(settings) {
    function flag(key) { return settings[key] === false ? '关' : settings[key] === true ? '开' : '未报告'; }
    return '处理采样率 ' + (settings.contextSampleRate || '未报告') + ' Hz。回声消除' + flag('echoCancellation') + '，降噪' + flag('noiseSuppression') + '，自动增益' + flag('autoGainControl') + '。';
  }
  async function cancelSession(message) {
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
  async function startSession() {
    if (state.phase === 'recording') { await finishSession(); return; }
    if (state.phase !== 'idle') return;
    stopSound();
    $('recording-audio').pause();
    $('feedback').hidden = true;
    $('settings').open = false;
    state.phase = 'setup';
    state.source = $('source').value;
    state.speed = state.view === 'exam' ? 1 : Number($('speed').value);
    var mine = ++state.token;
    $('phase').textContent = '准备输入'; $('clock').textContent = '…';
    $('session-hint').textContent = '请允许麦克风或 MIDI 权限。';
    $('session-stop').textContent = '取消';
    updateControls();
    try {
      if (state.source === 'microphone') {
        var settings = await SightInput.openMic({ onInterrupted: interrupted, onLimit: finishSession, onLevel: function (level) { if (mine === state.token) $('input-level').value = level; } });
        if (mine !== state.token) return;
        $('input-hint').textContent = settingsDescription(settings);
      } else if (state.source === 'midi') {
        var devices = await SightInput.connectMIDI({ onInterrupted: interrupted });
        if (!devices.connected) throw new Error('尚未发现 MIDI 键盘，请连接电钢琴后重试。');
      }
      if (mine !== state.token) return;
      if (state.view === 'exam') newPiece();
      state.result = null;
      state.recording = null;
      state.attempt = { id: Date.now() + '-' + mine, date: new Date().toISOString(), key: state.score.keyLabel, meter: state.score.meter, difficulty: state.score.difficultyLabel, seed: state.score.seed, source: state.source, mode: state.view, summary: {} };
      $('feedback').hidden = true;
      ['review-pulse', 'review-pitch', 'review-expression'].forEach(function (id) { $(id).checked = false; });
      $('save-review').disabled = false; $('save-review').textContent = '保存本次自评';
      SightScore.render($('score'), state.score);
      if (state.view === 'exam') {
        state.phase = 'preparing';
        var deadline = performance.now() + 30000;
        $('phase').textContent = '准备读谱'; $('clock').textContent = '30';
        $('session-hint').textContent = '可以试弹部分或全部，准备音不会计入反馈。';
        state.timer = setInterval(function () {
          var remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
          $('clock').textContent = remaining;
          if (!remaining) { clearInterval(state.timer); beginPerformance(); }
        }, 100);
        updateControls(); $('session').scrollIntoView({ block: 'start' });
      } else beginPerformance();
    } catch (error) { if (mine === state.token) await cancelSession(error.message || '输入启动失败，请检查权限后重试。'); }
  }
  function beginPerformance() {
    try {
      if (state.source === 'microphone') SightInput.start();
      if (state.source === 'midi') SightInput.startMIDI();
      state.phase = 'recording'; state.started = performance.now();
      $('phase').textContent = '请开始演奏'; $('clock').textContent = '0:00';
      $('session-hint').textContent = '保持连贯，弹完后点结束。' + (state.source !== 'self' ? '单次记录最长三分钟。' : ''); $('session-stop').textContent = '结束';
      if (state.source === 'self' && state.view === 'practice') $('clock').textContent = '自由';
      else state.timer = setInterval(function () {
        var seconds = Math.floor((performance.now() - state.started) / 1000);
        $('clock').textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
        if (seconds >= 180 && state.source !== 'self') finishSession();
      }, 250);
      updateControls();
    } catch (error) { cancelSession(error.message); }
  }
  async function finishSession() {
    if (state.phase !== 'recording') return;
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
        $('result-summary').textContent = '这一遍已经结束。回想拍子是否稳定，是否保持连贯，再记录自评。';
        $('uncertainty').textContent = '本次没有采集音符，不会自动判断对错。';
      }
    } catch (error) { if (mine === state.token) { state.phase = 'idle'; updateControls(); toast(error.message || '无法完成本次录音。'); } }
  }
  function showFeedbackBase() {
    $('feedback').hidden = false;
    $('result-summary').textContent = '已记录这一遍，正在准备反馈。';
    $('uncertainty').textContent = '练习参考，不是官方评分。';
    $('result-stats').replaceChildren(); $('issues').replaceChildren();
    $('recording-player').hidden = true; $('analysis-actions').hidden = true;
    $('feedback').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  async function analyzeRecording() {
    if (!state.recording || state.phase !== 'idle') return;
    state.phase = 'analyzing'; updateControls();
    $('analyze').disabled = true; $('cancel-analysis').hidden = false; $('analysis-progress').hidden = false;
    var mine = state.token;
    $('uncertainty').textContent = '实验识别，在本机处理。结果需要结合回听核对。';
    try {
      var result = await SightTranscribe.transcribe(state.recording, function (fraction, phase) {
        if (mine !== state.token) return;
        $('analysis-progress').value = fraction;
        $('analysis-status').textContent = (phase === 'loading' ? '正在加载本机识别模型' : '正在分析双手与和弦') + '，' + Math.round(fraction * 100) + '％。请保持页面在前台。';
      });
      if (mine !== state.token) return;
      processNotes(result.notes, 'microphone');
      $('analysis-status').textContent = !result.notes.length ? '分析完成，未取得可定位的音符，请回听自评。' : state.result && state.result.alignmentReliable === false ? '分析完成，但无法可靠对齐，请回听自评。' : '分析完成。彩色标记是疑似位置，回听后再决定是否需要重练。';
    } catch (error) {
      if (mine === state.token) {
        $('result-summary').textContent = '这段录音可以回听和自评。';
        $('analysis-status').textContent = error.message || '自动分析失败，请回听自评。';
      }
    } finally {
      if (mine === state.token) {
        state.phase = 'idle'; updateControls(); $('analyze').disabled = false;
        $('cancel-analysis').hidden = true; $('analysis-progress').hidden = true;
      }
    }
  }
  function pitchName(midi) {
    if (midi === null || midi === undefined) return '未检测到';
    return ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
  }
  function processNotes(notes, source) {
    state.result = null;
    $('result-stats').replaceChildren(); $('issues').replaceChildren();
    if (!notes.length) {
      $('result-summary').textContent = '没有取得可分析的音符。请检查输入音量、连接和麦克风位置，或回听后自评。';
      $('uncertainty').textContent = '没有输入不代表全部弹错，本次不生成错音统计。';
      return;
    }
    var expected = Object.assign({}, state.score, { bpm: state.score.bpm * state.speed });
    var result = SightAlignment.analyze(expected, notes, { source: source });
    state.result = result;
    if (result.alignmentReliable === false) {
      $('result-summary').textContent = '暂时无法可靠定位，请先核对选曲和输入。';
      $('uncertainty').textContent = '检测音符与谱面的重合太少，本次不把位置或错误统计当作可靠结论。请回听后自评。';
      SightScore.render($('score'), state.score);
      return;
    }
    var s = result.summary;
    var mic = source === 'microphone';
    var counts = mic ? [s.suspectedWrong, s.suspectedMissing, s.suspectedExtra, s.suspectedRhythm, s.suspectedPauses, s.uncertain] : [s.wrong, s.missing, s.extra, s.rhythm, s.pauses, s.correct];
    var labels = ['错音', '漏音', '多弹', '节奏处', '停顿处', mic ? '待核对音' : '音高正确'];
    $('result-stats').replaceChildren();
    labels.forEach(function (label, index) {
      var box = document.createElement('div'); box.className = 'stat';
      var value = document.createElement('strong'); value.textContent = counts[index];
      var name = document.createElement('span'); name.textContent = (mic && index < 5 ? '疑似' : '') + label;
      box.append(value, name); $('result-stats').append(box);
    });
    var tempo = s.tempoBpm ? '估计速度约为每分钟' + Math.round(s.tempoBpm) + '个四分音符。' : '';
    var continuity = counts[4] ? '先挑出停顿处慢练，再试着保持拍子连贯地向前。' : counts[3] ? '可以重点练习标出的起音间隔，先保持均匀的拍子。' : '本次未发现明显的局部节奏偏差，继续留意力度和乐句。';
    $('result-summary').textContent = (mic ? '以下是待核对的识别线索。' : '') + tempo + continuity + (s.tempoRatio && s.tempoRatio < 0.85 ? '整体速度偏慢与节奏不稳是两回事，可以先求连贯。' : '');
    $('uncertainty').textContent = mic ? '麦克风转录可能把泛音、踏板和混响当成音符，也可能漏掉和弦里的弱音。所有标记都是疑似，不是确定错误。' : '根据 MIDI 按键事件分析音高与起音。音色、乐句、力度处理不在自动评分范围内。';
    $('uncertainty').textContent += result.limitations.filter(function (text) { return text.includes('重复同音') || text.includes('渐慢'); }).join('');
    $('issues').replaceChildren();
    result.notes.forEach(function (n) {
      var reasons = [];
      if (n.pitchStatus === 'wrong') reasons.push('谱面' + pitchName(n.midi) + '，检测到' + pitchName(n.actualMidi));
      if (n.pitchStatus === 'missing') reasons.push('未检测到' + pitchName(n.midi));
      if (n.rhythm) reasons.push('起音间隔偏差');
      if (n.pause) reasons.push('出现额外等待');
      if (reasons.length) issue(n.bar, (mic ? '待核对，' : '') + (n.hand === 'left' ? '左手，' : '右手，') + reasons.join('，'));
    });
    result.extras.forEach(function (n) { issue(n.bar, (mic ? '疑似多弹' : '多弹') + pitchName(n.midi)); });
    if (!$('issues').childElementCount) { var li = document.createElement('li'); li.textContent = '未发现需要定位的异常。自动分析不能代替听觉判断。'; $('issues').append(li); }
    SightScore.render($('score'), state.score, result);
    state.attempt.summary = s;
    state.attempt.kind = 'analysis';
    saveAttempt();
  }
  function issue(bar, text) {
    var li = document.createElement('li');
    var button = document.createElement('button');
    button.textContent = '第' + ((bar || 0) + 1) + '小节，' + text;
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
    if (saveAttempt()) { $('save-review').disabled = true; $('save-review').textContent = '已保存本次自评'; toast('已保存到本机练习记录。'); }
  };
  $('start').onclick = startSession;
  $('session-stop').onclick = function () { if (state.phase === 'recording') finishSession(); else cancelSession('已取消本次准备。'); };
  $('analyze').onclick = analyzeRecording;
  $('cancel-analysis').onclick = function () { SightTranscribe.cancel(); $('analysis-status').textContent = '正在取消，请稍候。'; };
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
    var names = { wrong: '错音', missing: '漏音', extra: '多弹', rhythm: '局部节奏', pauses: '停顿' };
    var common = Object.keys(totals).filter(function (key) { return totals[key] > 0; }).sort(function (a, b) { return totals[b] - totals[a]; });
    $('history-summary').textContent = records.length ? '已记录' + records.length + '次练习。' + (common.length ? 'MIDI 反馈中较常见的是' + common.map(function (key) { return names[key] + '（' + totals[key] + '）'; }).join('、') + '。' : '继续练习，慢慢积累自己的节奏。') + (micCount ? '麦克风记录共' + micCount + '次，疑似错误不并入确定弱项。' : '') : '还没有练习记录。完整弹一遍，再留下第一次自评。';
    var reviews = records.filter(function (record) { return record.review; });
    if (reviews.length) {
      var categories = { pulse: '拍子与连贯性', pitch: '音高与节奏', expression: '音乐细节' };
      var needs = Object.keys(categories).map(function (key) { return { label: categories[key], count: reviews.filter(function (r) { return !r.review[key]; }).length }; }).filter(function (item) { return item.count; }).sort(function (a, b) { return b.count - a.count; });
      $('history-summary').textContent += needs.length ? '自评中需要加强的是' + needs.map(function (item) { return item.label + '（' + item.count + '次）'; }).join('、') + '。' : '你记录的自评中，各项都已做到。继续留意音乐走向。';
    }
    $('history-list').replaceChildren();
    records.forEach(function (record) {
      var article = document.createElement('article'); article.className = 'history-item';
      var content = document.createElement('div'); var title = document.createElement('h3');
      title.textContent = record.key + ' · ' + record.meter + ' · ' + record.difficulty;
      var description = document.createElement('p');
      description.textContent = record.kind === 'self' ? '自评记录' : record.source === 'microphone' ? '麦克风实验识别，待核对' : 'MIDI 按键反馈';
      if (record.kind === 'analysis') description.textContent += '。' + (record.source === 'microphone' ? '疑似错音' + record.summary.suspectedWrong + '，疑似停顿' + record.summary.suspectedPauses : '错音' + record.summary.wrong + '，停顿' + record.summary.pauses);
      if (record.review) description.textContent += '。自评已记录，' + (record.review.pulse ? '拍子稳定' : '继续练拍子') + '，' + (record.review.pitch ? '音高大体准确' : '继续练音高') + '，' + (record.review.expression ? '注意了音乐细节' : '继续练音乐细节');
      content.append(title, description); var date = document.createElement('time'); date.dateTime = record.date;
      date.textContent = new Date(record.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      article.append(content, date); $('history-list').append(article);
    });
    $('clear-history').disabled = !records.length;
  }
  $('clear-history').onclick = function () { if (confirm('清空本机全部练习记录？此操作不能恢复。')) { if (SightStorage.clear()) renderHistory(); else toast('无法清除本机记录。'); } };
  $('cache-model').onclick = async function () {
    $('cache-model').disabled = true;
    try { await SightTranscribe.cache(function (fraction) { $('cache-status').textContent = '正在缓存模型，' + Math.round(fraction * 100) + '％。'; }); $('cache-status').textContent = '识别组件已缓存，可以离线分析。浏览器清理网站数据后需要重新下载。'; }
    catch (error) { $('cache-status').textContent = error.message; }
    finally { $('cache-model').disabled = false; }
  };
  var resizeTimer;
  window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (!$('workspace').hidden) SightScore.redraw(); }, 150); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function () { $('offline-status').textContent = '基础练习已可离线使用'; }).catch(function () { $('offline-status').textContent = '离线缓存未就绪'; });
  else $('offline-status').textContent = '当前浏览器不支持离线缓存';
  newPiece(); inputHint();
})();
