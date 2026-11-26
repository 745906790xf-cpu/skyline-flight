// The screenshot scenes behind ?shot=start|play|cockpit|end. Each one plays
// the real rules forward from a fresh world for a fixed time, steered by the
// autopilot, so the frame is what a short game really looks like and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { createState, stepFlight, autopilotInput, EVENT_OVER } from './world.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER } from './render.js';

const START_SECONDS = 3.5;
const PLAY_SECONDS = 26;
const COCKPIT_SECONDS = 34;
const END_LIMIT_SECONDS = 600;

/**
 * Stage the named scene from a fresh world and return the state to draw,
 * the screen to draw over it and the view to draw it in.
 */
export function stageShot(name, seed = 1) {
  const state = createState(seed);
  let screen = SCREEN_TITLE;
  let view = 'chase';
  if (name === 'play') {
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      stepFlight(state, autopilotInput(state), STEP);
      if (state.over) break;
    }
    screen = state.over ? SCREEN_OVER : SCREEN_PLAY;
  } else if (name === 'cockpit') {
    for (let i = 0; i < COCKPIT_SECONDS / STEP; i += 1) {
      stepFlight(state, autopilotInput(state), STEP);
      if (state.over) break;
    }
    screen = state.over ? SCREEN_OVER : SCREEN_PLAY;
    view = 'cockpit';
  } else if (name === 'end') {
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      stepFlight(state, autopilotInput(state), STEP);
      if (state.over) break;
    }
    screen = SCREEN_OVER;
  } else {
    // start: the takeoff roll and first climb, under the title screen.
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      stepFlight(state, autopilotInput(state), STEP);
      if (state.over) break;
    }
    screen = SCREEN_TITLE;
  }
  return { state, screen, view, best: 0 };
}
