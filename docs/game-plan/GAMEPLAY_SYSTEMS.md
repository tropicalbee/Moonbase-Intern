# Gameplay systems

This guide describes the current game, using plan version 8 unless a legacy version is explicitly named.

## Objective and controls

Keep the habitat operational for seven active minutes and finish with every station system repaired. Move with WASD, look with the mouse and sprint with Shift. Aim at faulty equipment within interaction range and press E to open service.

Movement and look stop during service, but incident deadlines keep running. Backspace leaves service; Escape pauses. R restarts the shift, P toggles photo pause during exploration, and M toggles audio. Repair panels also expose clickable controls and keyboard focus navigation.

## Equipment and failure rules

| System | Service location | Fault progression | Successful repair |
| --- | --- | --- | --- |
| Power | Watt, east side | 60 supply units drain at 2 per second; critical at 20; blackout at 0, followed by 20 seconds before safety lockdown | Supply returns to 100 |
| Oxygen | Capsule, west side | 90 reserve units drain at 2 per second; critical at 30; depletion ends the shift | Reserve returns to 100 |
| Cooling | Patch, inside the lab | Starts at 70°, critical at 95°, terminal at 110°; heats at 1° per second while powered | Temperature returns to 40° |
| Communications | Relay's ground uplink at Watt | 100 reserve units drain at 2 per second; critical at 20; link lost at 0 | Verified uplink restored |
| Rover | Scout, the survey rover | Moves at 35% speed during a fault; critical after 20 seconds; stalls after 30 seconds; parks during service | Normal route speed restored |

An offline link or stalled rover remains repairable. Neither immediately ends the shift, but both must be repaired before handover. Equipment reserve and temperature values are fictional game metrics.

## Repair procedures

The active panel supplies the evidence and instructions for its seeded variant.

| System | Variants and preparation | Final action |
| --- | --- | --- |
| Power | Isolate a tripped feed and match backup voltage; isolate a leaking bank and match a live feed; or isolate two leaking feeds in descending leakage order and match backup voltage | Use 1–3 for choices, then Enter to restore |
| Oxygen | Match flows directly; bypass a blocked filter first; or purge two high-pressure valves in order | A/D adjusts intake, W/S adjusts return; hold E for two seconds with both flows matched |
| Cooling | Vent the highest-pressure loop; open the low-flow return; or calibrate the outlier probe before venting | Use 1–3 for preparation, then Space inside the pump's marked window |
| Communications | Tune directly; select the high-quality relay first; or match reference polarity first | A/D tunes frequency, W/S tunes phase; at 100% signal press E once for a two-second handshake |
| Rover | Isolate the 12 A motor; select and release a dragging brake; or select encoder drift and apply opposite trim | Use 1–6 to select a wheel; Space releases a brake, A/D adjusts trim; hold E for three seconds to verify |

Oxygen preparation, communications relay/polarity and cooling preparation use the panel's numbered controls. Incorrect actions can impose interlocks while deadlines continue. Power switching has a 0.65-second settling interval and a two-second wrong-step interlock; cooling mistakes impose 1.5 seconds; rejected oxygen service, uplink confirmation/relay selection and rover selection impose one second.

Leaving power service clears the routing sequence but retains its diagnostic and interlock. Oxygen flows and preparation, cooling preparation, uplink tuning/routing and rover selection/preparation are retained until the incident or run resets. Interrupted hold/handshake progress must be performed again.

## Difficulty and dependencies

The authored stages are Orientation (0–90 seconds), Pressure (90–210), Chaos (210–360) and Final Minute (360–420). Normal plans contain 13 incident slots. A slot for a system already awaiting repair is consumed without replacing its fault or extending its deadline.

Blackout accelerates faulty cooling to 1.5° per second and blocks pump engagement. It also blocks uplink confirmation and clears an unfinished handshake. Balanced oxygen priming increases faulty power drain to 3 units per second while held. Power restoration removes these restrictions but does not repair the other systems.

See [difficulty and dependencies](../DIFFICULTY.md) and [seeded events](../SEEDED_EVENTS.md) for exact timing windows and legacy versions.

## Dialogue, discoveries and training

Nearby visible characters speak automatically after a short dwell. E is reserved for equipment actions. Ordinary speech yields to repair input and critical life-support instructions; discovery messages remain available until Enter acknowledgement.

Three optional discoveries are implemented: five successful Spike encounters, the 4173 archive at Patch, and twenty accumulated seconds of clear-sky observation. Faults can postpone reveals; earned sky observation survives interruptions. H recalls available clues. Each discovery adds 250 points and is awarded once per run.

How to Play offers ten interactive training lessons using the real equipment controls with protected reserves. N advances a completed lesson, H shows a hint, F1 opens paused training controls, and V cycles variants in a repair lesson. Training does not save a score.

## Outcomes, scoring and records

Early terminal causes are oxygen depletion, cooling overheat and power safety lockdown. At handover, any system still needing repair produces a failed shift.

The terminal report shows mission outcome separately from grade. Scoring includes survival, repairs, handover, integrity and discoveries, with penalties for outages, unresolved systems and termination. Failed shifts are capped at grade B; S and A require success.

Retry Shift and R generate a new seed while retaining the plan version. Replay Seed keeps both seed and version. Personal bests, discoveries, achievements and recent results use local browser storage. Copy Result has a manual-copy fallback.

See [scoring](../SCORING.md) for the exact formulas and storage rules.
