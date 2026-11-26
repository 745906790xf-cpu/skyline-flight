// Keyboard and mouse input: arrows or WASD fly the aircraft, Shift is a
// throttle boost, C switches the view, Enter starts, R restarts, M mutes.
export function createInput() {
  const keys = new Set();
  const input = {
    pitch: 0,
    roll: 0,
    throttle: 0.7,
    viewToggle: false,
    startPressed: false,
    restartPressed: false,
    mutePressed: false,
    mouseX: 0,
    mouseActive: false,
  };

  function update() {
    const up = keys.has('ArrowUp') || keys.has('KeyW');
    const down = keys.has('ArrowDown') || keys.has('KeyS');
    const left = keys.has('ArrowLeft') || keys.has('KeyA');
    const right = keys.has('ArrowRight') || keys.has('KeyD');
    input.pitch = (up ? 1 : 0) - (down ? 1 : 0);
    input.roll = (right ? 1 : 0) - (left ? 1 : 0);
    let throttle = input.throttle;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) throttle = 1;
    if (keys.has('KeyX')) throttle = Math.max(0, throttle - 0.02);
    input.throttle = throttle;
  }

  function onKeyDown(event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === 'KeyC' && !event.repeat) input.viewToggle = true;
    if (event.code === 'Enter' && !event.repeat) input.startPressed = true;
    if (event.code === 'KeyR' && !event.repeat) input.restartPressed = true;
    if (event.code === 'KeyM' && !event.repeat) input.mutePressed = true;
    keys.add(event.code);
    update();
  }

  function onKeyUp(event) {
    keys.delete(event.code);
    update();
  }

  function onMouseMove(event) {
    input.mouseX = event.clientX / window.innerWidth - 0.5;
    input.mouseActive = true;
  }

  function onMouseDown(event) {
    if (event.button === 0) input.startPressed = true;
  }

  function attach(target) {
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('mousemove', onMouseMove);
    target.addEventListener('mousedown', onMouseDown);
  }

  function detach(target) {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('mousemove', onMouseMove);
    target.removeEventListener('mousedown', onMouseDown);
  }

  /** Read the stick once and clear the edge-triggered flags. */
  function poll() {
    const snapshot = {
      pitch: input.pitch,
      roll: input.roll,
      throttle: input.throttle,
      viewToggle: input.viewToggle,
      startPressed: input.startPressed,
      restartPressed: input.restartPressed,
      mutePressed: input.mutePressed,
    };
    input.viewToggle = false;
    input.startPressed = false;
    input.restartPressed = false;
    input.mutePressed = false;
    // Mouse steering: a gentle roll toward the pointer when it is held still.
    if (input.mouseActive && snapshot.roll === 0 && Math.abs(input.mouseX) > 0.12) {
      snapshot.roll = Math.max(-1, Math.min(1, input.mouseX * 1.6));
    }
    return snapshot;
  }

  return { input, attach, detach, poll };
}
