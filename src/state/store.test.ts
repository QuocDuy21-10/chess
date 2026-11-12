import { beforeEach, expect, test, vi } from 'vitest';
import { useGame } from './store';

const game = () => useGame.getState();

beforeEach(() => game().newGame());

async function play(...moves: string[]) {
  for (const move of moves) {
    expect(game().submitText(move), move).toBe(true);
    await waitForIdle();
  }
}

async function waitForIdle() {
  while (game().phase === 'animating') await Promise.resolve();
}

test('selecting a piece lists its legal targets; selecting a target moves it', async () => {
  game().select('e2');
  expect(game().selected).toBe('e2');
  expect(game().targets.map((m) => m.to).sort()).toEqual(['e3', 'e4']);

  game().select('e4');
  expect(game().phase).toBe('animating'); // input is locked while the move plays
  game().select('d7');
  expect(game().selected).toBeNull();

  await waitForIdle();
  expect(game().phase).toBe('idle');
  expect(game().history).toEqual(['e4']);
  expect(game().lastMove).toEqual({ from: 'e2', to: 'e4' });
  expect(game().turn).toBe('b');
  expect(game().pieces.find((p) => p.id === 'w-p-e2')?.square).toBe('e4');
});

test('selecting an empty square or an opponent piece clears the selection', () => {
  game().select('e2');
  game().select('e7');
  expect(game().selected).toBeNull();
  game().select('e2');
  game().select('a5');
  expect(game().selected).toBeNull();
});

test('selecting another own piece moves the selection', () => {
  game().select('e2');
  game().select('g1');
  expect(game().selected).toBe('g1');
});

test('typed moves accept SAN and coordinates, and reject nonsense', async () => {
  await play('e4', 'e7e5', 'Nf3');
  expect(game().history).toEqual(['e4', 'e5', 'Nf3']);
  expect(game().submitText('Ke5')).toBe(false);
  expect(game().history).toHaveLength(3);
});

test('a promotion waits for the chooser', async () => {
  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
  game().select('b7');
  game().select('a8');
  expect(game().phase).toBe('promoting');
  expect(game().pendingPromotion).toEqual({ from: 'b7', to: 'a8' });

  game().select('e2'); // ignored while promoting
  expect(game().selected).toBeNull();

  game().choosePromotion('n');
  await waitForIdle();
  expect(game().history.at(-1)).toBe('bxa8=N');
  expect(game().pieces.find((p) => p.square === 'a8')).toMatchObject({ id: 'w-p-a2', type: 'n' });
});

test('cancelling a promotion returns to idle without moving', async () => {
  await play('a4', 'b5', 'axb5', 'a6', 'bxa6', 'Bb7', 'axb7', 'Nc6');
  game().select('b7');
  game().select('a8');
  game().cancelPromotion();
  expect(game().phase).toBe('idle');
  expect(game().history).toHaveLength(8);
});

test('checkmate ends the game and names the winner', async () => {
  await play('f3', 'e5', 'g4', 'Qh4#');
  expect(game().phase).toBe('gameOver');
  expect(game().result).toEqual({ reason: 'checkmate', winner: 'b' });
  expect(game().inCheck).toBe(true);
  game().select('e2'); // no input after the game ends
  expect(game().selected).toBeNull();
});

test('new game resets everything', async () => {
  await play('f3', 'e5', 'g4', 'Qh4');
  game().newGame();
  expect(game()).toMatchObject({ phase: 'idle', history: [], result: null, turn: 'w', lastMove: null });
  expect(game().pieces).toHaveLength(32);
});

test('stalemate is a draw', async () => {
  await play(
    'e3', 'a5', 'Qh5', 'Ra6', 'Qxa5', 'h5', 'h4', 'Rah6', 'Qxc7', 'f6',
    'Qxd7+', 'Kf7', 'Qxb7', 'Qd3', 'Qxb8', 'Qh7', 'Qxc8', 'Kg6', 'Qe6',
  );
  expect(game().phase).toBe('gameOver');
  expect(game().result).toEqual({ reason: 'stalemate' });
});

test('the view never drifts from chess.js through castles, en passant and promotion', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  await play(
    'e4', 'd5', 'e5', 'f5', 'exf6', 'Nc6', 'fxg7', 'Be6', 'gxh8=Q', 'Qd7',
    'Nf3', 'O-O-O', 'Be2', 'Nf6', 'O-O', 'Bg7', 'Qxd8+', 'Kxd8',
  );
  expect(error).not.toHaveBeenCalled(); // the store logs an error whenever it has to resync
  expect(game().pieces).toHaveLength(27);
  error.mockRestore();
});
