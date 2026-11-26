// The renderer: sky, sun, clouds, ridge silhouette, a perspective terrain
// mesh, the runway, the glowing rings, the jet (chase view) or the
// instrument panel (cockpit view), and the HUD. All drawing is Canvas 2D,
// all colours come from config.js, nothing is fetched.
import { VIEW, PALETTE, FONT, COURSE, SPEED } from './config.js';
import { terrainHeight, isWater, ridgeAt, nextRing } from './world.js';

const FOCAL = (VIEW.height / 2) / Math.tan((68 * Math.PI) / 360);
const CX = VIEW.width / 2;
const CY = VIEW.height / 2;

/** Parse #rrggbb into [r, g, b]. */
function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function mix(a, b, t) {
  const ca = rgb(a);
  const cb = rgb(b);
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * t)},${Math.round(ca[1] + (cb[1] - ca[1]) * t)},${Math.round(ca[2] + (cb[2] - ca[2]) * t)})`;
}

/** Deterministic patchiness for one terrain cell. */
function cellHash(ix, iz) {
  const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** A camera: position, forward/right/up basis (roll applied), focal length. */
function makeCamera(state, view) {
  const heading = state.heading;
  const pitch = state.pitch;
  const f = {
    x: Math.sin(heading) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: Math.cos(heading) * Math.cos(pitch),
  };
  let r = { x: Math.cos(heading), y: 0, z: -Math.sin(heading) };
  const roll = view === 'cockpit' ? state.roll : state.roll * 0.55;
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  // Rotate right and up around forward by the roll angle.
  const u0 = { x: f.y * r.z - f.z * r.y, y: f.z * r.x - f.x * r.z, z: f.x * r.y - f.y * r.x };
  const u = {
    x: u0.x * cosR - r.x * sinR,
    y: u0.y * cosR - r.y * sinR,
    z: u0.z * cosR - r.z * sinR,
  };
  r = {
    x: r.x * cosR + u0.x * sinR,
    y: r.y * cosR + u0.y * sinR,
    z: r.z * cosR + u0.z * sinR,
  };
  const pos =
    view === 'cockpit'
      ? { x: state.x + f.x * 2, y: state.y + 1.4, z: state.z + f.z * 2 }
      : { x: state.x - f.x * 26, y: state.y + 7 - Math.sin(pitch) * 10, z: state.z - f.z * 26 };
  return { pos, f, r, u, pitch };
}

function project(camera, p) {
  const dx = p.x - camera.pos.x;
  const dy = p.y - camera.pos.y;
  const dz = p.z - camera.pos.z;
  const z = dx * camera.f.x + dy * camera.f.y + dz * camera.f.z;
  if (z < 2) return null;
  const x = dx * camera.r.x + dy * camera.r.y + dz * camera.r.z;
  const y = dx * camera.u.x + dy * camera.u.y + dz * camera.u.z;
  return { x: CX + (x / z) * FOCAL, y: CY - (y / z) * FOCAL, z, scale: FOCAL / z };
}

function drawSky(ctx, camera, state) {
  const horizonY = CY + Math.tan(camera.pitch) * FOCAL;
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.45, PALETTE.skyMid);
  grad.addColorStop(0.62, PALETTE.skyHorizon);
  grad.addColorStop(1, '#5d8a52');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  // Sun: fixed in the world to the south-west, high up.
  const sunDir = { x: -0.45, y: 0.5, z: 0.75 };
  const sp = project(camera, {
    x: camera.pos.x + sunDir.x * 2000,
    y: camera.pos.y + sunDir.y * 2000,
    z: camera.pos.z + sunDir.z * 2000,
  });
  if (sp) {
    const glow = ctx.createRadialGradient(sp.x, sp.y, 4, sp.x, sp.y, 130);
    glow.addColorStop(0, PALETTE.sunCore);
    glow.addColorStop(0.25, PALETTE.sun);
    glow.addColorStop(1, 'rgba(255,243,196,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sp.x - 140, sp.y - 140, 280, 280);
  }
  // Distant ridge silhouette along the horizon.
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let sx = 0; sx <= VIEW.width; sx += 16) {
    const offset = ((sx - CX) / FOCAL) * 0.9;
    const angle = state.heading + offset;
    const h = ridgeAt(angle);
    ctx.lineTo(sx, horizonY - h * 0.2);
  }
  ctx.lineTo(VIEW.width, horizonY);
  ctx.closePath();
  ctx.fillStyle = mix(PALETTE.skyHorizon, '#8ba3b8', 0.35);
  ctx.fill();
  return horizonY;
}

function drawClouds(ctx, camera, state) {
  ctx.save();
  for (const cloud of state.clouds) {
    const p = project(camera, cloud);
    if (!p || p.z > 2600) continue;
    const w = cloud.size * p.scale * 1.6;
    const h = w * 0.36;
    const alpha = Math.max(0, Math.min(0.9, 1.15 - p.z / 2200));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PALETTE.cloud;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, w, h, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - w * 0.45, p.y + h * 0.25, w * 0.6, h * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + w * 0.45, p.y + h * 0.25, w * 0.6, h * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.cloudShade;
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + h * 0.35, w * 0.9, h * 0.45, 0, 0, Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

function terrainColor(x, z, h) {
  if (h < 1.5) return Math.sin(x * 0.05 + z * 0.03) > 0 ? PALETTE.water : PALETTE.waterDeep;
  if (h > 105) return PALETTE.snow;
  if (h > 62) return PALETTE.rock;
  const ix = Math.floor(x / 90);
  const iz = Math.floor(z / 90);
  const v = cellHash(ix, iz);
  if (v < 0.22) return PALETTE.forest;
  if (v < 0.45) return PALETTE.field;
  if (v < 0.6) return PALETTE.grassDry;
  return PALETTE.grass;
}

function drawTerrain(ctx, camera, state) {
  const rows = [];
  let d = 14;
  while (d < 950) {
    rows.push(d);
    d *= 1.22;
  }
  const cols = 26;
  const halfWidth = 420;
  // Project the whole mesh once, far rows first.
  for (let ri = rows.length - 1; ri >= 0; ri -= 1) {
    const d0 = rows[ri];
    const d1 = rows[ri + 1] ?? d0 * 1.22;
    for (let ci = 0; ci < cols; ci += 1) {
      const fx0 = -halfWidth + (ci / cols) * halfWidth * 2;
      const fx1 = -halfWidth + ((ci + 1) / cols) * halfWidth * 2;
      const quad = [];
      for (const [fx, fd] of [
        [fx0, d0],
        [fx1, d0],
        [fx1, d1],
        [fx0, d1],
      ]) {
        const wx = camera.pos.x + camera.f.x * fd + camera.r.x * fx;
        const wz = camera.pos.z + camera.f.z * fd + camera.r.z * fx;
        const wy = terrainHeight(wx, wz);
        quad.push(project(camera, { x: wx, y: wy, z: wz }));
      }
      if (quad.some((p) => p === null)) continue;
      const midX = camera.pos.x + camera.f.x * ((d0 + d1) / 2);
      const midZ = camera.pos.z + camera.f.z * ((d0 + d1) / 2);
      const h = terrainHeight(midX, midZ);
      const haze = Math.min(0.85, (d0 / 950) * 0.9);
      ctx.fillStyle = mix(terrainColor(midX, midZ, h), PALETTE.skyHorizon, haze);
      ctx.beginPath();
      ctx.moveTo(quad[0].x, quad[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(quad[i].x, quad[i].y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRunway(ctx, camera) {
  const { x, zStart, zEnd, width } = COURSE.runway;
  const half = width / 2;
  const steps = 12;
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i += 1) {
    const z = zStart + ((zEnd - zStart) * i) / steps;
    const y = terrainHeight(x, z) + 0.4;
    left.push(project(camera, { x: x - half, y, z }));
    right.push(project(camera, { x: x + half, y, z }));
  }
  if (left.some((p) => p === null) || right.some((p) => p === null)) return;
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left) ctx.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = PALETTE.runway;
  ctx.fill();
  // Edge lines and centre dashes.
  ctx.strokeStyle = PALETTE.runwayEdge;
  ctx.lineWidth = 2;
  for (const side of [left, right]) {
    ctx.beginPath();
    ctx.moveTo(side[0].x, side[0].y);
    for (const p of side) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.strokeStyle = PALETTE.runwayMark;
  ctx.lineWidth = 3;
  for (let i = 1; i < steps; i += 2) {
    const a = project(camera, { x, y: terrainHeight(x, zStart + ((zEnd - zStart) * i) / steps) + 0.5, z: zStart + ((zEnd - zStart) * i) / steps });
    const b = project(camera, { x, y: terrainHeight(x, zStart + ((zEnd - zStart) * (i + 0.7)) / steps) + 0.5, z: zStart + ((zEnd - zStart) * (i + 0.7)) / steps });
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // Threshold bars at the near end.
  const t = project(camera, { x, y: terrainHeight(x, zStart + 8) + 0.5, z: zStart + 8 });
  if (t) {
    ctx.fillStyle = PALETTE.runwayEdge;
    ctx.font = `bold ${Math.max(10, 26 * t.scale)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('09', t.x, t.y);
  }
}

function drawRings(ctx, camera, state, time) {
  const ring = nextRing(state);
  for (let i = state.rings.length - 1; i >= 0; i -= 1) {
    const r = state.rings[i];
    if (r.passed) continue;
    const centre = project(camera, { x: r.x, y: r.y, z: r.z });
    if (!centre) continue;
    const radius = COURSE.ringRadius * centre.scale;
    if (radius < 3 || radius > 900) continue;
    const isNext = ring === r;
    const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.55;
    ctx.save();
    ctx.globalAlpha = Math.max(0.25, Math.min(1, pulse + 0.45 - centre.z / 2600));
    ctx.strokeStyle = isNext ? PALETTE.ring : PALETTE.ringGlow;
    ctx.lineWidth = Math.max(2, radius * 0.09);
    ctx.shadowColor = PALETTE.ring;
    ctx.shadowBlur = isNext ? 22 : 8;
    ctx.beginPath();
    // The ring faces the course: an ellipse squashed by the viewing angle.
    const squash = Math.max(0.25, Math.abs(Math.cos(state.heading)));
    ctx.ellipse(centre.x, centre.y, radius, radius * (0.55 + 0.45 * squash), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (isNext && centre.z < 900) {
      const dist = Math.round(centre.z);
      ctx.fillStyle = PALETTE.hud;
      ctx.font = `bold ${Math.max(13, 15)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${state.nextRing + 1} · ${dist}m`, centre.x, centre.y + radius + 26);
    }
  }
}

function drawJet(ctx, state, time) {
  const x = CX;
  const y = VIEW.height * 0.66;
  const s = 1;
  const roll = state.roll;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-roll * 0.9);
  ctx.scale(s, s);
  // Engine glow.
  const flicker = 0.7 + 0.3 * Math.sin(time * 31) * Math.sin(time * 17);
  const flame = ctx.createLinearGradient(0, 26, 0, 26 + 42 * flicker);
  flame.addColorStop(0, 'rgba(255,180,60,0.95)');
  flame.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-7, 26);
  ctx.lineTo(7, 26);
  ctx.lineTo(0, 26 + 44 * flicker);
  ctx.closePath();
  ctx.fill();
  // Wings: swept, with red tips.
  ctx.fillStyle = PALETTE.jetBody;
  ctx.beginPath();
  ctx.moveTo(-14, 6);
  ctx.lineTo(-118, 34);
  ctx.lineTo(-112, 44);
  ctx.lineTo(-10, 22);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, 6);
  ctx.lineTo(118, 34);
  ctx.lineTo(112, 44);
  ctx.lineTo(10, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.jetAccent;
  ctx.fillRect(-118, 32, 10, 10);
  ctx.fillRect(108, 32, 10, 10);
  // Tail fins.
  ctx.fillStyle = PALETTE.jetBelly;
  ctx.beginPath();
  ctx.moveTo(-8, -6);
  ctx.lineTo(-26, -34);
  ctx.lineTo(-14, -34);
  ctx.lineTo(2, -10);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, -6);
  ctx.lineTo(26, -34);
  ctx.lineTo(14, -34);
  ctx.lineTo(-2, -10);
  ctx.closePath();
  ctx.fill();
  // Fuselage.
  const body = ctx.createLinearGradient(-16, 0, 16, 0);
  body.addColorStop(0, PALETTE.jetBelly);
  body.addColorStop(0.5, PALETTE.jetBody);
  body.addColorStop(1, PALETTE.jetBelly);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -72);
  ctx.quadraticCurveTo(13, -40, 15, -4);
  ctx.lineTo(13, 30);
  ctx.quadraticCurveTo(0, 38, -13, 30);
  ctx.lineTo(-15, -4);
  ctx.quadraticCurveTo(-13, -40, 0, -72);
  ctx.fill();
  // Canopy.
  ctx.fillStyle = PALETTE.jetGlass;
  ctx.beginPath();
  ctx.ellipse(0, -44, 8, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-2, -50, 3, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Red cheatline.
  ctx.fillStyle = PALETTE.jetAccent;
  ctx.fillRect(-14, -8, 28, 4);
  // Nav lights.
  ctx.fillStyle = '#ff4b4b';
  ctx.beginPath();
  ctx.arc(-118, 38, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#37d67a';
  ctx.beginPath();
  ctx.arc(118, 38, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx, state, view) {
  const kmh = Math.round(state.speed * 3.6);
  const alt = Math.max(0, Math.round(state.y - terrainHeight(state.x, state.z)));
  const hdg = Math.round(((state.heading * 180) / Math.PI % 360 + 360) % 360);
  ctx.save();
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'left';
  // Top-left: flight data.
  ctx.fillStyle = 'rgba(10,18,26,0.55)';
  ctx.fillRect(18, 16, 250, 108);
  ctx.strokeStyle = 'rgba(234,246,255,0.35)';
  ctx.strokeRect(18, 16, 250, 108);
  ctx.fillStyle = PALETTE.hud;
  ctx.fillText('ALT', 30, 40);
  ctx.fillText('SPD', 30, 66);
  ctx.fillText('HDG', 30, 92);
  ctx.textAlign = 'right';
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText(`${alt} m`, 256, 42);
  ctx.fillText(`${kmh} km/h`, 256, 68);
  ctx.fillText(`${String(hdg).padStart(3, '0')}°`, 256, 94);
  ctx.textAlign = 'left';
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillStyle = state.verticalSpeed >= 0 ? '#8fe3a0' : '#ffb02e';
  ctx.fillText(`V/S ${state.verticalSpeed >= 0 ? '+' : ''}${state.verticalSpeed.toFixed(1)} m/s`, 30, 114);
  // Top-right: score.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(10,18,26,0.55)';
  ctx.fillRect(VIEW.width - 268, 16, 250, 108);
  ctx.strokeStyle = 'rgba(234,246,255,0.35)';
  ctx.strokeRect(VIEW.width - 268, 16, 250, 108);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = `bold 15px ${FONT}`;
  ctx.fillText('SCORE', VIEW.width - 150, 40);
  ctx.fillText('RINGS', VIEW.width - 150, 66);
  ctx.fillText('TIME', VIEW.width - 150, 92);
  ctx.font = `bold 22px ${FONT}`;
  ctx.fillText(String(state.score), VIEW.width - 30, 42);
  ctx.fillText(`${state.ringsPassed}/${state.ringsTotal}`, VIEW.width - 30, 68);
  const mm = Math.floor(state.time / 60);
  const ss = Math.floor(state.time % 60);
  ctx.fillText(`${mm}:${String(ss).padStart(2, '0')}`, VIEW.width - 30, 94);
  // Bottom-left: throttle.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(10,18,26,0.55)';
  ctx.fillRect(18, VIEW.height - 58, 250, 40);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = `bold 13px ${FONT}`;
  ctx.fillText('THR', 30, VIEW.height - 32);
  ctx.fillStyle = '#22303c';
  ctx.fillRect(78, VIEW.height - 44, 176, 14);
  ctx.fillStyle = state.throttle > 0.9 ? PALETTE.jetFlame : '#57b6e8';
  ctx.fillRect(78, VIEW.height - 44, 176 * state.throttle, 14);
  // Centre: flight-path marker and pitch ladder.
  const ladder = [-20, -10, 10, 20];
  ctx.strokeStyle = 'rgba(234,246,255,0.75)';
  ctx.lineWidth = 2;
  for (const deg of ladder) {
    const dy = Math.tan((deg * Math.PI) / 180) * FOCAL * 0.5;
    const y = CY - state.pitch * FOCAL + dy;
    ctx.beginPath();
    ctx.moveTo(CX - 34, y);
    ctx.lineTo(CX - 12, y);
    ctx.moveTo(CX + 12, y);
    ctx.lineTo(CX + 34, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(CX, CY - state.pitch * FOCAL, 9, 0, Math.PI * 2);
  ctx.stroke();
  // Warnings.
  const ground = terrainHeight(state.x, state.z);
  const low = state.y - ground < 22 && state.verticalSpeed < 0;
  const stalled = state.speed < SPEED.stall + 4;
  if ((low || stalled) && !state.over) {
    ctx.textAlign = 'center';
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillStyle = low ? PALETTE.hudDanger : PALETTE.hudWarn;
    ctx.fillText(low ? '⚠ PULL UP' : '⚠ STALL — ADD THROTTLE', CX, 168);
  }
  // Fresh message banner.
  if (state.message && state.time - state.messageAt < 3) {
    ctx.textAlign = 'center';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText(state.message, CX, 208);
  }
  ctx.restore();
}

function drawCockpit(ctx, state) {
  // Canopy frame.
  ctx.save();
  ctx.strokeStyle = '#141a20';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(0, VIEW.height * 0.42);
  ctx.quadraticCurveTo(CX, -60, VIEW.width, VIEW.height * 0.42);
  ctx.stroke();
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(CX - 130, 0);
  ctx.lineTo(CX - 90, VIEW.height * 0.3);
  ctx.moveTo(CX + 130, 0);
  ctx.lineTo(CX + 90, VIEW.height * 0.3);
  ctx.stroke();
  // Instrument panel.
  const panelY = VIEW.height * 0.68;
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, panelY, VIEW.width, VIEW.height - panelY);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(0, panelY, VIEW.width, 4);
  // Artificial horizon.
  const hx = CX;
  const hy = panelY + (VIEW.height - panelY) / 2;
  const hr = 78;
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(hx, hy);
  ctx.rotate(-state.roll);
  const horizonShift = state.pitch * 120;
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-hr, -hr + horizonShift, hr * 2, hr - horizonShift);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-hr, horizonShift, hr * 2, hr - horizonShift + 1);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-hr, horizonShift);
  ctx.lineTo(hr, horizonShift);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(hx, hy, hr, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed wings marker on the horizon gauge.
  ctx.fillStyle = '#ffd23e';
  ctx.beginPath();
  ctx.moveTo(hx - 46, hy);
  ctx.lineTo(hx - 14, hy);
  ctx.lineTo(hx - 14, hy + 6);
  ctx.lineTo(hx - 46, hy + 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(hx + 46, hy);
  ctx.lineTo(hx + 14, hy);
  ctx.lineTo(hx + 14, hy + 6);
  ctx.lineTo(hx + 46, hy + 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hx, hy, 4, 0, Math.PI * 2);
  ctx.fill();
  // Altimeter and airspeed dials.
  const dial = (dx, label, value, unit) => {
    const x = hx + dx;
    ctx.fillStyle = PALETTE.instrument;
    ctx.beginPath();
    ctx.arc(x, hy, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = PALETTE.hud;
    ctx.textAlign = 'center';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(String(value), x, hy + 4);
    ctx.font = `bold 12px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(label, x, hy - 30);
    ctx.fillText(unit, x, hy + 32);
  };
  const alt = Math.max(0, Math.round(state.y - terrainHeight(state.x, state.z)));
  dial(-260, 'ALT', alt, 'm');
  dial(260, 'SPD', Math.round(state.speed * 3.6), 'km/h');
  // Compass strip.
  const hdg = Math.round(((state.heading * 180) / Math.PI % 360 + 360) % 360);
  ctx.fillStyle = PALETTE.instrument;
  ctx.fillRect(CX - 180, panelY + 14, 360, 26);
  ctx.fillStyle = PALETTE.hud;
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(`HDG ${String(hdg).padStart(3, '0')}°`, CX, panelY + 33);
  ctx.restore();
}

function drawTitle(ctx, state, best) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,14,22,0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 64px ${FONT}`;
  ctx.fillText('SKYLINE FLIGHT', CX, 190);
  ctx.font = `bold 24px ${FONT}`;
  ctx.fillStyle = PALETTE.hud;
  ctx.fillText('Fly the rings. Mind the mountains. Land the course.', CX, 236);
  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('↑ ↓ pitch      ← → bank & turn      SHIFT full throttle      C cockpit view', CX, 300);
  ctx.fillText('Mouse steers too. Fly through all 8 glowing rings to finish.', CX, 332);
  if (best > 0) {
    ctx.fillStyle = '#ffd23e';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText(`BEST SCORE  ${best}`, CX, 384);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 26px ${FONT}`;
  const blink = Math.floor(state.time * 1.6) % 2 === 0;
  if (blink) ctx.fillText('— PRESS ENTER OR CLICK TO FLY —', CX, 452);
  ctx.restore();
}

function drawOver(ctx, state, best) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,14,22,0.55)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  const done = state.courseDone;
  ctx.fillStyle = done ? '#37d67a' : PALETTE.hudDanger;
  ctx.font = `bold 56px ${FONT}`;
  ctx.fillText(done ? 'COURSE COMPLETE' : state.message === 'LANDED' ? 'LANDED' : 'CRASHED', CX, 220);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText(`SCORE  ${state.score}     RINGS  ${state.ringsPassed}/${state.ringsTotal}`, CX, 290);
  if (state.score > best) {
    ctx.fillStyle = '#ffd23e';
    ctx.font = `bold 22px ${FONT}`;
    ctx.fillText('NEW BEST SCORE', CX, 336);
  } else if (best > 0) {
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `20px ${FONT}`;
    ctx.fillText(`BEST  ${best}`, CX, 336);
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 24px ${FONT}`;
  const blink = Math.floor(state.time * 1.6) % 2 === 0;
  if (blink) ctx.fillText('— PRESS R TO FLY AGAIN —', CX, 420);
  ctx.restore();
}

/** The screen the frame belongs to: title, play, or over. */
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_OVER = 'over';

export function render(ctx, state, screen, view, best) {
  const camera = makeCamera(state, view);
  const horizonY = drawSky(ctx, camera, state);
  drawClouds(ctx, camera, state);
  drawTerrain(ctx, camera, state);
  drawRunway(ctx, camera);
  drawRings(ctx, camera, state, state.time);
  if (screen === SCREEN_PLAY) {
    if (view === 'chase') drawJet(ctx, state, state.time);
    if (view === 'cockpit') drawCockpit(ctx, state);
    drawHud(ctx, state, view);
  } else if (screen === SCREEN_TITLE) {
    if (view === 'chase') drawJet(ctx, state, state.time);
    drawTitle(ctx, state, best);
  } else {
    drawOver(ctx, state, best);
  }
  return horizonY;
}
