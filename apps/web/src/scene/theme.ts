export const PALETTE = {
  lightTile: '#D9C7A3', // sandstone
  darkTile: '#3B4252', // slate
  base: '#5B4636', // walnut
  red: '#B91C1C',
  blue: '#1D4ED8',
  steel: '#CBD5E1',
  gold: '#EAB308',
  wood: '#7C4A1E',
  cloth: '#F1F5F9',
  skin: '#E8B796',
  selected: '#FDE68A',
  lastMove: '#A3B18A',
  check: '#DC2626',
  marker: '#16A34A',
  background: '#3D3142', // dusk; the fog fades the earth beyond the wall into it
  stone: '#8C8279',
  stoneDark: '#5C554E',
  earth: '#3B3026',
  roof: '#4B4F5C',
  iron: '#3F3F46',
  flame: '#FFA040',
  sun: '#FFD9B0',
  skyFill: '#A8B8D8',
} as const;

export const TEAM = { w: PALETTE.red, b: PALETTE.blue } as const;

// Starting values, tuned by eye.
export const TIMING = {
  walkSquaresPerSec: 3,
  walkMinMs: 250,
  hopMs: 500,
  hopHeight: 0.6,
  attackMs: 700,
  impactAt: 0.6, // fraction of the attack clip at which the defender is struck
  hitMs: 300, // the defender's recoil, before it falls
  dieMs: 700,
  promoteMs: 300,
  turnMs: 150,
} as const;

export const walkMs = (distance: number) =>
  Math.max(TIMING.walkMinMs, (distance / TIMING.walkSquaresPerSec) * 1000);

export const STAND_OFF = 0.7; // squares between attacker and defender during a fight

// fitAspect: the narrowest width/height at which `fov` still shows the whole board
export const CAMERA = {
  position: [0, 6.88, 11.58] as [number, number, number],
  target: [0, 0.4, -0.6] as [number, number, number], // above and beyond the centre, so the far wall is in frame
  fov: 36,
  fitAspect: 1.45,
  maxDistance: 14,
  focusMs: 400,
  focusAmount: 0.45, // how far the camera travels from home toward a fight
  introMs: 1200,
  introScale: 1.6, // the opening descent starts this many times farther out than home
  checkmateMs: 1200,
};

export const COURTYARD = {
  floorY: -1.1, // the flagstones' top: the dais's two 0.3 steps rise from here to the walnut base's bottom at -0.5
  wallRadius: 12,
  wallHeight: 3,
  merlonHeight: 0.5,
} as const;
