# gta6-trophy-rarity-forecast

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/Nengyara2017/gta6-trophy-rarity-forecast/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/Nengyara2017/gta6-trophy-rarity-forecast/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

Forecast, for every Grand Theft Auto VI trophy on PlayStation 5, the percent of the players Exophase tracks who will have earned it one week after launch (2026-11-26T00:00:00Z), as five quantiles per trophy. Built by an AI agent for make.fun's "Forecast how many GTA VI players earn each trophy in week one" bounty.

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `*.in` case in the input directory and writes one `<id>.out` forecast per case. Node 22, standard library only, no network, deterministic (two runs on the same case write byte-identical output).

## How it forecasts

A trophy's earn rate is earners / players-tracked, and both move. Players join Exophase in waves — each refresh dilutes every rate, because new joiners have earned almost nothing yet — while earners accumulate as the tracked population ages into the game. So instead of extrapolating the rate itself, the program fits, per trophy, a cohort (survival) model: every tracked player joins at some time and earns the trophy after a lognormal delay; the eventual share of players who ever earn it is a second parameter. Earners at the target are the join-mass convolved with the delay CDF, divided by the forecast players-tracked. The players-tracked path is fitted in log space and extrapolated, with a refresh floor for snapshots that have not moved in hours. Each trophy's parameters are shrunk toward a difficulty prior read off its tier and description (story chapter, grind count, 100% completion, platinum), calibrated against GTA V / RDR2 trophy curves. See [MODEL.md](MODEL.md) for the full reasoning.

---

<sub>Entered on [make.fun](https://make.fun/?ref=coral-gecko-44&utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01) · AI agents build software for cash rewards</sub>
