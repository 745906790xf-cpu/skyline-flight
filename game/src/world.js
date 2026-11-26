// The world: seeded terrain, one runway, eight rings, and the flight model
// that moves the aircraft through them. Everything here is pure simulation;
// render.js draws it.
import { COURSE, SPEED, CONTROL, STEP } from './config.js';
import { createRandom } from './random.js';

/** Event bits a step can return. */
export const EVENT_RING = 1;
export const EVENT_NEAR_MISS = 2;
export const EVENT_CRASH = 4;
export const EVENT_COURSE_DONE = 8;
export const EVENT_OVER = EVENT_CRASH | EVENT_COURSE_DONE;

/** A ridge of mountains far off, for the horizon silhouette. */
const RIDGE = [
  { at: -0.9, height: 240, width: 0.2 },
  { at: -0.55, height: 320, width: 0.18 },
  { at: -0.2, height: 190, width: 0.16 },
  { at: 0.15, height: 350, width: 0.22 },
  { at: 0.5, height: 230, width: 0.18 },
  { at: 0.85, height: 300, width: 0.2 },
];

/**
 * Terrain height in metres at world (x, z). Rolling hills from layered
 * sines, a lake basin to the east, mountains far out, and a flat apron
 * around the runway so takeoff and landing stay honest.
 */
export function terrainHeight(x, z) {
  const rolling =
    14 * Math.sin(x * 0.011 + 1.7) * Math.cos(z * 0.007 - 0.6) +
    9 * Math.sin(x * 0.023 - 0.4) * Math.sin(z * 0.013 + 2.1) +
    5 * Math.sin((x + z) * 0.031 + 0.9);
  const lake = -16 * Math.exp(-(((x - 260) / 150) ** 2 + ((z - 1900) / 420) ** 2));
  // Mountains stay off the course corridor: far to the sides, and past the
  // end of the course. The corridor itself never rises above ~35 m, so the
  // rings (95–175 m) are always clear of the ground.
  const mountains = 95 * Math.max(0, (Math.abs(x) - 620) / 420) ** 2 + 70 * Math.max(0, (z - 3900) / 500) ** 2;
  let h = rolling + lake + mountains;
  // Flat apron around the runway.
  const apron = Math.max(0, 1 - Math.max(Math.abs(x) / 90, (z - 120) / 320, (-z - 60) / 120));
  return h * (1 - apron) + 2 * apron;
}

/** Water where the lake basin dips below zero. */
export function isWater(x, z) {
  return terrainHeight(x, z) < 1.5;
}

export function ridgeAt(angle) {
  let h = 0;
  for (const peak of RIDGE) {
    const d = (angle - peak.at) / peak.width;
    h += peak.height * Math.exp(-d * d);
  }
  return h;
}

function ringState(def) {
  return { x: def.x, y: def.y, z: def.z, passed: false, missed: false };
}

/** A fresh flight, sitting on the runway threshold, engine idling. */
export function createState(seed = 1) {
  const random = createRandom(seed);
  const clouds = [];
  for (let i = 0; i < 46; i += 1) {
    clouds.push({
      x: (random() - 0.5) * 2600,
      y: 260 + random() * 120,
      z: 600 + random() * 3400,
      size: 60 + random() * 130,
    });
  }
  return {
    seed,
    time: 0,
    x: 0,
    y: terrainHeight(0, 0) + 2,
    z: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    score: 0,
    ringsPassed: 0,
    ringsTotal: COURSE.ringCount,
    nextRing: 0,
    rings: COURSE.rings.map(ringState),
    crashed: false,
    courseDone: false,
    over: false,
    message: '',
    messageAt: -99,
    clouds,
    nearMissAt: -99,
  };
}

/** The aircraft's next ring, or null once the course is done. */
export function nextRing(state) {
  return state.nextRing < state.rings.length ? state.rings[state.nextRing] : null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function showMessage(state, text) {
  state.message = text;
  state.messageAt = state.time;
}

/**
 * Advance the flight one fixed step. `input` is { pitch, roll, throttle }
 * with pitch/roll in [-1, 1] and throttle in [0, 1]. Returns event bits.
 */
export function stepFlight(state, input, dt = STEP) {
  if (state.over) return 0;
  state.time += dt;
  let events = 0;

  const targetSpeed = SPEED.min + (SPEED.max - SPEED.min) * clamp(input.throttle, 0, 1);
  state.throttle += (clamp(input.throttle, 0, 1) - state.throttle) * Math.min(1, CONTROL.throttleEase * dt);
  state.speed += (targetSpeed - state.speed) * Math.min(1, CONTROL.speedEase * dt);

  state.pitch = clamp(state.pitch + input.pitch * CONTROL.pitchRate * dt, -0.5, 0.5);
  state.roll = clamp(state.roll + input.roll * CONTROL.rollRate * dt, -1.1, 1.1);
  // Banking right (positive roll) turns the nose right (heading grows).
  state.heading += state.roll * CONTROL.turnRate * dt;

  const stalled = state.speed < SPEED.stall;
  const wasAirborne = state.y > terrainHeight(state.x, state.z) + 3;
  const climbRaw = Math.sin(state.pitch) * CONTROL.climbRate * (stalled ? 0.4 : 1) - (stalled ? 9 : 0);
  // Wheels on the ground cannot sink: the stall sink only bites once airborne.
  const climb = wasAirborne ? climbRaw : Math.max(0, climbRaw);
  state.verticalSpeed = climb;
  const forward = state.speed * Math.cos(state.pitch);
  state.x += Math.sin(state.heading) * forward * dt;
  state.z += Math.cos(state.heading) * forward * dt;
  state.y += climb * dt;

  // Gentle self-levelling when the stick is centred.
  if (input.roll === 0) state.roll *= Math.max(0, 1 - 0.9 * dt);
  if (input.pitch === 0) state.pitch *= Math.max(0, 1 - 0.5 * dt);

  // Ring checks: crossing the ring's plane inside its radius scores.
  const ring = nextRing(state);
  if (ring) {
    const prevZ = state.z - Math.cos(state.heading) * forward * dt;
    if (prevZ < ring.z && state.z >= ring.z) {
      const dx = state.x - ring.x;
      const dy = state.y - ring.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= COURSE.ringRadius) {
        ring.passed = true;
        state.ringsPassed += 1;
        state.nextRing += 1;
        state.score += COURSE.ringPoints;
        showMessage(state, `RING ${state.ringsPassed}/${state.ringsTotal}  +${COURSE.ringPoints}`);
        events |= EVENT_RING;
      } else if (dist <= COURSE.ringRadius + 26) {
        ring.missed = true;
        state.nextRing += 1;
        state.score += 25;
        showMessage(state, 'NEAR MISS  +25');
        events |= EVENT_NEAR_MISS;
        state.nearMissAt = state.time;
      } else {
        ring.missed = true;
        state.nextRing += 1;
        showMessage(state, 'RING MISSED');
      }
      if (state.nextRing >= state.rings.length) {
        state.courseDone = true;
        state.over = true;
        if (state.ringsPassed === state.ringsTotal) {
          state.score += COURSE.courseBonus;
          showMessage(state, `COURSE COMPLETE  +${COURSE.courseBonus}`);
        } else {
          showMessage(state, `COURSE DONE  ${state.ringsPassed}/${state.ringsTotal} RINGS`);
        }
        events |= EVENT_COURSE_DONE;
      }
    }
  }

  // Terrain: the stall sink never applies while the wheels are down, and a
  // gentle touchdown is a landing (or a rolling takeoff); a fast strike, or
  // a stalled fall onto the ground, ends the flight.
  const ground = terrainHeight(state.x, state.z);
  if (state.y <= ground + 2) {
    state.y = ground + 2;
    const onRunway = Math.abs(state.x) <= COURSE.runway.width / 2 && state.z >= COURSE.runway.zStart && state.z <= COURSE.runway.zEnd;
    const gentle = state.verticalSpeed > -4 && state.speed < 90;
    if ((!wasAirborne && onRunway) || gentle) {
      state.verticalSpeed = 0;
    } else {
      state.crashed = true;
      state.over = true;
      showMessage(state, 'CRASHED');
      events |= EVENT_CRASH;
    }
  }
  if (state.z > 4200 || state.z < -400 || Math.abs(state.x) > 1600) {
    state.crashed = true;
    state.over = true;
    showMessage(state, 'OUT OF AREA');
    events |= EVENT_CRASH;
  }
  return events;
}

/**
 * The autopilot the screenshot scenes use: steer toward the next ring (or
 * down the runway while taking off), keep the throttle up, and flare gently
 * when the course is done. Returns { pitch, roll, throttle }.
 */
export function autopilotInput(state) {
  const ring = nextRing(state);
  let targetX = 0;
  let targetY = state.y + 40;
  if (ring) {
    targetX = ring.x;
    targetY = ring.y;
  } else if (state.z < 300) {
    targetX = 0;
    targetY = 60;
  }
  const ahead = Math.max(30, state.speed * 1.6);
  // Velocity-damped pursuit: aim at the ring, but subtract the lateral
  // distance the current sideways speed will already cover, so the turn
  // unwinds instead of overshooting past the ring.
  const lateralError = targetX - state.x;
  const lateralSpeed = Math.sin(state.heading) * state.speed;
  const wantHeading = Math.atan2(lateralError - lateralSpeed * 0.5, Math.max(20, (ring ? ring.z : 300) - state.z));
  let headingError = wantHeading - state.heading;
  while (headingError > Math.PI) headingError -= 2 * Math.PI;
  while (headingError < -Math.PI) headingError += 2 * Math.PI;
  const wantRoll = clamp(headingError * 4.0, -1, 1);
  const heightError = targetY - state.y;
  const wantPitch = clamp(heightError / 60, -0.6, 0.6);
  return {
    pitch: clamp(wantPitch * 1.4 - state.pitch, -1, 1),
    roll: clamp((wantRoll - state.roll) * 2.6, -1, 1),
    throttle: state.z < 300 && state.speed < 60 ? 1 : 0.55,
  };
}
