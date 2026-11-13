import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// audio.ts listens for the first gesture on `window` when it loads, so each test loads a fresh copy after putting
// fake browser objects in place, then "clicks".

const created: FakeAudio[] = [];

class FakeAudio {
  loop = false;
  src: string;
  constructor(src: string) {
    this.src = src;
    created.push(this);
  }
  play() {
    return Promise.resolve();
  }
}

const node = () => ({ connect: vi.fn(), start: vi.fn(), gain: { value: 1, setTargetAtTime: vi.fn() } });

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createGain = node;
  createBufferSource = node;
  createMediaElementSource = node;
  decodeAudioData = async () => ({});
}

beforeEach(() => {
  created.length = 0;
  vi.resetModules();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(0))));
});
afterEach(() => vi.unstubAllGlobals());

/** A fresh audio module; `before` runs before the player's first click. */
async function firstClick(before: (audio: typeof import('./audio')) => void = () => {}) {
  const audio = await import('./audio');
  before(audio);
  window.dispatchEvent(new Event('pointerdown'));
  return audio;
}

const music = () => created.filter((element) => element.src === '/audio/music.mp3');

test('nothing is downloaded before the first click', async () => {
  const audio = await import('./audio');
  audio.setMuted(false);
  audio.setVolume('music', 1);
  expect(music()).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
});

test('the first click starts the music when it can be heard', async () => {
  await firstClick();
  expect(music()).toHaveLength(1);
  expect(music()[0].loop).toBe(true);
});

test('muted, the music is not downloaded; unmuting starts it, once', async () => {
  const audio = await firstClick((a) => a.setMuted(true));
  expect(music()).toHaveLength(0);
  expect(fetch).toHaveBeenCalled(); // the sound effects still load
  audio.setMuted(false);
  audio.setMuted(false);
  expect(music()).toHaveLength(1);
});

test('with the music at 0 it is not downloaded; raising it starts it, and lowering only silences it', async () => {
  const audio = await firstClick((a) => a.setVolume('music', 0));
  expect(music()).toHaveLength(0);
  audio.setVolume('music', 0.5);
  expect(music()).toHaveLength(1);
  audio.setVolume('music', 0);
  audio.setVolume('music', 1);
  expect(music()).toHaveLength(1);
});
