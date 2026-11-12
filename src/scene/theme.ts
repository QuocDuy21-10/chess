export const PALETTE = {
  lightTile: '#D9C7A3', // sandstone
  darkTile: '#3B4252', // slate
  base: '#5B4636', // walnut
  amber: '#D97706',
  teal: '#0F766E',
  steel: '#CBD5E1',
  gold: '#EAB308',
  wood: '#7C4A1E',
  cloth: '#F1F5F9',
  skin: '#E8B796',
  selected: '#FDE68A',
  lastMove: '#A3B18A',
  check: '#DC2626',
  marker: '#16A34A',
  background: '#1C1917',
} as const;

export const TEAM = { w: PALETTE.amber, b: PALETTE.teal } as const;
export const TEAM_NAME = { w: 'Amber', b: 'Teal' } as const;

// Starting values, tuned by eye.
export const TIMING = {
  walkSquaresPerSec: 3,
  walkMinMs: 250,
  hopMs: 500,
  hopHeight: 0.6,
  attackMs: 700,
  impactAt: 0.6, // fraction of the attack clip at which the defender starts to fall
  dieMs: 700,
  promoteMs: 300,
  turnMs: 150,
} as const;

export const walkMs = (distance: number) =>
  Math.max(TIMING.walkMinMs, (distance / TIMING.walkSquaresPerSec) * 1000);

export const STAND_OFF = 0.7; // squares between attacker and defender during a fight

// fitAspect: the narrowest width/height at which `fov` still shows the whole board
export const CAMERA = {
  position: [0, 10, 9] as [number, number, number],
  fov: 36,
  fitAspect: 1.33,
  focusMs: 400,
  focusAmount: 0.45, // how far the camera travels from home toward a fight
  introMs: 1200,
  introScale: 1.6, // the opening descent starts this many times farther out than home
  checkmateMs: 1200,
};
