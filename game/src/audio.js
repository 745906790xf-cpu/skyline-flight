// Tiny WebAudio synth: engine hum, a ring chime and a crash thud. No audio
// files, nothing fetched; silent until the player starts (browsers demand a
// gesture first), and silent in screenshot mode.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 52;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter).connect(engineGain).connect(context.destination);
      engineOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(frequency, seconds, type = 'sine', volume = 0.16) {
    if (!context || muted) return;
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + seconds);
      osc.connect(gain).connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + seconds);
    } catch {
      // Audio is decoration; never let it break the game.
    }
  }

  return {
    start() {
      if (!ensure()) return;
      if (context.state === 'suspended') context.resume().catch(() => {});
      if (engineGain) engineGain.gain.setTargetAtTime(muted ? 0 : 0.045, context.currentTime, 0.4);
    },
    engine(speed, throttle) {
      if (!context || !engineOsc || muted) return;
      engineOsc.frequency.setTargetAtTime(46 + speed * 0.55 + throttle * 22, context.currentTime, 0.1);
    },
    ring() {
      blip(880, 0.35);
      setTimeout(() => blip(1318, 0.4), 90);
    },
    crash() {
      blip(70, 0.5, 'triangle', 0.3);
      if (engineGain) engineGain.gain.setTargetAtTime(0, context.currentTime, 0.1);
    },
    click() {
      blip(660, 0.08, 'square', 0.08);
    },
    toggleMute() {
      muted = !muted;
      if (engineGain && context) engineGain.gain.setTargetAtTime(muted ? 0 : 0.045, context.currentTime, 0.1);
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
