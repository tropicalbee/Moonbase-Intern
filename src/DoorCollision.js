// Horizontal collision boxes follow the actual hinged doors. The extra depth
// includes handles and frames, so the camera cannot pass through the glass.
export function updateDoorColliders(panels, opening, colliders) {
  for (let index = 0; index < panels.length; index++) {
    const { panel, direction } = panels[index];
    const angle = direction * 1.38 * opening;
    panel.rotation.y = angle;
    const box = colliders[index] ?? (colliders[index] = {});
    box.cos = Math.cos(angle);
    box.sin = Math.sin(angle);
    box.x = panel.position.x + box.cos * direction * 1.01;
    box.z = panel.position.z - box.sin * direction * 1.01;
    box.halfX = 1.01;
    box.halfZ = .18;
  }
}

export function circleOverlapsBox(x, z, radius, box) {
  const dx = x - box.x;
  const dz = z - box.z;
  const localX = box.cos * dx - box.sin * dz;
  const localZ = box.sin * dx + box.cos * dz;
  const distanceX = Math.max(Math.abs(localX) - box.halfX, 0);
  const distanceZ = Math.max(Math.abs(localZ) - box.halfZ, 0);
  return distanceX * distanceX + distanceZ * distanceZ < radius * radius;
}

export function advanceDoorOpening(panels, colliders, previous, next, playerPosition, playerRadius) {
  updateDoorColliders(panels, next, colliders);
  if (playerPosition && colliders.some(box =>
    circleOverlapsBox(playerPosition.x, playerPosition.z, playerRadius, box))) {
    // Pause the swing instead of sweeping a glass panel through the visitor.
    updateDoorColliders(panels, previous, colliders);
    return previous;
  }
  return next;
}
