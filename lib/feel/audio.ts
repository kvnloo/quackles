let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlockAudio() {
  const audio = context();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

function context() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  }
  return ctx;
}

function noise(duration: number, gain: number, highpass = 400) {
  const audio = context();
  if (!master) return;
  const length = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpass;
  const amp = audio.createGain();
  amp.gain.value = gain;
  source.connect(filter); filter.connect(amp); amp.connect(master);
  source.start();
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number, glide?: number) {
  const audio = context();
  if (!master) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, audio.currentTime);
  amp.gain.exponentialRampToValueAtTime(0.0008, audio.currentTime + duration);
  if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, glide), audio.currentTime + duration);
  osc.connect(amp); amp.connect(master);
  osc.start();
  osc.stop(audio.currentTime + duration + 0.02);
}

export function playClick() {
  tone(190, 0.04, "square", 0.09);
  noise(0.03, 0.08, 1200);
}

export function playTakeoff() {
  tone(90, 0.12, "sawtooth", 0.16, 220);
  noise(0.08, 0.12, 600);
}

export function playLand() {
  tone(52, 0.16, "sine", 0.28, 38);
  noise(0.1, 0.18, 180);
}

export function playServo(intensity: number) {
  tone(48 + intensity * 40, 0.05, "sawtooth", 0.05 + intensity * 0.08);
}

export function playExplode() {
  tone(70, 0.22, "square", 0.14, 40);
  noise(0.18, 0.22, 240);
}
