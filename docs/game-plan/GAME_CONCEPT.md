# Moonbase Intern

**Please Don't Break Anything**

Moonbase Intern is a desktop first-person browser game about keeping a lunar research habitat operational during a seven-minute shift. The player is the station's newest intern: repair five systems, choose priorities when faults overlap, and hand over with every system stable.

## The experience

The first visit begins with a shuttle arrival and entry into Habitat 07. Inside the habitat, the camera represents the player; there is no visible player avatar. WASD movement, mouse look and sprint connect the equipment locations into one navigable workplace.

The opening incident introduces power repair. Later stages add oxygen, communications, the rover and cooling, with overlapping deadlines and dependencies. Life support takes priority, while a failed uplink or stalled rover can still spoil handover. The intended tension comes from understanding the repair but having several places to be at once.

## The shift loop

1. Start a shift with a generated seed, or load a seed from a URL.
2. Read the incident warning and navigate to the affected equipment.
3. Diagnose the displayed fault and complete its repair procedure.
4. Reassess priorities as incidents overlap.
5. Reach handover with all systems stable, or trigger a terminal failure.
6. Review the outcome, performance grade, score and discoveries.
7. Retry with a new seed or replay the same seed and plan version.

The shift lasts **420 active seconds**. Arrival, menus, photo pause and terminal cinematics are outside that timer. Pause and focus loss stop live simulation; an open repair panel keeps deadlines running.

## Station and characters

The playable area is the habitat and connected lab. Lunar terrain and the landing site provide the cinematic setting; they are not an exterior exploration map.

Props and residents speak through authored, contextual dialogue. Spike is the cactus, Scout the rover, Moss the tortoise, Patch the research console, Capsule the oxygen pod, Watt the power cell and Relay the communications character. The station AI provides remote commentary and urgent instructions. These lines use local game data, with no AI service or generated spoken dialogue.

## What varies between runs

Normal play uses plan version 8. Seeds vary incident times within authored windows, equipment readings and repair procedures. Each system has three repair variants. The incident order, difficulty stages and base failure limits remain authored; seeds do not select random severity, rare events or secret locations.

Replay reproduces a plan, not a player's actions or outcome. A valid example is `LUNA-1234ABCD`: `LUNA-` followed by eight hexadecimal digits.

## Outcomes and replay

Oxygen depletion, thermal failure or an unresolved blackout can terminate the shift early. At seven minutes, any unresolved station system prevents successful handover.

The report separates SUCCESS / FAILED from performance. Grades range from S to F; failed shifts can earn at most B. Local personal bests, three achievements, three optional discoveries and Copy Result support replay without accounts or a server leaderboard.

The implemented discoveries are Priorities, Legacy Channel and Touch Grass. There is no rover-escape secret or separate perfect-incompetence ending.

## Current scope

The game includes safe interactive training, five repairable systems, staged faults, system dependencies, cinematic outcomes, local records and authored humor. It requires desktop keyboard/mouse input, WebGL and pointer capture.

Multiplayer, combat, inventory, crafting, accounts, remote leaderboards, external AI dialogue and a playable exterior are outside the current implementation.

See [gameplay systems](GAMEPLAY_SYSTEMS.md) for controls and rules, [difficulty](../DIFFICULTY.md) for the incident schedule, and [architecture](ARCHITECTURE.md) for component relationships.
