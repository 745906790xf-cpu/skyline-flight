// Every tuning number and colour in one place. The view is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule below
// depends on the screen size.
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Metres per second at full throttle, and the speed below which the wing stops flying. */
export const SPEED = { cruise: 95, min: 42, max: 148, stall: 46 };

/** How fast the aircraft answers the stick, in radians per second of input. */
export const CONTROL = {
  pitchRate: 0.7,
  rollRate: 2.2,
  /** Heading follows bank: radians of turn per second at full bank. */
  turnRate: 0.8,
  /** Climb and sink, metres per second at full pitch. */
  climbRate: 26,
  /** Throttle eases toward its target this fast (per second). */
  throttleEase: 0.55,
  /** Speed eases toward the throttle's target this fast (per second). */
  speedEase: 0.35,
};

/** The course: one runway and eight rings to fly through, in order. */
export const COURSE = {
  runway: { x: 0, zStart: -60, zEnd: 300, width: 26 },
  ringRadius: 28,
  ringCount: 8,
  /** Rings sit along the course at these distances, lateral offsets and heights. */
  rings: [
    { z: 480, x: -70, y: 95 },
    { z: 900, x: 60, y: 130 },
    { z: 1320, x: -110, y: 105 },
    { z: 1760, x: 90, y: 165 },
    { z: 2200, x: -40, y: 120 },
    { z: 2650, x: 120, y: 175 },
    { z: 3100, x: -90, y: 140 },
    { z: 3560, x: 0, y: 110 },
  ],
  /** Points for a clean ring, and the bonus for finishing the whole course. */
  ringPoints: 100,
  courseBonus: 500,
};

export const SCORE = { ring: 100, bonus: 500, nearMiss: 25 };

export const PALETTE = {
  skyTop: '#2f6fb4',
  skyMid: '#7db3e2',
  skyHorizon: '#cfe6f5',
  sun: '#fff3c4',
  sunCore: '#fffbe8',
  cloud: '#ffffff',
  cloudShade: '#d7e5f2',
  grass: '#5d9b4a',
  grassDry: '#8aa653',
  field: '#b5a05e',
  forest: '#2f6b34',
  rock: '#8d8578',
  snow: '#eef3f6',
  water: '#3f7fb8',
  waterDeep: '#2c5f8f',
  runway: '#3a3f46',
  runwayEdge: '#f2f2ea',
  runwayMark: '#f5d90a',
  ring: '#ff7a1a',
  ringGlow: '#ffb066',
  ringDone: '#37d67a',
  jetBody: '#dfe6ee',
  jetBelly: '#9fb2c4',
  jetAccent: '#e8442e',
  jetGlass: '#1d3a52',
  jetFlame: '#ff9a3c',
  panel: '#20262e',
  panelEdge: '#39424d',
  instrument: '#0e151c',
  hud: '#eaf6ff',
  hudWarn: '#ffb02e',
  hudDanger: '#ff5a4e',
  text: '#f2f6f9',
  muted: '#b9c6d2',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'skyline-flight.best';
