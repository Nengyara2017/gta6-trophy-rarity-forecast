# Model notes: forecasting GTA VI trophy earn rates

## What is being forecast

Each PlayStation 5 trophy's earn rate on Exophase at 2026-11-26T00:00:00Z:
the percent of the players Exophase tracks for GTA VI who have earned that
trophy, as five quantiles (5%, 25%, 50%, 75%, 95%). Scored by mean pinball
loss on the logit scale, so a miss from 1% to 2% costs about what a miss
from 33% to 50% does — rare trophies count as much as common ones.

## Why persistence and trend extrapolation fail

A trophy's rate is a ratio, `earners / players-tracked`, and both the
numerator and the denominator move fast in launch week:

- **Dilution.** Exophase refreshes a game's counts on its own schedule
  (hours apart), not continuously. On launch night the page sat unchanged
  at 638 players tracked from 23:48Z through 04:00Z, then refreshed to
  3,868 players — and every rate except the one at 100% *fell*, because the
  newly tracked players had earned almost nothing yet. Any model that
  extrapolates the rate itself, or assumes the last read persists, is
  blindsided by every refresh. The practice cases exist precisely to punish
  that: the house persistence baseline scores ~1.51 loss on them with 0%
  90% coverage.
- **Adoption is S-shaped, not log-linear.** A story trophy's rate starts
  near zero (nobody has had time to reach it), rises steeply as the player
  base ages into that point of the story, then saturates at the share of
  players who ever get that far. A straight line in logit-vs-log-time
  (the house curve baseline) misses both the slow start and the saturation,
  and it is distorted by dilution steps in the history.

## The cohort model

For each trophy, model the process that generates the rates:

- Players join the tracked population over time. The join-time
  distribution comes from the players-tracked path `N(t)`: the mass that
  joins in each hour is `N(t+1) - N(t)`. The population present at the
  first read joined before the model's clock (the launch rolled by
  timezone: midnight in New Zealand was 11:00Z on 18 Nov, so by the first
  read at 23:50Z the earliest players had ~13h of clock time behind
  them), so it is spread over the 12 hours before the clock starts
  instead of being treated as arriving all at once.
- A player who will ever earn the trophy does so after a lognormal delay
  `D` (median `exp(mu)` hours of play, log-sd `sigma`). The eventual share
  of tracked players who ever earn it is `a`.
- Earners at time `t` are the join-mass convolved with the delay CDF,
  `E(t) = a * Σ_b mass_b * Φ((ln(t - s_b) - mu) / sigma)`, and the rate is
  `100 * E(t) / N(t)`. Dilution falls out automatically: a jump in `N`
  adds joiners with age ~0, who contribute to the denominator but not to
  the numerator.
- A read's page is the state at Exophase's last refresh *before* the
  read, not at the read itself, so a distinct read's effective time is
  the midpoint between it and the previous distinct read. Evaluating the
  model at the read time instead would overstate every age by up to a
  refresh interval — on a steeply rising curve that is a large bias, and
  the fit compensates by inventing slower earning than the truth.

`N(t)` itself is fitted as `log N = α + β·ln(1+t)` over the recent
distinct reads (the current growth regime, not the launch-night flood)
and extrapolated to the target — but only for the future. For the past,
the path is built from the observed counts (log-linear interpolation
between the distinct reads, which are the refresh points). Deriving the
past path from the fitted curve instead would misplace the early joins:
a log-linear fit on the recent regime extrapolated backwards puts far
too few players at the start, skews the whole age distribution young,
and makes the fit invent absurdly fast earning to match the observed
rates. When the history is completely flat (one distinct read), the
snapshot is stale and a refresh is due: the forecast floors `N` at a 6x
jump per 4.5 hours of horizon (the first refresh of launch night was
~6x), capped at 8x the last count. This only fires on flat histories —
exactly the launch-night situation, where the next refresh is the first
one; a history with real growth already says more than the floor.

## Fitting

`(a, mu)` are fitted per trophy by grid search on the logit scale
(minimising squared logit error on the deduplicated reads — consecutive
identical reads are one observation, since the page only changes at
refreshes — plus prior penalties), with a local refinement pass. Two
priors keep flat launch-night data from being over-read:

- The **difficulty prior** reads the trophy's tier and description:
  chapter 1 in a few hours of play for ~85% of players, later chapters a
  day or two in; the final mission for ~40% in ~45h; side-strand finales
  ~30% in ~30h; count grinds scale with their count (250 stunts: ~5% ever,
  ~130h median; 20 races: ~25% ever, ~35h); 100% completion ~5% ever in
  ~1200h; platinum ~1.5% ever in ~1500h. Calibrated against GTA V / RDR2
  trophy curves (GTA V's platinum sits near 2% long-term; its story
  trophies in the 40–85% range; RDR2's platinum near 1%).
- Hard bounds per category (platinum `a ≤ 0.05`, `mu ≥ ln 100h`) stop the
  fit from explaining launch night's handful of early platinum holders —
  reviewers / debug accounts, not real players — by predicting a platinum
  flood by day 7.

The forecast median is the fit's forecast at the target. The fit already
carries the difficulty prior (its penalties); blending in a second,
unconditioned prior forecast would let the prior overrule what the reads
actually say — in particular it would ignore that a trophy's launch-night
rate is far below what its prior alone implies, and on the practice cases
it forecast chapter 1 at 41% ninety minutes after it stood at 1.25%.

## Spread (the quantiles)

The logit sd per trophy is `0.30 + 0.20·√(horizon in days) + 0.35·(fit
RMSE, capped) + 0.45 if the history is flat + staleness term + tier term
(platinum +0.30, gold +0.20, silver +0.10)`, clamped to [0.25, 1.5].
The horizon term is the honest part: over 4.5 days the player base can
grow several-fold and the refresh timing is unknown, so the band is wide
— the house baseline's random-walk spread at the same horizon is
`0.5·√4.52 ≈ 1.06` in logit sd, and this model is in the same range.
A trophy whose last rate is 100% is forecast at the top
(`[99.9, 99.98, 99.99, 100, 100]`): it survived a 6x dilution at 100%.

## What would beat this

The main residual risks are (1) the true `N(t)` path — if Exophase's
tracked base grows much faster or slower than the log-linear
extrapolation, every rate shifts together; (2) the time-to-earn
distribution for grind trophies, where launch-week data barely
identifies the tail; (3) refresh timing right at the target — the answer
is the page as of its last refresh before the target, so a refresh an
hour before the target moves every rate. The spread is set to cover
these, not to pretend they are known.
