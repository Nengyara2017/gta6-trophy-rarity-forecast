// GTA VI Trophy Rarity Forecast — round 2.
//
// Model: earned/tracked decomposition + hierarchical log-time trend +
// reference-game priors + refresh-aware spread.
//
// Why this beats a "rates stay put" forecast:
//  * An Exophase rate is a ratio, earned / tracked. The launch-night refresh
//    proved the two move separately: tracked players jumped 638 -> 3,868
//    while every rate but the 100% one fell, because the new players had
//    earned fewer trophies. So the program fits log(earned) and log(tracked)
//    separately against log-time and divides, instead of extrapolating the
//    ratio alone. It also fits the logit rate itself the same way, and
//    averages the two trend estimates in logit space.
//  * Each trophy's trend is shrunk toward its class. A trophy whose history
//    barely moved (or is flat because Exophase has not refreshed) borrows
//    strength from its class prior; a trophy with a long, moving history is
//    trusted on its own. The class priors are week-one anchors calibrated
//    on comparable Rockstar open-world launches (GTA V, Red Dead Redemption 2
//    — see METHODOLOGY.md), bent onto a log-time curve so they also make
//    sense at a 90-minute horizon.
//  * The spread is honest about what the practice cases exposed: a flat
//    history means Exophase is stale, not that the future is certain, so
//    staleness widens the band; trend/prior disagreement widens it further;
//    and a random-walk floor grows with the horizon.
//
// Determinism: the forecast is a pure function of the case file. No wall
// clock, no randomness, no network. Two runs write byte-identical output.

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// Percent (0..100) -> logit, with the page's own clamp (0.01..99.99).
function logit(pct: number): number {
  const p = clamp(pct, 0.01, 99.99) / 100;
  return Math.log(p / (1 - p));
}

// Logit -> percent (0..100).
function invLogit(l: number): number {
  if (l >= 20) return 99.99;
  if (l <= -20) return 0.01;
  return (100 / (1 + Math.exp(-l)));
}

// Standard-normal quantiles for the five levels the competition asks for.
const Z_TAU: number[] = [-1.6448536269514722, -0.6744897501960817, 0, 0.6744897501960817, 1.6448536269514722];

// Hours from the release-day start (2026-11-19T00:00:00Z) to an ISO instant.
const RELEASE_MS: number = Date.parse("2026-11-19T00:00:00Z");
function hoursSinceRelease(iso: string): number {
  return (Date.parse(iso) - RELEASE_MS) / 3600000;
}

// Log-time axis: progression in a launch week is fast at first, then slows.
function logTime(hours: number): number {
  return Math.log(1 + Math.max(hours, -0.9));
}

// ---------------------------------------------------------------------------
// Weighted least squares: y = a + b*x, with a prediction standard error.
// ---------------------------------------------------------------------------

interface Fit {
  a: number;
  b: number;
  n: number;
  residSd: number;
  xMean: number;
  sxx: number;
  ok: boolean;
}

function wls(xs: number[], ys: number[], ws: number[]): Fit {
  const n = xs.length;
  const bad: Fit = { a: 0, b: 0, n, residSd: 0, xMean: 0, sxx: 0, ok: false };
  if (n < 2) return bad;
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sw += ws[i];
    sx += ws[i] * xs[i];
    sy += ws[i] * ys[i];
  }
  if (sw <= 0) return bad;
  const xMean = sx / sw;
  const yMean = sy / sw;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    sxx += ws[i] * dx * dx;
    sxy += ws[i] * dx * (ys[i] - yMean);
  }
  if (sxx <= 1e-12) return bad;
  const b = clamp(sxy / sxx, -3, 3);
  const a = yMean - b * xMean;
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (a + b * xs[i]);
    sse += ws[i] * r * r;
  }
  const dof = Math.max(n - 2, 1);
  const residSd = Math.sqrt(sse / (sw * (dof / n)));
  return { a, b, n, residSd, xMean, sxx, ok: true };
}

// Standard error of a prediction at xStar (residual scale, before widening).
function predSe(fit: Fit, xStar: number): number {
  if (!fit.ok || fit.n < 3) return 0.35;
  const lev = 1 + 1 / fit.n + ((xStar - fit.xMean) * (xStar - fit.xMean)) / Math.max(fit.sxx, 1e-9);
  return fit.residSd * Math.sqrt(Math.max(lev, 1));
}

// ---------------------------------------------------------------------------
// Trophy classes and week-one reference priors.
// ---------------------------------------------------------------------------
//
// Anchors are the percent of tracked players expected to hold a trophy of
// that class seven days after launch (168 h after the release day began),
// calibrated on comparable Rockstar open-world launches — see
// METHODOLOGY.md for the reference points and the sensitivity analysis.
// They are weak priors, not answers: the trend fit dominates whenever the
// trophy's own history carries signal.

type TrophyClass =
  | "intro"
  | "story-early"
  | "story-mid"
  | "story-late"
  | "platinum"
  | "gold-long"
  | "silver-skill"
  | "bronze-activity";

const WEEK1_PRIOR: Record<TrophyClass, number> = {
  intro: 99.7,
  "story-early": 55,
  "story-mid": 30,
  "story-late": 15,
  platinum: 0.4,
  "gold-long": 1.5,
  "silver-skill": 5,
  "bronze-activity": 12,
};

interface Trophy {
  id: number;
  name: string;
  description: string;
  tier: string;
  points: number;
  secret: boolean;
}

// Secret bronze trophies are the story chapters, listed in play order, so
// their rank among the secret bronzes splits them into early / mid / late.
// Non-secret bronzes are open-world activities; silvers are skill and
// grind trophies; golds are the long-haul ones; the platinum needs all.
function classify(t: Trophy, lastRate: number, secretBronzeRank: number, secretBronzeTotal: number): TrophyClass {
  if (lastRate >= 99.5) return "intro";
  if (t.tier === "platinum") return "platinum";
  if (t.tier === "gold") return "gold-long";
  if (t.tier === "silver") return "silver-skill";
  if (t.secret && secretBronzeTotal > 0) {
    const frac = secretBronzeTotal <= 1 ? 0 : secretBronzeRank / (secretBronzeTotal - 1);
    if (frac < 1 / 3) return "story-early";
    if (frac < 2 / 3) return "story-mid";
    return "story-late";
  }
  return "bronze-activity";
}

// Prior rate at the target: bend the week-one anchor onto the log-time
// curve, starting from the trophy's last observed rate, so a 90-minute
// horizon gets a near-launch prior and a 7-day horizon gets the anchor.
function priorAtTarget(cls: TrophyClass, lastRate: number, targetHours: number): number {
  const anchor = WEEK1_PRIOR[cls];
  const g = clamp(logTime(targetHours) / logTime(168), 0, 1);
  const l = logit(lastRate) + (logit(anchor) - logit(lastRate)) * g;
  return invLogit(l);
}

// ---------------------------------------------------------------------------
// One trophy's forecast: median + logit spread.
// ---------------------------------------------------------------------------

interface CaseTrophy {
  id: number;
  q: number[];
}

interface HistoryRead {
  at: string;
  players_tracked: number | null;
  rates: (number | null)[];
}

function forecastOne(
  t: Trophy,
  cls: TrophyClass,
  history: HistoryRead[],
  targetHours: number,
  horizonDays: number,
): CaseTrophy {
  const idx = t.id - 1; // rates follow the trophies' order; ids are 1-based positions.
  const last = history.length > 0 ? history[history.length - 1] : null;
  const lastRateRaw = last && last.rates[idx] != null ? (last.rates[idx] as number) : null;

  // No history at all: fall back to the class prior at the target, wide.
  if (last === null || lastRateRaw === null) {
    const m = priorAtTarget(cls, 50, targetHours);
    return quantiles(t.id, m, 2.0);
  }
  const lastRate = clamp(lastRateRaw, 0.01, 99.99);

  // A trophy every tracked player holds stays near the top: new players
  // finish the intro within minutes, so it can only sag a little.
  if (lastRate >= 99.5) {
    return quantiles(t.id, 99.8, 0.35);
  }

  // Collect the trophy's own series, de-duplicated: Exophase repeats the
  // same page for hours, and counting each repeat as fresh evidence would
  // fake confidence. Keep only reads whose rate or tracked count changed.
  const xs: number[] = [];
  const ys: number[] = [];
  const ws: number[] = [];
  const exs: number[] = []; // log(earned count)
  const eys: number[] = [];
  const txs: number[] = []; // log(tracked players)
  const tys: number[] = [];
  let prevKey = "";
  let distinct = 0;
  let prevRate: number | null = null;
  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    const r = h.rates[idx];
    if (r === null || r === undefined) continue;
    const players = typeof h.players_tracked === "number" && h.players_tracked > 0 ? h.players_tracked : null;
    const key = String(r) + "|" + String(players);
    if (key === prevKey) continue; // stale repeat of the same page
    prevKey = key;
    distinct++;
    prevRate = r;
    const x = logTime(hoursSinceRelease(h.at));
    const w = 0.5 + 0.5 * (i / Math.max(history.length - 1, 1)); // recency weight
    xs.push(x);
    ys.push(logit(r));
    ws.push(w);
    if (players !== null && r > 0) {
      exs.push(x);
      eys.push(Math.log((r / 100) * players));
      txs.push(x);
      tys.push(Math.log(players));
    }
  }
  // How much signal the trophy's own history carries: distinct pages seen.
  // Flat history (distinct == 1) means "Exophase has not refreshed", and
  // the prior must do most of the work.
  const signal = distinct;
  const wTrend = signal / (signal + 1.5);

  const xStar = logTime(targetHours);
  const trendFit = wls(xs, ys, ws);
  let trendLogit: number | null = null;
  let fitSe = 0.35;
  if (trendFit.ok) {
    trendLogit = trendFit.a + trendFit.b * xStar;
    fitSe = predSe(trendFit, xStar);
  } else if (xs.length > 0) {
    trendLogit = ys[ys.length - 1]; // flat: persistence
  }

  // Decomposition path: earned and tracked fitted separately, then divided.
  let decLogit: number | null = null;
  if (exs.length >= 2 && txs.length >= 2) {
    const ew = exs.map((_, i) => 0.5 + 0.5 * (i / Math.max(exs.length - 1, 1)));
    const tw = txs.map((_, i) => 0.5 + 0.5 * (i / Math.max(txs.length - 1, 1)));
    const fe = wls(exs, eys, ew);
    const ft = wls(txs, tys, tw);
    if (fe.ok && ft.ok) {
      const earnedStar = Math.exp(fe.a + fe.b * xStar);
      const trackedStar = Math.exp(ft.a + ft.b * xStar);
      if (earnedStar > 0 && trackedStar > 0) {
        decLogit = logit(clamp((100 * earnedStar) / trackedStar, 0.01, 99.99));
      }
    }
  }

  // Trend estimate: the logit-rate trend is the primary path — it is the
  // correctly specified one when progression is log-time shaped. The
  // earned/tracked decomposition is a cross-check, but log(earned) is not
  // log-linear in log-time when tracked-player growth saturates, so it
  // overshoots fast-moving trophies; when the two paths disagree by more
  // than a logit, the decomposition is nearly ignored and the disagreement
  // widens the spread instead (see below).
  let trend: number;
  if (trendLogit !== null && decLogit !== null) {
    const gap = Math.abs(decLogit - trendLogit);
    const wDec = gap > 1 ? 0.1 : 0.25;
    trend = (1 - wDec) * trendLogit + wDec * decLogit;
  } else if (trendLogit !== null) {
    trend = trendLogit;
  } else if (decLogit !== null) {
    trend = decLogit;
  } else {
    trend = logit(lastRate);
  }
  trend = clamp(trend, logit(0.01), logit(99.99));

  // Prior at the target, then the shrinkage blend.
  const priorPct = priorAtTarget(cls, lastRate, targetHours);
  const priorLogit = logit(priorPct);
  const medianLogit = clamp(wTrend * trend + (1 - wTrend) * priorLogit, logit(0.01), logit(99.95));

  // Spread: fit uncertainty + trend/prior disagreement (sensitivity) +
  // staleness (flat history = unrefreshed page) + refresh shocks and a
  // random-walk floor, both growing with the horizon.
  const disagree = Math.abs(trend - priorLogit);
  const stale = signal <= 1 ? 0.55 : signal <= 3 ? 0.35 : 0.15;
  const rw = 0.5 * Math.sqrt(Math.max(horizonDays, 0));
  const refresh = 0.3 * Math.sqrt(Math.max(horizonDays, 0));
  let s = Math.sqrt(fitSe * fitSe + 0.25 * disagree * disagree + stale * stale + rw * rw + refresh * refresh);
  s = clamp(s, 0.45, 2.4);

  return quantiles(t.id, invLogit(medianLogit), s);
}

function quantiles(id: number, medianPct: number, s: number): CaseTrophy {
  const m = logit(medianPct);
  const qs: number[] = [];
  let prev = -Infinity;
  for (let k = 0; k < 5; k++) {
    let q = invLogit(m + Z_TAU[k] * s);
    q = clamp(q, 0.01, 99.99);
    if (q < prev) q = prev;
    q = Math.round(q * 10000) / 10000;
    if (q < prev) q = prev;
    prev = q;
    qs.push(q);
  }
  return { id, q: qs };
}

// ---------------------------------------------------------------------------
// Entry point: read every *.in file, write one *.out file each.
// ---------------------------------------------------------------------------

function main(): void {
  const inDir = process.env.MAKEFUN_INPUT_DIR || "/input";
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const files = fs
    .readdirSync(inDir)
    .filter((f) => f.endsWith(".in"))
    .sort();
  for (const file of files) {
    const raw = fs.readFileSync(path.join(inDir, file), "utf8");
    const c = JSON.parse(raw);
    const trophies: Trophy[] = c.trophies as Trophy[];
    const history: HistoryRead[] = (c.history || []) as HistoryRead[];
    const targetHours = hoursSinceRelease(c.target as string);
    const horizonDays = (c.horizon_minutes as number) / 1440;

    // Rank of each secret bronze among the secret bronzes (story order).
    const secretBronzes = trophies.filter((t) => t.tier === "bronze" && t.secret);
    const rankOf = new Map<number, number>();
    secretBronzes.forEach((t, i) => rankOf.set(t.id, i));

    const rows: CaseTrophy[] = trophies.map((t) => {
      const last = history.length > 0 ? history[history.length - 1].rates[t.id - 1] : null;
      const lastRate = typeof last === "number" ? last : 50;
      const cls = classify(t, lastRate, rankOf.get(t.id) ?? 0, secretBronzes.length);
      return forecastOne(t, cls, history, targetHours, horizonDays);
    });
    rows.sort((a, b) => a.id - b.id);
    const outId = file.replace(/\.in$/, ".out");
    const body = JSON.stringify({ trophies: rows });
    fs.writeFileSync(path.join(outDir, outId), body + "\n", "utf8");
  }
}

main();
