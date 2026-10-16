const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

export function dialogueSafeBounds(width, height) {
  const inset = Math.min(16, width * .04), top = Math.min(94, height * .18), bottom = Math.min(62, height * .12);
  return { x: inset, y: top, width: Math.max(0, width - inset * 2), height: Math.max(0, height - top - bottom) };
}

/** Intercom/radio messages retain their dock and move only to avoid reserved HUD space. */
export function placeDockedDialogue({ x, y, width, height, viewportWidth, viewportHeight, obstacles = [] }) {
  if (![x,y,width,height,viewportWidth,viewportHeight].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const safe = dialogueSafeBounds(viewportWidth, viewportHeight), gap = 8;
  if (width > safe.width || height > safe.height) return null;
  const right = safe.x + safe.width - width, bottom = safe.y + safe.height - height;
  const xs = new Set([clamp(x,safe.x,right),safe.x,right]), ys = new Set([clamp(y,safe.y,bottom),safe.y,bottom]);
  for (const obstacle of obstacles) {
    xs.add(clamp(obstacle.x-width-gap,safe.x,right));xs.add(clamp(obstacle.x+obstacle.width+gap,safe.x,right));
    ys.add(clamp(obstacle.y-height-gap,safe.y,bottom));ys.add(clamp(obstacle.y+obstacle.height+gap,safe.y,bottom));
  }
  const reserved = obstacles.map(obstacle=>({x:obstacle.x-gap,y:obstacle.y-gap,width:obstacle.width+gap*2,height:obstacle.height+gap*2}));
  let best = null, score = Infinity;
  // Bounded by the small, fixed HUD selector list; no world-space projection or global search.
  for (const candidateX of xs) for (const candidateY of ys) {
    const rectangle = { x:candidateX, y:candidateY, width, height, covered:0 };
    if (reserved.some(obstacle=>overlap(rectangle,obstacle)>0)) continue;
    const distance = Math.abs(candidateX-x)*1.25 + Math.abs(candidateY-y);
    if (distance < score) { best = rectangle; score = distance; }
  }
  return best;
}

/** All arguments/results are root-relative CSS pixels, independent of DPR. */
export function placeDialogue({ anchorX, anchorY, width, height, viewportWidth, viewportHeight, obstacles = [], previousSide = null }) {
  if (![anchorX,anchorY,width,height,viewportWidth,viewportHeight].every(Number.isFinite) || width <= 0 || height <= 0 ||
      anchorX < 0 || anchorY < 0 || anchorX > viewportWidth || anchorY > viewportHeight) return null;
  const safe = dialogueSafeBounds(viewportWidth, viewportHeight);
  if (width > safe.width || height > safe.height) return null;
  const gap = 14;
  const candidates = [
    ['above', anchorX - width / 2, anchorY - height - gap],
    ['below', anchorX - width / 2, anchorY + gap],
    ['left', anchorX - width - gap, anchorY - height / 2],
    ['right', anchorX + gap, anchorY - height / 2],
  ];
  let best = null, bestScore = Infinity;
  const evaluate = ([side, targetX, targetY, idealX = targetX, idealY = targetY]) => {
    const x = clamp(targetX, safe.x, safe.x + safe.width - width), y = clamp(targetY, safe.y, safe.y + safe.height - height);
    const rectangle = { x, y, width, height };
    const covered = obstacles.reduce((sum, obstacle) => sum + overlap(rectangle, obstacle), 0);
    const contains = anchorX > x && anchorX < x + width && anchorY > y && anchorY < y + height;
    const score = covered * 10 + (contains ? width * height * 2 : 0) + Math.abs(x - idealX) + Math.abs(y - idealY) +
      (previousSide && previousSide !== side ? 24 : 0) + (side === 'above' ? 0 : 4);
    if (score < bestScore) { bestScore = score; best = { ...rectangle, side, covered, idealX, idealY }; }
  };
  for (const candidate of candidates) evaluate(candidate);
  // Usually the four local positions suffice. Only when HUD overlaps remain,
  // make up to three small edge corrections, without a global layout search.
  for (let pass = 0; pass < 3 && best.covered > 0; pass++) {
    const current = best;
    for (const obstacle of obstacles) {
      if (!overlap(current, obstacle)) continue;
      const base = [current.idealX, current.idealY];
      evaluate([current.side, obstacle.x - width - 8, current.y, ...base]);
      evaluate([current.side, obstacle.x + obstacle.width + 8, current.y, ...base]);
      evaluate([current.side, current.x, obstacle.y - height - 8, ...base]);
      evaluate([current.side, current.x, obstacle.y + obstacle.height + 8, ...base]);
    }
  }
  const ax = anchorX - best.x, ay = anchorY - best.y;
  let edge;
  if (ay <= 0) edge = 'top';
  else if (ay >= height) edge = 'bottom';
  else if (ax <= 0) edge = 'left';
  else if (ax >= width) edge = 'right';
  else return { ...best, tail: null };
  const horizontal = edge === 'top' || edge === 'bottom';
  const corner = Math.min(24, (horizontal ? width : height) / 3);
  const baseX = horizontal ? clamp(ax, corner, width - corner) : edge === 'left' ? 1 : width - 1;
  const baseY = horizontal ? edge === 'top' ? 1 : height - 1 : clamp(ay, corner, height - corner);
  const dx = ax - baseX, dy = ay - baseY, length = Math.hypot(dx, dy) || 1;
  best.tail = { edge, baseX, baseY, tipX: baseX + dx / length * Math.min(18, length), tipY: baseY + dy / length * Math.min(18, length) };
  return best;
}

export function relativeRectangle(rectangle, root) {
  const width = rectangle.width ?? rectangle.right - rectangle.left, height = rectangle.height ?? rectangle.bottom - rectangle.top;
  if (![rectangle.left,rectangle.top,width,height,root.left,root.top].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x: rectangle.left - root.left, y: rectangle.top - root.top, width, height };
}
