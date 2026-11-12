// The only file that touches AudioContext. Everything here is a no-op until the first user
// gesture, because browsers refuse to start audio before one.

const FILES = {
  select: ['select.ogg'],
  error: ['error.ogg'],
  step: ['step0.ogg', 'step1.ogg', 'step2.ogg', 'step3.ogg'],
  land: ['land.ogg'],
  draw: ['draw.ogg'],
  hit: ['hit.ogg'],
  fall: ['fall.ogg'],
  promote: ['promote.ogg'],
  check: ['check.ogg'],
  gameover: ['gameover.ogg'],
} as const;

export type SoundName = keyof typeof FILES;

const MUSIC_VOLUME = 0.35;
const DUCKED = 0.35; // fraction of the music level left during a fight
const PAUSED = 0.35; // and while the pause menu is open

let ctx: AudioContext | null = null;
let master: GainNode;
let sfx: GainNode;
let music: GainNode;
const buffers = new Map<string, AudioBuffer>();
let muted = false;
let ducked = false;
let paused = false;
let level = 1;
const volume = { music: 1, sfx: 1 }; // the player's settings, 0 to 1

const musicGain = () =>
  MUSIC_VOLUME * level * (ducked ? DUCKED : 1) * (paused ? PAUSED : 1) * volume.music;

/** Plays a sound `delayMs` from now, on the audio clock. One of several files is picked at random. */
export function play(name: SoundName, delayMs = 0): void {
  if (!ctx) return;
  const files = FILES[name];
  const buffer = buffers.get(files[Math.floor(Math.random() * files.length)]);
  if (!buffer) return; // still loading, or failed to load
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(sfx);
  source.start(ctx.currentTime + delayMs / 1000);
}

export function setMuted(value: boolean): void {
  muted = value;
  if (ctx) master.gain.value = muted ? 0 : 1;
}

function rampMusic(ms: number) {
  if (!ctx) return;
  // setTargetAtTime approaches its target exponentially; a third of `ms` as the time constant gets ~95% there
  music.gain.setTargetAtTime(musicGain(), ctx.currentTime, ms / 3000);
}

/** Lowers the music under a fight, and brings it back. */
export function duck(on: boolean): void {
  ducked = on;
  rampMusic(300);
}

/** Lowers the music while the pause menu is open. Separate from `duck`, so a fight ending behind the menu does not raise it. */
export function setPaused(on: boolean): void {
  paused = on;
  rampMusic(300);
}

/** Sets the player's volume for one channel, 0 to 1. Remembered until the audio is unlocked. */
export function setVolume(channel: 'music' | 'sfx', value: number): void {
  volume[channel] = value;
  if (channel === 'music') rampMusic(50);
  else if (ctx) sfx.gain.value = value;
}

/** Fades the music to `to` (0 to 1) of its normal level. */
export function fadeMusic(to: number, ms: number): void {
  level = to;
  rampMusic(ms);
}

async function load(file: string) {
  try {
    const response = await fetch(`/audio/${file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    buffers.set(file, await ctx!.decodeAudioData(await response.arrayBuffer()));
  } catch (error) {
    console.warn(`Sound ${file} is unavailable:`, error); // the game never waits on audio
  }
}

function unlock() {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  sfx = ctx.createGain();
  music = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  sfx.gain.value = volume.sfx;
  music.gain.value = musicGain();
  sfx.connect(master);
  music.connect(master);
  master.connect(ctx.destination);

  // The music streams through an <audio> element instead of being decoded whole into memory.
  const track = new Audio('/audio/music.mp3');
  track.loop = true;
  ctx.createMediaElementSource(track).connect(music);
  track.play().catch((error) => console.warn('Music is unavailable:', error));

  for (const file of Object.values(FILES).flat()) void load(file);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}
