(function (root) {
  'use strict';
  var mic = null;
  var access = null;
  var midiOptions = {};
  var midiRecording = null;
  var objectURL = null;
  var micGeneration = 0;
  var midiGeneration = 0;
  var connectedIDs = [];
  var audioSessionOwner = null;
  var scriptURL = root.document && root.document.currentScript ? root.document.currentScript.src : '';

  function capabilities() {
    return {
      microphone: !!(root.navigator && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia && (root.AudioContext || root.webkitAudioContext)),
      midi: !!(root.navigator && root.navigator.requestMIDIAccess),
      secure: root.isSecureContext !== false
    };
  }

  function wav(samples, sampleRate) {
    var buffer = new ArrayBuffer(44 + samples.length * 2);
    var view = new DataView(buffer);
    function text(offset, value) {
      for (var i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    }
    text(0, 'RIFF');
    view.setUint32(4, buffer.byteLength - 8, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    for (var j = 0; j < samples.length; j++) {
      var sample = Math.max(-1, Math.min(1, samples[j]));
      view.setInt16(44 + j * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
    return buffer;
  }

  function notify(session, type, message) {
    if (session.options.onState) session.options.onState({ type: type, message: message });
    if (type === 'interrupted' && session.options.onInterrupted) session.options.onInterrupted(message);
    if (type === 'limit' && session.options.onLimit) session.options.onLimit();
  }

  function cleanup(session) {
    session.closed = true;
    if (session.resolveStop) session.resolveStop();
    if (session.stream) session.stream.getTracks().forEach(function (track) { track.stop(); });
    [session.source, session.node, session.gain].forEach(function (node) {
      if (node) { try { node.disconnect(); } catch (e) {} }
    });
    if (session.node) {
      session.node.port.onmessage = null;
      if (session.node.port.close) session.node.port.close();
    }
    session.source = session.node = session.gain = null;
    session.stream = null;
    if (session.discarded) { session.chunks = []; session.count = 0; }
    if (session.context && session.context.state !== 'closed') session.context.close().catch(function () {});
    if (audioSessionOwner === session) {
      audioSessionOwner = null;
      try {
        if (root.navigator.audioSession && root.navigator.audioSession.type === 'play-and-record') root.navigator.audioSession.type = 'auto';
      } catch (e) {}
    }
    if (mic === session) mic = null;
  }

  async function openMic(options) {
    var mine = ++micGeneration;
    if (mic) { mic.discarded = true; cleanup(mic); }
    if (!capabilities().microphone) throw new Error('当前页面无法使用麦克风，请使用 HTTPS 或 localhost。');
    options = typeof options === 'function' ? { onState: options } : options || {};
    var AC = root.AudioContext || root.webkitAudioContext;
    var session = { context: null, options: options, chunks: [], count: 0, active: false, closed: false, generation: mine };
    mic = session;
    try {
      try {
        if (root.navigator.audioSession) {
          root.navigator.audioSession.type = 'play-and-record';
          audioSessionOwner = session;
        }
      } catch (e) {}
      var context = new AC();
      session.context = context;
      context.resume().catch(function () {});
      session.stream = await root.navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1
      }, video: false });
      if (session.closed || mic !== session || mine !== micGeneration) {
        session.stream.getTracks().forEach(function (track) { track.stop(); });
        throw new Error('录音准备已取消，请重新点击。');
      }
      if (!context.audioWorklet || !root.AudioWorkletNode) throw new Error('当前浏览器不支持录音处理，请更新 Safari 或使用电脑浏览器。');
      var track = session.stream.getAudioTracks()[0];
      session.settings = track.getSettings ? track.getSettings() : {};
      session.settings.contextSampleRate = context.sampleRate;
      track.addEventListener('ended', function () {
        if (!session.closed) {
          notify(session, 'interrupted', '麦克风连接已中断，本次录音已停止。');
          stop();
        }
      });
      track.addEventListener('mute', function () {
        if (!session.closed && session.active) {
          notify(session, 'interrupted', '麦克风输入被系统暂停，本次录音已停止。');
          stop();
        }
      });
      context.addEventListener('statechange', function () {
        if (!session.closed && session.active && (context.state === 'interrupted' || context.state === 'suspended')) {
          notify(session, 'interrupted', '系统暂停了麦克风，本次录音已停止。');
          stop();
        }
      });
      await context.audioWorklet.addModule(new URL('recorder-worklet.js', scriptURL || root.location.href));
      if (session.closed) throw new Error('录音准备已取消，请重新点击。');
      session.node = new root.AudioWorkletNode(context, 'piano-recorder');
      session.node.port.onmessage = function (event) {
        if (session.closed) return;
        var data = event.data;
        if (data.type === 'samples') {
          session.chunks.push(data.samples);
          session.count += data.samples.length;
        } else if (data.type === 'level') {
          session.level = data.value;
          if (options.onLevel) options.onLevel(data.value);
        } else if (data.type === 'stopped' && session.resolveStop) session.resolveStop();
        else if (data.type === 'limit') notify(session, 'limit', '已达到三分钟录音上限，请查看本次练习。');
      };
      session.source = context.createMediaStreamSource(session.stream);
      session.gain = context.createGain();
      session.gain.gain.value = 0;
      session.source.connect(session.node);
      session.node.connect(session.gain);
      session.gain.connect(context.destination);
      if (context.state !== 'running') {
        await Promise.race([context.resume(), new Promise(function (resolve) { setTimeout(resolve, 1500); })]);
        if (context.state !== 'running') throw new Error('录音尚未启动，请再次点击准备麦克风。');
      }
      if (session.closed || mine !== micGeneration) throw new Error('录音准备已取消，请重新点击。');
      return session.settings;
    } catch (error) {
      cleanup(session);
      if (error.name === 'NotAllowedError') throw new Error('麦克风权限未开启，请在浏览器的网站设置中允许使用麦克风。');
      if (error.name === 'NotFoundError') throw new Error('没有找到麦克风，请检查输入设备。');
      if (error.name === 'NotReadableError') throw new Error('麦克风暂时不可用，请关闭其他录音应用后重试。');
      if (error.name === 'AbortError') throw new Error('麦克风准备已中断，请重新点击。');
      if (!/[\u3400-\u9fff]/.test(error.message || '')) throw new Error('麦克风启动失败，请检查设备和浏览器权限后重试。');
      throw error;
    }
  }

  function start() {
    if (!mic || !mic.node || mic.closed) throw new Error('请先准备麦克风。');
    if (mic.context.state !== 'running' || mic.stream.getAudioTracks().some(function (track) { return track.readyState === 'ended' || track.muted; })) throw new Error('麦克风已暂停，请重新准备后再开始。');
    if (mic.active) return;
    mic.chunks = [];
    mic.count = 0;
    mic.active = true;
    mic.node.port.postMessage('start');
  }

  async function stop() {
    var session = mic;
    if (!session) return null;
    if (session.stopping) return session.stopping;
    session.stopping = (async function () {
      session.active = false;
      if (session.node && session.context.state === 'running') {
        await new Promise(function (resolve) {
          var timer = setTimeout(resolve, 750);
          session.resolveStop = function () { clearTimeout(timer); resolve(); };
          session.node.port.postMessage('stop');
        });
      }
      cleanup(session);
      if (session.discarded || session.generation !== micGeneration) return null;
      var samples = new Float32Array(session.count);
      var offset = 0;
      session.chunks.forEach(function (chunk) { samples.set(chunk, offset); offset += chunk.length; });
      session.chunks = [];
      var blob = new Blob([wav(samples, session.context.sampleRate)], { type: 'audio/wav' });
      if (objectURL) root.URL.revokeObjectURL(objectURL);
      objectURL = root.URL.createObjectURL(blob);
      return { source: 'microphone', samples: samples, sampleRate: session.context.sampleRate,
        blob: blob, url: objectURL, settings: session.settings || {}, duration: samples.length / session.context.sampleRate };
    })();
    return session.stopping;
  }

  function midiMessage(recording, bytes, time, device) {
    if (!recording || bytes.length < 3) return;
    var kind = bytes[0] & 240;
    var channel = bytes[0] & 15;
    var midi = bytes[1];
    var velocity = bytes[2];
    var key = (device || '') + ':' + channel + ':' + midi;
    var relative = Math.max(0, (time - recording.origin) / 1000);
    if (kind === 144 && velocity > 0) {
      if (recording.active[key]) {
        recording.active[key].duration = Math.max(0, relative - recording.active[key].time);
        recording.notes.push(recording.active[key]);
      }
      recording.active[key] = { midi: midi, time: relative, duration: 0, velocity: velocity / 127, confidence: 1 };
    } else if ((kind === 128 || kind === 144) && recording.active[key]) {
      recording.active[key].duration = Math.max(0, relative - recording.active[key].time);
      recording.notes.push(recording.active[key]);
      delete recording.active[key];
    }
  }

  function midiState() {
    var names = [];
    var ids = [];
    if (access) access.inputs.forEach(function (port) {
      if (port.state === 'disconnected') { port.onmidimessage = null; return; }
      names.push(port.name || 'MIDI 键盘');
      ids.push(port.id);
      port.onmidimessage = function (event) {
        midiMessage(midiRecording, event.data, event.receivedTime || event.timeStamp, port.id);
      };
    });
    var lostInput = connectedIDs.some(function (id) { return ids.indexOf(id) < 0; });
    connectedIDs = ids;
    var state = { type: 'midi', connected: names.length, names: names };
    if (midiOptions.onState) midiOptions.onState(state);
    if (lostInput && midiOptions.onInterrupted) midiOptions.onInterrupted('MIDI 设备已断开，本次练习已停止。');
    return state;
  }

  async function connectMIDI(options) {
    if (!capabilities().midi) throw new Error('当前浏览器没有 Web MIDI，请用电脑 Chrome、Edge，或改用麦克风。');
    var mine = ++midiGeneration;
    var nextAccess = await root.navigator.requestMIDIAccess({ sysex: false });
    if (mine !== midiGeneration) throw new Error('MIDI 连接准备已取消，请重新点击。');
    midiOptions = typeof options === 'function' ? { onState: options } : options || {};
    access = nextAccess;
    connectedIDs = [];
    access.onstatechange = midiState;
    return midiState();
  }

  function startMIDI() {
    if (!access || !midiState().connected) throw new Error('请先连接 MIDI 键盘。');
    midiRecording = { origin: root.performance.now(), notes: [], active: {} };
  }

  function stopMIDI() {
    var recording = midiRecording;
    midiRecording = null;
    if (!recording) return { source: 'midi', notes: [], duration: 0 };
    var duration = (root.performance.now() - recording.origin) / 1000;
    Object.values(recording.active).forEach(function (note) {
      note.duration = Math.max(0, duration - note.time);
      recording.notes.push(note);
    });
    recording.notes.sort(function (a, b) { return a.time - b.time || a.midi - b.midi; });
    return { source: 'midi', notes: recording.notes, duration: duration };
  }

  function interrupt() {
    if (mic && !mic.closed) {
      notify(mic, 'interrupted', '页面进入后台，本次录音已停止。请回到页面后重新开始。');
      stop();
    }
    if (midiRecording) {
      stopMIDI();
      if (midiOptions.onInterrupted) midiOptions.onInterrupted('页面进入后台，本次 MIDI 练习已停止。');
    }
  }

  function dispose() {
    micGeneration++;
    midiGeneration++;
    if (mic) { mic.discarded = true; cleanup(mic); }
    stopMIDI();
    if (access) {
      access.onstatechange = null;
      access.inputs.forEach(function (port) { port.onmidimessage = null; });
    }
    access = null;
    midiOptions = {};
    connectedIDs = [];
    if (objectURL) root.URL.revokeObjectURL(objectURL);
    objectURL = null;
  }

  if (root.document && root.addEventListener) {
    root.document.addEventListener('visibilitychange', function () {
      if (root.document.visibilityState === 'hidden') interrupt();
    });
    root.addEventListener('pagehide', interrupt);
  }
  var api = { capabilities: capabilities, openMic: openMic, start: start, stop: stop,
    connectMIDI: connectMIDI, startMIDI: startMIDI, stopMIDI: stopMIDI, dispose: dispose,
    level: function () { return mic ? mic.level || 0 : 0; }, wav: wav, midiMessage: midiMessage };
  root.SightInput = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
