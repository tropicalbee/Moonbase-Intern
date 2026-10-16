# Scoring and replayability

The terminal report shows mission outcome, numeric score and performance grade separately. Points use **scoring version 2**; grades use **grading version 1**.

## Points

| Component | Points |
| --- | ---: |
| Survival | `floor(activeSeconds × 10)` |
| Completed repairs | 500 each, bounded by planned incident count |
| Successful handover | 5,000 |
| Station integrity | 20 per rounded percentage point |
| Unique discoveries in this run | 250 each, up to three |
| Combined outages | Negative rounded sum of blackoutSeconds × 20 + offlineUplinkSeconds × 3 + stalledRoverSeconds × 3 |
| Unresolved systems | −750 each |
| Thermal termination | −2,500 |
| Other failed outcome | −1,500 |

The final sum is floored at zero. Outage durations are accumulated across the run, including periods before successful recovery. The combined outage term is rounded once; it is not a separate rounding operation for each system.

A full 420-second, thirteen-repair handover with 100% integrity and no outages earns **17,700** without secrets, or **18,450** with all three.

## Integrity

Integrity is the rounded mean of the available life-support fractions:

| System | Fraction while faulty |
| --- | --- |
| Power | supply health / 60 |
| Oxygen | reserve / 90 |
| Cooling | (110 − temperature) / 40 |

Fractions are clamped to 0–1. A healthy or recovered system contributes 1. Thermal termination forces integrity to zero. Rover and communications do not enter the integrity average, but unresolved incidents and their outage time have separate penalties.

Integrity represents current equipment condition, not accumulated structural damage or a player's oxygen saturation.

## Performance grade

Performance is the weighted sum of three fractions, each capped at 1:

- 40% survival: active time / shift duration.
- 40% repairs: completed repairs / faults actually triggered.
- 20% score: final score / the plan's ideal no-secret handover score.

The reference score is `duration × 10 + plannedIncidents × 500 + 5,000 + 2,000`. It is 17,700 for the current thirteen-slot plan. An incident-free successful run gets full repair coverage; an incident-free failed run gets none.

| Performance | Grade | Rating |
| --- | --- | --- |
| At least 97% | S | Suspiciously competent |
| At least 85% | A | Hireable |
| At least 65% | B | Requires supervision |
| At least 45% | C | Probation extended |
| At least 25% | D | Decorative staff |
| Below 25% | F | Former intern |

Failed shifts are capped at **B**. S and A require successful handover. Secrets can increase the score fraction but are not required for S.

For example, 407 seconds survived, nine repairs out of thirteen triggered faults and 2,836 points produce about 69.7% performance: **B / FAILED**. This is an illustrative calculation, not a recovered player save.

The report's initially collapsed Score & grade details section explains the formula and point ledger. Faults count accepted equipment incidents, not wrong repair attempts.

## Local records and sharing

`moonbase-intern.results.v2` stores best score, longest survival and highest integrity independently for plan versions 1–8, at most ten recent result summaries, discovered secret IDs and three achievements:

| Achievement | Condition |
| --- | --- |
| Still employed | Complete a successful handover |
| No interruptions | Complete a handover with zero blackout, uplink-offline and rover-stalled time |
| Curiosity department | Discover all three secrets across recorded runs |

Denied or corrupt storage does not block play. The UI identifies unsaved records as available for the current visit. Version 1 storage is neither migrated nor deleted. Clearing browser site data removes local records.

Copy Result uses the Clipboard API and falls back to a selected, read-only text area for manual copying. It includes outcome, grade explanation, score ledger, seed and plan/scoring versions. There is no account or online leaderboard.

## Implementation

[`ScoreSystem.js`](../src/game/systems/ScoreSystem.js) calculates terminal reports and share text. [`PersonalBests.js`](../src/game/systems/PersonalBests.js) validates and stores records. [`ShiftGameplay.js`](../src/game/systems/ShiftGameplay.js) presents the report and copy controls.

