// Skyline Flight: fly the rings. Boot, the fixed-step loop, the screen
// state machine, and the deterministic ?shot= scenes the screenshots use.
import { VIEW, STEP, BEST_KEY } from './config.js';
import { createState, stepFlight, EVENT_RING, EVENT_CRASH, EVENT_OVER } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { render, SCREEN_TITLE, SCREEN_PLAY, SCREEN_OVER } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Best score is a nicety; the game plays on without it.
  }
}

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') || 1);

const input = createInput();
input.attach(window);
const audio = createAudio();

let state = createState(seed);
let screen = SCREEN_TITLE;
let view = 'chase';
let best = readBest();
let last = performance.now();
let accumulator = 0;

function startFlight() {
  state = createState(seed);
  screen = SCREEN_PLAY;
  audio.start();
  audio.click();
}

function finishFlight() {
  screen = SCREEN_OVER;
  if (state.score > best) {
    best = state.score;
    saveBest(best);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const pressed = input.poll();
  if (pressed.viewToggle) view = view === 'chase' ? 'cockpit' : 'chase';
  if (pressed.mutePressed) audio.toggleMute();
  if (pressed.restartPressed && screen !== SCREEN_TITLE) startFlight();
  if (pressed.startPressed && screen === SCREEN_TITLE) startFlight();

  if (screen === SCREEN_PLAY) {
    accumulator += dt;
    while (accumulator >= STEP) {
      accumulator -= STEP;
      const live = input.poll();
      const events = stepFlight(state, { pitch: live.pitch, roll: live.roll, throttle: live.throttle }, STEP);
      if (events & EVENT_RING) audio.ring();
      if (events & EVENT_CRASH) audio.crash();
      if (events & EVENT_OVER) finishFlight();
    }
    audio.engine(state.speed, state.throttle);
  } else {
    // The title and game-over scenes keep the world alive behind the panel:
    // the jet idles on the runway, its flame flickering.
    state.time += dt;
  }
  render(ctx, state, screen, view, best);
}

if (shotName) {
  // Screenshot mode: stage the scene, draw one frame, stop. No audio, no
  // loop, no input: the frame is exactly what the game looks like.
  const staged = stageShot(shotName, seed);
  state = staged.state;
  screen = staged.screen;
  view = staged.view;
  render(ctx, state, screen, view, staged.best);
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
