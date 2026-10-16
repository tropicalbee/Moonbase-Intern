# Seeded events and replay

Normal shifts use **plan version 8**. A seed and plan version determine the planned incident times, diagnostic readings and repair procedures before play begins.

## Loading and replaying a seed

Use a URL such as `/?seed=LUNA-1234ABCD&plan=8`. Seeds must be `LUNA-` followed by exactly eight hexadecimal digits; input is trimmed and normalized to uppercase. Invalid seeds fall back to a newly generated seed.

The report displays the seed and plan version. Replay Seed retains both. Retry Shift and R generate a fresh seed with the same plan version, without repeating arrival. Return to Title also prepares a fresh seed through the player-reset callback, then keeps that new plan idle for Start Shift. Leaving training preserves its prepared real-run plan instead. A page reload runs arrival again.

Reproducibility applies to the plan in a given build and version. Player actions, travel, ambient animation and cosmetic presentation are not a recorded replay.

## Plan versions

| Version | Planned incidents | Stages and dependencies |
| --- | --- | --- |
| 1 | Power → Power → Power → Power | Four legacy timing windows; no stage metadata or dependencies |
| 2 | Power → Oxygen → Power → Oxygen | Same four windows; independent systems |
| 3 | Power → Oxygen → Cooling → Oxygen | Same four windows; independent systems |
| 4 | Power → Oxygen → Cooling → Communications | Same four windows; independent systems |
| 5 | Power → Oxygen → Cooling → Rover → Communications | Adds rover at 05:00–05:05; independent systems |
| 6 | 13 staged incident slots across all five systems | Orientation, Pressure, Chaos and Final Minute; independent systems |
| 7 | Same event times and classic diagnostics as version 6 | Adds power/cooling/uplink/oxygen dependencies |
| 8 | Same event times and dependencies as version 7 | Adds three repair variants per system with new diagnostic evidence |

The application selects version 8 when no valid `plan` parameter is supplied. `createRunPlan(seed)` itself defaults to version 7 for callers that omit the version; the application passes its chosen version explicitly.

For the current stage schedule, see [difficulty](DIFFICULTY.md). The four legacy windows used by versions 1–5 are 00:40–01:00, 02:15–02:45, 04:05–04:35 and 05:40–05:55.

## Version 8 repair variants

| System | Variant identifiers |
| --- | --- |
| Power | `feed-trip`, `bank-short`, `bus-isolation` |
| Oxygen | `flow-balance`, `filter-bypass`, `valve-purge` |
| Cooling | `pressure-lock`, `return-blockage`, `sensor-drift` |
| Communications | `carrier-drift`, `relay-mismatch`, `phase-inversion` |
| Rover | `motor-overload`, `brake-lock`, `encoder-drift` |

Each system uses an independently seeded, shuffled three-variant order. Its incident slots cycle that order. Because cooling and rover each have only two slots in a normal shift, a single run does not show all three of their variants. Training can cycle all variants.

A separate stream generates evidence for each slot. Timing streams are unchanged from the staged version 6 schedule. Player input, repairs, cancellation and rendering consume no plan RNG.

## Implementation

[`SeededRandom.js`](../src/game/systems/SeededRandom.js) uses browser cryptographic entropy for new seeds and deterministic FNV-1a namespace hashing with Mulberry32 streams. A generated fresh seed cannot equal the immediately previous seed.

[`RunPlan.js`](../src/game/systems/RunPlan.js) selects versioned factories. [`DifficultyPlan.js`](../src/game/systems/DifficultyPlan.js) supplies the staged schedule; [`RepairVariants.js`](../src/game/systems/RepairVariants.js) selects version 8 procedures and evidence.

[`EventScheduler.js`](../src/game/systems/EventScheduler.js) delivers each ordered slot once. [`ShiftSystem.js`](../src/game/systems/ShiftSystem.js) dispatches it and advances equipment models with active time. If a system already needs repair, the slot is consumed without replacing the fault, resetting its deadline or increasing the triggered-fault count.

A fixed four-power schedule remains as a standalone `ShiftSystem` fallback. Live application shifts receive a generated plan instead.

## Boundaries

Seeds do not randomize difficulty stages, base degradation rates, secret requirements or the authored ordering of system slots. A different decision can still change the outcome of the same plan.

