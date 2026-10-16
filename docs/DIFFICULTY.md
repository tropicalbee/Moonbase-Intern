# Difficulty and system dependencies

Normal play uses plan version 8: a seven-minute shift with 13 authored incident slots, seeded timing within bounded windows, and three possible repair procedures for each system. Difficulty follows elapsed active time rather than adapting to player performance.

## Stage schedule

| Stage | Active time | Scheduled faults |
| --- | --- | --- |
| Orientation | 00:00–01:30 | Power at 00:45–00:55 |
| Pressure | 01:30–03:30 | Oxygen at 01:45–01:55; communications at 02:08–02:18; rover at 03:00–03:10 |
| Chaos | 03:30–06:00 | Cooling at 03:40–03:46; power at 03:58–04:04; oxygen at 04:42–04:48; communications at 05:00–05:06; rover at 05:30–05:36 |
| Final minute | 06:00–07:00 | Power at 06:02–06:06; cooling at 06:12–06:16; oxygen at 06:22–06:26; communications at 06:32–06:36 |

The schedule contains three power, three oxygen, two cooling, three communications and two rover slots. Actual triggered faults may be fewer: an incident directed at an already faulty system does not replace its diagnostic, restart its deadline or increment its fault count. That slot is consumed.

Stages begin at 0, 90, 210 and 360 active seconds. Pausing freezes the stage clock and schedule. An open repair panel does not pause the shift.

## Base failure limits

| System | Initial fault state | Consequence without repair |
| --- | --- | --- |
| Power | 60 supply units, draining at 2 per second | Blackout after 30 seconds; safety lockdown after a further 20 seconds |
| Oxygen | 90 reserve units, draining at 2 per second | Terminal depletion after 45 seconds |
| Cooling | 70°, heating at 1° per second while powered | Terminal overheat at 110°, after 40 seconds |
| Communications | 100 reserve units, draining at 2 per second | Link lost after 50 seconds; repair remains possible |
| Rover | Fault clock starts at zero | Stalls after 30 seconds; repair remains possible |

At seven minutes, any unresolved system makes handover fail. Life-support failure takes priority when its terminal deadline coincides with handover.

## Dependencies in versions 7 and 8

| Condition | Consequence | Response |
| --- | --- | --- |
| Blackout while cooling is faulty | Heat rate becomes 1.5° per second; pump engagement is blocked | Complete available preparation, restore Watt, then synchronize Patch's pump |
| Blackout while communications is faulty | Confirmation is blocked; an unfinished handshake resets | Retain tuning/routing, restore Watt, then confirm a new two-second handshake |
| Balanced oxygen priming while power is faulty | Backup drain becomes 3 supply units per second while priming is held | Finish priming or release the hold to remove its extra load |

Blackout does not generate an additional cooling or uplink fault. Healthy power does not drain merely because oxygen is being primed. Communications reserve retains its normal drain rate.

Restoring power removes the dependency gates but does not repair cooling or communications. Model updates split at incident, repair and terminal boundaries to charge only the time spent under each condition.

## Replay and implementation

Open `/?seed=LUNA-1234ABCD&plan=8` for a reproducible current plan. Versions 6 and 7 share its timing windows; version 6 omits dependencies, and version 7 uses classic diagnostics. Versions 1–5 retain their earlier schedules. See [seeded events](SEEDED_EVENTS.md).

[`DifficultyPlan.js`](../src/game/systems/DifficultyPlan.js) defines the stages and slots. [`ShiftSystem.js`](../src/game/systems/ShiftSystem.js) applies dependencies and resolves deadlines. Equipment models own their degradation and repair conditions.

These rules describe source behavior. They do not establish that travel time, overlapping warnings or the final minute feel fair to a human player; those require a navigation playthrough.
