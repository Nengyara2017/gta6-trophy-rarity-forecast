# Methodology — GTA VI Trophy Rarity Forecast, round 2

## The quantity

Each trophy's earn rate on Exophase's GTA VI PS5 trophy page: the percent
of the players Exophase tracks who have earned it, at 2026-11-26T00:00:00Z.
The program forecasts five quantiles (5/25/50/75/95%) per trophy, scored
by mean pinball loss on the logit scale.

## Reference points (calibration)

Week-one anchors per trophy class, calibrated on comparable Rockstar
open-world launches. These are weak priors, not answers — the trend fit
dominates whenever a trophy's own history carries signal.

| Class | Week-1 anchor | Reference |
|---|---|---|
| Intro (first trophy) | 99.7% | GTA VI's own page: the intro trophy sat at 100% of 638 tracked players on launch night; an intro takes minutes, so near-everyone holds it |
| Story, early chapters | 55% | GTA V's first story trophy sits far above its finale on every tracker; early chapters are hours in, most launch-week players reach them |
| Story, mid chapters | 30% | Between early and late; story completion funnels down steeply |
| Story, late chapters / finale | 15% | GTA V's finale trophies print single digits to low teens on tracker samples (e.g. PocketPSN: "The Moment of Truth" 7%, "A Fair Day's Pay" 9.9%); week-one players are the most engaged, so above all-time tracker rates |
| Platinum | 0.4% | GTA V platinum ~1.5% all-time on PSNProfiles, RDR2 platinum 0.1% (200+ hours); week one is far below all-time, and GTA VI's platinum needs 100% completion |
| Gold (long-haul) | 1.5% | GTA V's 100%-completion gold prints ~0.2% on small-tracker samples and ~1% on PSN; week one, a small share |
| Silver (skill / grind) | 5% | Mid-difficulty skill and grind trophies; well above gold, well below activities |
| Bronze activity | 12% | Side activities (fishing, bowling, stunts): cheap, early, and repeatable, so a visible minority tries them in week one |

Classification uses only the case data: tier, the secret flag, and the
rank of a secret bronze among the secret bronzes (the story chapters, in
play order) split into early / mid / late thirds. Non-secret bronzes are
activities; silvers are skill/grind; golds are long-haul; the platinum is
its own class; any trophy at ≥99.5% is the intro.

The anchor is bent onto the log-time curve: the prior at the target is
`logit(last) + (logit(anchor) − logit(last)) · ln(1+t)/ln(169)`, so a
90-minute horizon gets a near-launch prior and a 7-day horizon gets the
anchor itself.

## The trend

- Per trophy, weighted least squares of logit(rate) on ln(1 + hours since
  2026-11-19T00:00:00Z) over the full history, recency weighted. Reads
  that repeat the same page byte-for-byte (Exophase stale between
  refreshes) are de-duplicated first, so a frozen page cannot fake
  confidence.
- Separately, log(earned count) and log(tracked players) are fitted the
  same way and divided — the decomposition path. It is a cross-check only:
  testing showed it overshoots fast-moving trophies (log-earned is not
  log-linear in log-time once tracked-player growth saturates), so it gets
  25% weight, and 10% when it disagrees with the logit trend by more than
  one logit.
- Shrinkage: median = `w·trend + (1−w)·prior` in logit space, with
  `w = distinct / (distinct + 1.5)` where `distinct` is the number of
  distinct pages seen for the trophy. Flat history (distinct = 1) ⇒
  w ≈ 0.4, the prior does most of the work; rich history ⇒ w → 1.

## The spread

`s² = fitSE² + 0.25·|trend − prior|² + stale² + rw² + refresh²`, clamped
to [0.45, 2.4] in logit units, where `fitSE` is the trend fit's prediction
standard error at the target, `stale` is 0.55 / 0.35 / 0.15 for ≤1 / ≤3 /
more distinct pages, `rw = 0.5·√days` is the random-walk floor and
`refresh = 0.3·√days` prices Exophase refresh shocks. Quantiles are
`inv_logit(median ± z_tau·s)`.

## Sensitivity analysis

Two synthetic final-like cases were built from a known generating curve
(log-time progression to a week-one truth, tracked players growing to a
saturating total, Exophase refreshing every 4–6 h), with week-one truths
deliberately different from the priors, and scored with the official
pinball loss on the logit scale:

| Scenario | Round 2 loss | House baseline loss | Round 2 typical miss | Baseline miss | Coverage |
|---|---|---|---|---|---|
| Fast progression (story-early 60%, tracked → 250k, 4 h refresh) | 0.254 | 0.376 | 0.51 pp | 9.45 pp | 1.00 |
| Slow progression (story-early 40%, tracked → 100k, 6 h refresh) | 0.267 | 0.339 | 0.81 pp | 5.85 pp | 1.00 |

The model beats the house baseline in both scenarios, and its medians
track the truth closely (e.g. story-early median 62.0% vs 60% truth in
scenario 1, 42.9% vs 40% in scenario 2; platinum 0.31% vs 0.30%, 0.17%
vs 0.15%). The main residual risk is a regime the history cannot show:
an Exophase refresh pattern change, or a trophy whose week-one behaviour
differs from both its own trend and its class (e.g. a secret trophy that
is not a story chapter at all). The spread prices that risk rather than
pretending it away.

## Practice cases

On the kit's practice cases (flat launch-night history, 90-minute
horizon) the forecast is valid (55 rows, monotone quantiles, < 65,536
bytes) and deterministic across runs. The practice answers are a refresh
shock the history cannot foresee — the house baselines score ~1.51 there
for the same reason — so practice loss is not the target; the final's
2.5 days of real movement are what the trend machinery is built for.
