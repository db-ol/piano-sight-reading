class PianoRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.buffer = new Float32Array(2048);
    this.count = 0;
    this.total = 0;
    this.limit = sampleRate * 180;
    this.port.onmessage = ({ data }) => {
      if (data === 'start') {
        this.active = true;
        this.count = this.total = 0;
      } else if (data === 'stop') {
        this.active = false;
        this.flush();
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }
  flush() {
    if (!this.count) return;
    const samples = this.buffer.slice(0, this.count);
    this.port.postMessage({ type: 'samples', samples }, [samples.buffer]);
    this.count = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    const channel = channels && channels[0];
    if (!channel) return true;
    let energy = 0;
    const mono = new Float32Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      for (let c = 0; c < channels.length; c++) mono[i] += channels[c][i] / channels.length;
      energy += mono[i] * mono[i];
    }
    if (currentFrame % 2048 === 0) this.port.postMessage({ type: 'level', value: Math.sqrt(energy / channel.length) });
    if (!this.active) return true;
    for (let i = 0; i < channel.length && this.active; i++) {
      this.buffer[this.count++] = mono[i];
      this.total++;
      if (this.count === this.buffer.length) this.flush();
      if (this.total >= this.limit) {
        this.active = false;
        this.flush();
        this.port.postMessage({ type: 'limit' });
      }
    }
    return true;
  }
}
registerProcessor('piano-recorder', PianoRecorder);
