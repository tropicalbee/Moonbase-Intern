export const SYSTEM_NAMES = Object.freeze({ power:'Watt / power', oxygen:'Capsule / oxygen', cooling:'Patch / cooling', communications:'Relay / uplink', rover:'Scout / drive' });
const lethalSystems = new Set(['power','oxygen','cooling']);
const seconds = value => Number.isFinite(value) ? Math.max(0, value) : Infinity;

/** Read-only view of existing rules. Supply loss and player death have different deadlines. */
export function deriveEmergencyState({ shift = {}, systems = {}, identities = new Map(), generation = 0, previous = null } = {}) {
  const terminal = ['failed','complete'].includes(shift.status);
  const incidents = [];
  for (const [system, model] of Object.entries(systems)) {
    if (!model?.needsRepair) continue;
    const lethal = lethalSystems.has(system);
    const phaseSeconds = seconds(system === 'power' ? model.outageSeconds : model.secondsRemaining);
    const deadline = system === 'power' ? model.status === 'blackout'
      ? seconds(shift.lockdownRemaining) : phaseSeconds + (shift.blackoutGrace ?? 20)
      : lethal ? phaseSeconds : seconds(shift.remaining);
    const blockedBy = ['cooling','communications'].includes(system) && model.powerAvailable === false ? 'power' : null;
    const critical = lethal && (['critical','blackout','depleted','overheated'].includes(model.status) || deadline <= 15);
    incidents.push(Object.freeze({ system, id:identities.get(system) ?? `${generation}/${system}/state`, generation,
      status:model.status, name:SYSTEM_NAMES[system], lethal, deadline, phaseSeconds,
      deadlineType:system === 'power' ? 'lockdown' : lethal ? 'terminal' : 'handover', blockedBy,
      severity:critical ? 'critical' : 'warning', action:blockedBy ?? system }));
  }
  incidents.sort((a,b) => Number(b.lethal)-Number(a.lethal) || a.deadline-b.deadline || a.system.localeCompare(b.system));
  let dominant = incidents[0] ?? null;
  // Avoid constant switches between almost-equal live deadlines. New urgent risks bypass this hold.
  const incumbent = incidents.find(incident => incident.id === previous?.dominant?.id);
  if (incumbent && dominant && incumbent.lethal === dominant.lethal && incumbent.severity === dominant.severity &&
      incumbent.deadline <= dominant.deadline + 1.5) dominant = incumbent;
  return Object.freeze({ generation, category:terminal ? 'TERMINAL' : incidents.some(i => i.severity === 'critical') ? 'CRITICAL' : incidents.length ? 'WARNING' : 'NORMAL',
    terminalReason:terminal ? shift.failureReason ?? 'handover' : null, incidents:Object.freeze(incidents), dominant,
    action:dominant?.action ?? null, remaining:seconds(shift.remaining), elapsed:seconds(shift.elapsed),training:!!shift.training });
}
