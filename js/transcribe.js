(function (root) {
  'use strict';
  var model = null;
  var loading = null;
  var busy = false;
  var generation = 0;
  var cancelWaiters = new Set();
  var scriptURL = root.document && root.document.currentScript ? root.document.currentScript.src : '';
  var base = scriptURL ? new URL('../', scriptURL).href : '';
  var assetPaths = ['vendor/tf.min.js', 'vendor/basic-pitch.js', 'vendor/model/model.json', 'vendor/model/group1-shard1of1.bin'];

  function script(path, globalName) {
    if (root[globalName]) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var element = root.document.createElement('script');
      var timer = setTimeout(function () {
        element.remove();
        reject(new Error('识别组件加载超时，请检查网络后重试。'));
      }, 30000);
      element.src = base + path;
      element.onload = function () { clearTimeout(timer); resolve(); };
      element.onerror = function () { clearTimeout(timer); element.remove(); reject(new Error('识别组件加载失败，请联网重试或选择回听自评。')); };
      root.document.head.appendChild(element);
    });
  }

  function progress(callback, fraction, phase) {
    if (callback) callback(fraction, phase);
  }

  function cancelable(promise, mine) {
    return new Promise(function (resolve, reject) {
      function cancelled() { cancelWaiters.delete(cancelled); reject(new Error('已取消分析。')); }
      if (mine !== generation) { promise.catch(function () {}); cancelled(); return; }
      cancelWaiters.add(cancelled);
      promise.then(function (value) { cancelWaiters.delete(cancelled); resolve(value); }, function (error) { cancelWaiters.delete(cancelled); reject(error); });
    });
  }

  async function load(onProgress) {
    if (model) { progress(onProgress, 1, 'ready'); return model; }
    if (loading) {
      var shared = await loading;
      progress(onProgress, 1, 'ready');
      return shared;
    }
    loading = (async function () {
      progress(onProgress, 0, 'loading');
      await script('vendor/tf.min.js', 'tf');
      await script('vendor/basic-pitch.js', 'BasicPitchNotes');
      var tf = root.tf;
      tf.enableProdMode();
      try {
        if (!await tf.setBackend('webgl')) await tf.setBackend('cpu');
      } catch (error) { await tf.setBackend('cpu'); }
      await tf.ready();
      progress(onProgress, 0.25, 'loading');
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 30000);
      try {
        model = await tf.loadGraphModel(base + 'vendor/model/model.json', {
          requestInit: { signal: controller.signal },
          onProgress: function (fraction) { progress(onProgress, 0.25 + fraction * 0.75, 'loading'); }
        });
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('识别模型下载超时，请联网重试。');
        throw error;
      } finally { clearTimeout(timer); }
      progress(onProgress, 1, 'ready');
      return model;
    })();
    try { return await loading; }
    finally { loading = null; }
  }

  function downsample(samples, sampleRate, targetRate) {
    targetRate = targetRate || 22050;
    if (!Number.isFinite(sampleRate) || sampleRate < 8000) throw new Error('无效的录音采样率。');
    if (sampleRate === targetRate) return samples.slice();
    var result = new Float32Array(Math.round(samples.length * targetRate / sampleRate));
    var scale = sampleRate / targetRate;
    var cutoff = Math.min(1, targetRate / sampleRate) * 0.94;
    var radius = 24;
    var phases = 256;
    var weights = [];
    for (var p = 0; p < phases; p++) {
      var row = [];
      for (var t = -radius; t <= radius; t++) {
        var distance = t - p / phases;
        var x = Math.PI * distance * cutoff;
        row.push((Math.abs(x) < 1e-10 ? cutoff : Math.sin(x) / (Math.PI * distance)) * (0.5 + 0.5 * Math.cos(Math.PI * distance / (radius + 1))));
      }
      weights.push(row);
    }
    for (var i = 0; i < result.length; i++) {
      var position = i * scale;
      var center = Math.floor(position);
      var w = weights[Math.min(phases - 1, Math.floor((position - center) * phases))];
      var total = 0;
      var sum = 0;
      for (var j = -radius; j <= radius; j++) {
        var index = center + j;
        if (index < 0 || index >= samples.length) continue;
        sum += samples[index] * w[j + radius];
        total += w[j + radius];
      }
      result[i] = total ? sum / total : 0;
    }
    return result;
  }

  async function resample(samples, sampleRate) {
    if (sampleRate === 22050) return samples;
    var Offline = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    if (!Offline) return downsample(samples, sampleRate, 22050);
    var context = new Offline(1, Math.max(1, Math.round(samples.length * 22050 / sampleRate)), 22050);
    var buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    var source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    var rendered = await context.startRendering();
    return rendered.getChannelData(0);
  }

  async function transcribe(recording, onProgress) {
    if (busy) throw new Error('正在分析另一段录音，请稍候。');
    if (!recording || !recording.samples || !recording.samples.length) throw new Error('没有录到声音，请检查麦克风后重试。');
    if (!Number.isFinite(recording.sampleRate) || recording.sampleRate < 8000) throw new Error('录音采样率无效。');
    if (recording.samples.length / recording.sampleRate > 180.1) throw new Error('单次录音最多支持三分钟。');
    busy = true;
    var mine = ++generation;
    try {
      var graph = await cancelable(load(function (fraction, phase) {
        if (mine === generation) progress(onProgress, fraction * 0.1, phase);
      }), mine);
      var samples = await cancelable(resample(recording.samples, recording.sampleRate), mine);
      var tf = root.tf;
      var windowLength = 43844;
      var hop = 36164;
      var prepend = 3840;
      var wanted = Math.floor(samples.length * 86 / 22050);
      var frames = [];
      var onsets = [];
      var windows = Math.ceil((samples.length + prepend) / hop);
      for (var batch = 0; batch < windows && frames.length < wanted; batch++) {
        if (mine !== generation) throw new Error('已取消分析。');
        var windowSamples = new Float32Array(windowLength);
        var start = batch * hop - prepend;
        var from = Math.max(0, start);
        var to = Math.min(samples.length, start + windowLength);
        if (to > from) windowSamples.set(samples.subarray(from, to), from - start);
        var outputs = tf.tidy(function () {
          var input = tf.tensor(windowSamples, [1, windowLength, 1]);
          var raw = graph.execute(input, ['Identity_1', 'Identity_2']);
          return raw.map(function (tensor) {
            var count = Math.min(tensor.shape[1] - 30, wanted - frames.length);
            return tensor.slice([0, 15, 0], [1, count, -1]).reshape([count, tensor.shape[2]]);
          });
        });
        try {
          var values = await Promise.all(outputs.map(function (tensor) { return tensor.array(); }));
          frames.push.apply(frames, values[0]);
          onsets.push.apply(onsets, values[1]);
        } finally { tf.dispose(outputs); }
        progress(onProgress, 0.1 + 0.85 * (batch + 1) / windows, 'transcribing');
        await tf.nextFrame();
      }
      if (mine !== generation) throw new Error('已取消分析。');
      if (frames.length < 6) return { source: 'microphone', experimental: true, notes: [], duration: recording.duration };
      progress(onProgress, 0.96, 'notes');
      var noteFrames = root.BasicPitchNotes.outputToNotesPoly(frames, onsets, 0.5, 0.3, 5, true, null, null, false);
      var notes = root.BasicPitchNotes.noteFramesToTime(noteFrames).map(function (note) {
        return { midi: note.pitchMidi, time: Math.max(0, note.startTimeSeconds), duration: note.durationSeconds,
          confidence: note.amplitude, velocity: note.amplitude };
      }).filter(function (note) { return note.duration > 0 && note.time <= recording.samples.length / recording.sampleRate; });
      notes.sort(function (a, b) { return a.time - b.time || a.midi - b.midi; });
      progress(onProgress, 1, 'done');
      return { source: 'microphone', experimental: true, notes: notes,
        duration: recording.samples.length / recording.sampleRate, backend: tf.getBackend() };
    } catch (error) {
      if (/[\u3400-\u9fff]/.test(error.message || '')) throw error;
      throw new Error('识别组件运行失败，可以回听自评，或刷新页面后重试。');
    } finally { busy = false; }
  }

  async function cache(onProgress) {
    if (!root.caches) throw new Error('当前浏览器无法缓存识别组件。');
    var storage = await root.caches.open('sight-reading-model-v1');
    for (var i = 0; i < assetPaths.length; i++) {
      var url = base + assetPaths[i];
      if (!await storage.match(url)) {
        var response = await fetch(url);
        if (!response.ok) throw new Error('离线识别组件下载失败，请联网重试。');
        await storage.put(url, response);
      }
      progress(onProgress, (i + 1) / assetPaths.length, 'caching');
    }
    return true;
  }

  function cancel() {
    generation++;
    cancelWaiters.forEach(function (cancelled) { cancelled(); });
  }
  var api = { load: load, transcribe: transcribe, cache: cache, cancel: cancel,
    ready: function () { return !!model; }, assets: assetPaths.slice(), downsample: downsample, resample: resample };
  root.SightTranscribe = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
