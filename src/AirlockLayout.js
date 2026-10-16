// Shared world-space fitting for the arrival connector, station clearance and
// sealed habitat-side door. The lunar surface remains outside exploration.
export const AIRLOCK = Object.freeze({ x: -5.5, innerZ: 19.55, outerZ: 34.9, halfWidth: 2.8 });
export const AIRLOCK_DOOR_COLLIDER = Object.freeze({
  x: AIRLOCK.x, z: AIRLOCK.innerZ, halfX: AIRLOCK.halfWidth,
  halfZ: .18, cos: 1, sin: 0,
});
export function insideAirlockFootprint(x, z, margin = 1) {
  return x > AIRLOCK.x-AIRLOCK.halfWidth-margin && x < AIRLOCK.x+AIRLOCK.halfWidth+margin &&
    z > AIRLOCK.innerZ-margin && z < AIRLOCK.outerZ+margin;
}
