import * as THREE from 'three';
import { LUNAR_LANDING_PAD as PAD } from './LunarEnvironment.js';

export const ARRIVAL_DURATION = 19;
export const RETURN_ARRIVAL_DURATION = 5;
export const ARRIVAL_SKIP_DELAY = 3.5;
export const AIRLOCK_CUT = 16.7;
export const TOUCHDOWN_TIME = 16;

const ease = (time, a, b) => THREE.MathUtils.smoothstep(time, a, b);
const mix = THREE.MathUtils.lerp;
const interpolate = (a, b, amount) => a.map((value, i) => mix(value, b[i], amount));
const add = (a, b) => a.map((value, i) => value + b[i]);
const timeValue = time => Number.isFinite(time) ? THREE.MathUtils.clamp(time, 0, ARRIVAL_DURATION) : 0;

// Ease speed along one straight descending corridor, already aligned with the
// pad. One scalar drives all coordinates so interpolation cannot introduce drift.
function flightPosition(time, touchdownY) {
  const knots = [
    [0, 113], [2, 105], [5, 86], [8, 70], [11, 59],
    [14, 50.8], [TOUCHDOWN_TIME, PAD.z],
  ];
  if (time >= TOUCHDOWN_TIME) return [PAD.x, touchdownY, PAD.z];
  const next = knots.findIndex(([t]) => t > time);
  const i = Math.max(0, next - 1), duration = knots[i + 1][0] - knots[i][0];
  const u = (time - knots[i][0]) / duration;
  const slope = index => (knots[index + 1][1] - knots[index][1]) / (knots[index + 1][0] - knots[index][0]);
  const velocity = index => {
    if (index === knots.length - 1) return 0;
    if (index === 0) return slope(0);
    const before = slope(index - 1), after = slope(index);
    return before * after <= 0 ? 0 : 2 * before * after / (before + after);
  };
  const z = (2 * u ** 3 - 3 * u ** 2 + 1) * knots[i][1]
    + (u ** 3 - 2 * u ** 2 + u) * duration * velocity(i)
    + (-2 * u ** 3 + 3 * u ** 2) * knots[i + 1][1]
    + (u ** 3 - u ** 2) * duration * velocity(i + 1);
  const remaining = (z - PAD.z) / (knots[0][1] - PAD.z);
  return [PAD.x, mix(touchdownY, 22, remaining), z];
}

export function arrivalShot(seconds) {
  const t = timeValue(seconds);
  if (t < 2) return { stage: 'signal', label: '01 / INCOMING TRANSMISSION', caption: 'STATION 07 — Flight link acquired. Lunar surface approach.', controls: 'INCOMING PERSONNEL / INTERN' };
  if (t < 5) return { stage: 'approach', label: '02 / FINAL APPROACH', caption: 'FLIGHT — Habitat 07. Requesting approach clearance.', controls: 'YOUR FIRST SHIFT / 07:00' };
  if (t < 8) return { stage: 'track', label: '03 / HABITAT IN SIGHT', caption: 'SURFACE CONTROL — Corridor clear. Follow the pad beacons.', controls: 'WASD — MOVE' };
  if (t < 11) return { stage: 'reveal', label: '04 / LUNAR STATION 07', caption: 'FLIGHT — Base in sight. Reducing forward velocity.', controls: 'SHIFT — SPRINT' };
  if (t < 14) return { stage: 'braking', label: '05 / BRAKING BURN', caption: 'SURFACE CONTROL — Pad acquired. Gear down.', controls: 'MOUSE — LOOK' };
  if (t < AIRLOCK_CUT) return { stage: 'landing', label: t < TOUCHDOWN_TIME ? '06 / TERMINAL DESCENT' : '06 / CONTACT CONFIRMED', caption: t < TOUCHDOWN_TIME ? 'FLIGHT — Settling onto Pad 07.' : 'SURFACE CONTROL — Landing secure. Proceed to the habitat airlock.', controls: 'WELCOME TO THE MOON' };
  return { stage: 'airlock', label: '07 / PRESSURE EQUALIZED', caption: 'SUPERVISOR — Try not to touch anything important.', controls: 'YOUR FIRST SHIFT STARTS HERE' };
}

// Radius and angle keep the orbit clear of the hull, unlike blending camera
// positions through it. Shared Hermite tangents keep velocity continuous.
const CAMERA_KEYS = [
  [0,17,-.57,3.8,0,43], [5,18,.5,5.5,.06,46],
  [8,24,.75,8,.18,48], [11,21,1.35,6,.08,46],
  [14,17,2.28,4.5,0,43], [AIRLOCK_CUT,17,2.35,2.5,0,43],
];
function cameraTrack(time) {
  const i = Math.max(0,CAMERA_KEYS.findIndex(key=>key[0]>time)-1);
  const a=CAMERA_KEYS[i], b=CAMERA_KEYS[i+1], duration=b[0]-a[0], u=(time-a[0])/duration;
  return [1,2,3,4,5].map(axis=>{
    const slope=index=>(CAMERA_KEYS[index+1][axis]-CAMERA_KEYS[index][axis])/(CAMERA_KEYS[index+1][0]-CAMERA_KEYS[index][0]);
    const tangent=index=>{
      if(index===0 || index===CAMERA_KEYS.length-1) return 0;
      const before=slope(index-1),after=slope(index);
      return before*after<=0 ? 0 : 2*before*after/(before+after);
    };
    const value = (2*u**3-3*u**2+1)*a[axis]+(u**3-2*u**2+u)*duration*tangent(i)
      +(-2*u**3+3*u**2)*b[axis]+(u**3-u**2)*duration*tangent(i+1);
    return THREE.MathUtils.clamp(value,Math.min(a[axis],b[axis]),Math.max(a[axis],b[axis]));
  });
}

/** Pure sampling: no accumulated drift and no scene/input/timer mutation. */
export function sampleArrival(seconds, { touchdownY = 1.041, baseY = 0, short = false, handoverFov = 68 } = {}) {
  const t = timeValue(seconds);
  const craft = flightPosition(t, touchdownY);
  let cameraPosition, cameraTarget, fov;
  if (t < AIRLOCK_CUT) {
    const [radius, angle, height, baseBlend, lens] = cameraTrack(t);
    cameraPosition = add(craft, [Math.sin(angle)*radius, height, Math.cos(angle)*radius]);
    cameraTarget = interpolate(add(craft,[0,.4,0]),[PAD.x,8,15],baseBlend);
    fov = lens;
  } else {
    const p = ease(t, AIRLOCK_CUT, ARRIVAL_DURATION);
    cameraPosition = [-5.5, baseY + 1.7, mix(20.1, 18.8, p)];
    cameraTarget = [-5.5, baseY + 1.7, 9]; fov = mix(68,handoverFov,p);
  }
  const airlockProgress = short ? ease(t, 0, ARRIVAL_DURATION) : ease(t, AIRLOCK_CUT, ARRIVAL_DURATION);
  const shot = short ? arrivalShot(ARRIVAL_DURATION) : arrivalShot(t);
  if (short) {
    // Return visits/reduced motion use the airlock only, not 19 seconds of flight compressed into five.
    cameraPosition = [-5.5, baseY + 1.7, 18.8];
    cameraTarget = [-5.5, baseY + 1.7, 9]; fov = mix(68,handoverFov,airlockProgress);
  }
  return {
    ...shot, time: t, craftPosition: short ? [PAD.x, touchdownY, PAD.z] : craft,
    craftRotation: [0, 0, 0],
    cameraPosition, cameraTarget, fov,
    gear: short ? 1 : ease(t, 10.8, 13.4),
    mainThrust: short ? 0 : .76 * (1 - ease(t, 8, 13.2)),
    liftThrust: short ? 0 : .72 * ease(t, 6.8, 10.5) * (1 - ease(t, 15.2, TOUCHDOWN_TIME)),
    doorOpening: ease(airlockProgress, .12, .78),
    fade: short ? 1 - ease(t, 0, 1.8) : t < 2 ? 1 - ease(t, .4, 1.8)
      : t < AIRLOCK_CUT ? ease(t, 16.3, AIRLOCK_CUT) : 1 - ease(t, AIRLOCK_CUT, 17.2),
  };
}
