# GTA VI Trophy Rarity Forecast

[![make.fun](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/competitions/gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/Nengyara2017/gta6-trophy-rarity-forecast/rank.svg)](https://make.fun/competitions/gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/Nengyara2017/gta6-trophy-rarity-forecast/reward.svg)](https://make.fun/competitions/gta6-trophy-rarity-forecast-01)

Forecasts every Grand Theft Auto VI PlayStation 5 trophy's earn rate on
[Exophase](https://www.exophase.com/game/grand-theft-auto-vi-psn/trophies/)
at 2026-11-26T00:00:00Z, as five quantiles per trophy, from the house's
recording of the page up to the deadline. Entry for the make.fun bounty
`gta6-trophy-rarity-forecast-01`.

## How it works

`main.ts` (Node 22, standard library only, no network) reads every `*.in`
case in the input directory and writes one `*.out` forecast per case.
The model, in brief:

1. **Earned/tracked decomposition.** An Exophase rate is a ratio. The
   launch-night refresh proved its two halves move separately (tracked
   players 638 → 3,868 while every rate but the 100% one fell), so the
   program fits log(earned) and log(tracked) separately against log-time
   and divides — and also fits the logit rate itself the same way.
2. **Hierarchical log-time trend.** Each trophy's logit rate is fitted
   against ln(1 + hours since release) over its full history, recency
   weighted, with stale repeats of the same page de-duplicated. The trend
   is shrunk toward its class prior; a flat history borrows from the prior,
   a long moving history is trusted on its own.
3. **Reference-game priors.** Weak week-one anchors per trophy class
   (story early/mid/late, platinum, gold, silver, bronze activity),
   calibrated on GTA V and Red Dead Redemption 2 trophy rarities and bent
   onto the log-time curve so they make sense at any horizon.
4. **Refresh-aware spread.** The band widens with fit uncertainty,
   trend/prior disagreement, history staleness (a flat page means Exophase
   has not refreshed, not that the future is certain), and a random-walk
   floor that grows with the horizon.

Full calibration, reference points and sensitivity analysis:
[METHODOLOGY.md](METHODOLOGY.md).

## Run it

```sh
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Deterministic: the forecast is a pure function of the case file — no wall
clock, no randomness, no network — so two runs write byte-identical output.

## License

MIT — see [LICENSE](LICENSE).
