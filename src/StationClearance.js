import { LAB } from './LabLayout.js';
import { AIRLOCK, insideAirlockFootprint } from './AirlockLayout.js';

const TAU = Math.PI * 2;
const CLEARANCE = 1;
// Clearance includes the room wall thickness and the rail's tube radius.
export function insideLabFootprint(x, z, margin = CLEARANCE) {
  return x > LAB.left - margin && x < LAB.right + margin &&
    z > LAB.back - margin && z < LAB.front + margin;
}

export function insideStationStructure(x, z) {
  return insideLabFootprint(x,z) || insideAirlockFootprint(x,z);
}

// Exact circle/rectangle crossings, rather than deleting arbitrary segments.
// Angles use x=sin(angle)*radius, z=cos(angle)*radius.
export function clearStationArcs(radius, start = 0, end = TAU) {
  const cuts = [start, end];
  const candidates = [];
  for (const x of [LAB.left - CLEARANCE, LAB.right + CLEARANCE,
    AIRLOCK.x-AIRLOCK.halfWidth-CLEARANCE, AIRLOCK.x+AIRLOCK.halfWidth+CLEARANCE]) {
    if (Math.abs(x) <= radius) {
      const a = Math.asin(x / radius);
      candidates.push(a, Math.PI - a);
    }
  }
  for (const z of [LAB.back - CLEARANCE, LAB.front + CLEARANCE,
    AIRLOCK.innerZ-CLEARANCE, AIRLOCK.outerZ+CLEARANCE]) {
    if (Math.abs(z) <= radius) {
      const a = Math.acos(z / radius);
      candidates.push(a, -a);
    }
  }
  for (const angle of candidates) {
    for (let turn = Math.floor(start / TAU) - 1; turn <= Math.ceil(end / TAU) + 1; turn++) {
      const a = angle + turn * TAU;
      if (a > start && a < end) cuts.push(a);
    }
  }
  cuts.sort((a, b) => a - b);
  const arcs = [];
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i];
    const middle = (a + b) / 2;
    if (b - a < 1e-9 || insideStationStructure(Math.sin(middle) * radius, Math.cos(middle) * radius)) continue;
    const previous = arcs.at(-1);
    if (previous && Math.abs(previous[1] - a) < 1e-9) previous[1] = b;
    else arcs.push([a, b]);
  }
  return arcs;
}
