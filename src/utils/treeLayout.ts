import type { Musician } from '../types';
import { STYLE_TREE_EDGES, STYLE_ERA_YEAR, STYLE_ORDER } from './layout';
import { getStyleHex } from './colors';

/**
 * Layout for the Tree view: the blues style tree drawn as an actual tree.
 *
 *  - Y is time: 1890 at the roots, today at the canopy.
 *  - A style is a limb; it forks off its parent style at the year the style emerged.
 *  - Musicians hang off their style's limb at their `activeFrom` year. The most
 *    influential sit ON the limb (thick wood), the least influential end up as
 *    leaves at the tips of the twigs.
 *  - Within a row, a musician picks the side of the limb where its influences and
 *    bandmates already sit, so connected people cluster.
 */

// The ground sits a generation below the earliest musician: that gap is the
// trunk, so every branch forks above the root rather than out of the soil.
export const YEAR_MIN = 1862;
export const FIRST_YEAR = 1890;
export const YEAR_MAX = 2021;
const PX_PER_YEAR = 40;

export const CANOPY_Y = 120;
const TREE_H = (YEAR_MAX - YEAR_MIN) * PX_PER_YEAR;
export const GROUND_Y = CANOPY_Y + TREE_H;
export const TRUNK_BASE_Y = GROUND_Y + 420;
// How far below the trunk's base the buttress roots sit.
const ROOT_DROP = 110;

const SLOT = 30;            // horizontal room per musician in a row
const SLICE_PAD = 44;
const ROW_H = 30;           // minimum vertical gap between two musicians on the same limb
const MIN_SLICE = 150;
// The influential stay on the wood; the quiet ones ride out on twigs.
const LIMB_REACH = [12, 30];      // tier 0 and tier 1, straight off the limb
const TWIG_BASE = 30;             // first leaf on a twig, measured from the limb
const TWIG_STEP = 26;             // each further leaf out along the twig
const TWIG_SPAN = 150;            // a twig only gathers leaves within this much height
const TWIG_MIN = 3;               // never grow a twig for fewer leaves than this
const TWIG_MAX = 6;
const MIN_ERA_GAP = 6;      // a child style forks at least this many years above its parent
const MIN_SEP = 26;         // no two musicians ever end up closer than this

export type Tier = 0 | 1 | 2; // 0 = trunk-worthy, 1 = branch, 2 = leaf
const MAJOR_COUNT = 36;
const BRANCH_COUNT = 190;

export interface TreeMusician {
  m: Musician;
  year: number;
  style: string;
  color: string;
  x: number;
  y: number;
  /** where this musician's twig leaves the limb */
  ax: number;
  ay: number;
  tier: Tier;
  score: number;
  /** the twig this leaf grows on, or null when it sits straight on the limb */
  twig: string | null;
  /** leaf orientation, degrees */
  angle: number;
}

export interface TreeBranch {
  key: string;
  d: string;
  w: number;
  color: string;
  style: string;
  /** a second parent — the style has another documented ancestor */
  graft: boolean;
}

export interface TreeLimb {
  style: string;
  d: string;
  w: number;
  color: string;
  bottomY: number;
  topY: number;
  midX: number;
  midY: number;
  /** where the style's name is written, and the angle of the limb there */
  labelX: number;
  labelY: number;
  labelAngle: number;
  count: number;
}

export interface TreeTwig {
  key: string;
  d: string;
  style: string;
}

export interface Foliage {
  style: string;
  d: string;
  color: string;
}

export interface BluesTree {
  yearToY: YearScale;
  nodes: TreeMusician[];
  foliage: Foliage[];
  byId: Map<string, TreeMusician>;
  branches: TreeBranch[];
  limbs: TreeLimb[];
  twigs: TreeTwig[];
  trunk: string;
  bark: string[];
  roots: string[];
  trunkX: number;
  minX: number;
  maxX: number;
}

export type YearScale = (year: number) => number;

/**
 * Year → world Y. Half the height is shared out evenly across the years and half
 * by how many musicians started in them, so the crowded 1920s–60s get the room
 * they need and the thin recent decades don't leave a bare pole.
 */
export function buildYearScale(musicians: Musician[]): YearScale {
  const sorted = musicians.map(activeYear).sort((a, b) => a - b);
  const n = sorted.length || 1;
  const span = YEAR_MAX - YEAR_MIN;
  return (year: number) => {
    const y = Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= y) lo = mid + 1;
      else hi = mid;
    }
    const t = 0.45 * ((y - YEAR_MIN) / span) + 0.55 * (lo / n);
    return GROUND_Y - t * TREE_H;
  };
}

export function activeYear(m: Musician): number {
  const y = parseInt(m.activeFrom, 10);
  return Number.isFinite(y) ? y : YEAR_MIN;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic 0..1 — keeps the tree's organic wobble stable across renders. */
function noise(s: string): number {
  return (hash(s) % 997) / 997;
}

type Pt = [number, number];

function cubicPoints(p0: Pt, c1: Pt, c2: Pt, p1: Pt, n = 20): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    pts.push([
      mt ** 3 * p0[0] + 3 * mt ** 2 * t * c1[0] + 3 * mt * t ** 2 * c2[0] + t ** 3 * p1[0],
      mt ** 3 * p0[1] + 3 * mt ** 2 * t * c1[1] + 3 * mt * t ** 2 * c2[1] + t ** 3 * p1[1],
    ]);
  }
  return pts;
}

/**
 * Outline a polyline as wood: `w0` wide where it leaves its parent, `w1` at the tip.
 * Returns a closed path meant to be filled, not stroked.
 */
function taperedPath(pts: Pt[], w0: number, w1: number): string {
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const t = i / (pts.length - 1);
    const hw = (w0 + (w1 - w0) * t) / 2;
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;
    left.push(`${(pts[i][0] + nx).toFixed(1)} ${(pts[i][1] + ny).toFixed(1)}`);
    right.push(`${(pts[i][0] - nx).toFixed(1)} ${(pts[i][1] - ny).toFixed(1)}`);
  }
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`;
}

/** Catmull-Rom through the points — wood bends, it does not turn corners. */
function smooth(pts: Pt[], perSeg = 6): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function orderIdx(style: string): number {
  const i = STYLE_ORDER.indexOf(style);
  return i === -1 ? STYLE_ORDER.length : i;
}

/** How many musicians each one is documented as having influenced, plus collaboration reach. */
export function computeScores(musicians: Musician[]): Map<string, number> {
  const downstream = new Map<string, Set<string>>();
  musicians.forEach((m) => downstream.set(m.id, new Set(m.influences ?? [])));
  // `influencedBy` lists a musician's own ancestors — a downstream edge for them.
  musicians.forEach((m) => (m.influencedBy ?? []).forEach((id) => downstream.get(id)?.add(m.id)));

  const scores = new Map<string, number>();
  musicians.forEach((m) => {
    scores.set(m.id, downstream.get(m.id)!.size * 2 + (m.playedWith?.length ?? 0) * 0.3);
  });
  return scores;
}

export function computeBluesTree(musicians: Musician[]): BluesTree {
  const yearToY = buildYearScale(musicians);
  const byStyle = new Map<string, Musician[]>();
  musicians.forEach((m) => {
    const list = byStyle.get(m.bluesStyle);
    if (list) list.push(m);
    else byStyle.set(m.bluesStyle, [m]);
  });
  const styles = [...byStyle.keys()];

  // --- style tree: a style's limb grows from the FIRST parent STYLE_TREE_EDGES
  // lists for it; any later parent is a graft. Edge order is the declaration,
  // so a style whose main line is the younger of its ancestors (Contemporary
  // Blues out of Chicago, not Texas) can say so.
  const parentOf = new Map<string, string>();
  const grafts: Array<[string, string]> = [];
  STYLE_TREE_EDGES.forEach(([p, c]) => {
    if (!byStyle.has(p) || !byStyle.has(c)) return;
    if (parentOf.has(c)) grafts.push([p, c]);
    else parentOf.set(c, p);
  });

  const children = new Map<string, string[]>();
  parentOf.forEach((p, c) => {
    const kids = children.get(p);
    if (kids) kids.push(c);
    else children.set(p, [c]);
  });
  const rootStyles = styles.filter((s) => !parentOf.has(s)).sort((a, b) => orderIdx(a) - orderIdx(b));

  // --- effective fork year: a style never forks below its parent
  const era = (s: string) => STYLE_ERA_YEAR[s] ?? YEAR_MIN;
  const effEra = new Map<string, number>();
  const walk = (style: string, floor: number, seen: Set<string>) => {
    if (seen.has(style)) return;
    seen.add(style);
    const y = Math.max(era(style), floor);
    effEra.set(style, y);
    (children.get(style) ?? []).forEach((c) => walk(c, y + MIN_ERA_GAP, seen));
  };
  const seen = new Set<string>();
  rootStyles.forEach((s) => walk(s, YEAR_MIN, seen));
  styles.forEach((s) => { if (!effEra.has(s)) { effEra.set(s, era(s)); } });

  // --- horizontal space: a style needs room for its busiest two-year row
  const ownWidth = new Map<string, number>();
  styles.forEach((s) => {
    const rows = new Map<number, number>();
    byStyle.get(s)!.forEach((m) => {
      const r = Math.round(yearToY(activeYear(m)) / ROW_H);
      rows.set(r, (rows.get(r) ?? 0) + 1);
    });
    // A style is as wide as its longest twig reaches on each side, plus a little
    // for the years crowded enough to need a second twig alongside.
    const occupancy = [...rows.values()].sort((a, b) => a - b);
    const busy = occupancy[Math.floor(occupancy.length * 0.97)] ?? 1;
    const reach = TWIG_BASE + (TWIG_MAX - 1) * TWIG_STEP;
    ownWidth.set(s, Math.max(MIN_SLICE, 2 * reach + Math.max(0, busy - TWIG_MAX) * SLOT + SLICE_PAD));
  });

  const slice = new Map<string, [number, number]>();
  const place = (style: string, left: number): number => {
    const items = [
      { style, self: true },
      ...(children.get(style) ?? []).map((s) => ({ style: s, self: false })),
    ].sort((a, b) => orderIdx(a.style) - orderIdx(b.style));

    let cursor = left;
    for (const it of items) {
      if (it.self) {
        slice.set(style, [cursor, cursor + ownWidth.get(style)!]);
        cursor += ownWidth.get(style)!;
      } else {
        cursor = place(it.style, cursor);
      }
    }
    return cursor;
  };
  let cursor = 0;
  rootStyles.forEach((s) => { cursor = place(s, cursor); });

  // Centre the canopy on x = 0; the trunk sits under the root styles, wherever that lands.
  const shift = -cursor / 2;
  const axisOf = new Map<string, number>();
  styles.forEach((s) => {
    const sl = slice.get(s);
    if (sl) axisOf.set(s, (sl[0] + sl[1]) / 2 + shift);
  });
  const trunkX = 0; // the canopy is centred on 0, so the trunk is too

  // --- limbs: a gentle S so nothing looks like a ruler
  const limbBottomY = new Map<string, number>();
  const limbTopY = new Map<string, number>();
  const sway = new Map<string, number>();
  styles.forEach((s) => {
    const years = byStyle.get(s)!.map(activeYear);
    limbBottomY.set(s, yearToY(Math.min(effEra.get(s)!, ...years)));
    limbTopY.set(s, yearToY(Math.max(effEra.get(s)!, ...years)) - 26);
    sway.set(s, (noise(s) - 0.5) * 26);
  });

  // Limbs run vertically. A style is then a single readable column, which is the
  // whole point of grouping by style — a splayed canopy looks more like a tree but
  // makes it much harder to see where one style ends and the next begins.
  const limbX = (style: string, y: number): number => {
    const base = axisOf.get(style) ?? 0;
    const bottom = limbBottomY.get(style)!;
    const top = limbTopY.get(style)!;
    const t = bottom === top ? 0 : Math.max(0, Math.min(1, (bottom - y) / (bottom - top)));
    const s1 = sway.get(style) ?? 0;
    return base + Math.sin(t * Math.PI) * s1 + Math.sin(t * Math.PI * 3.1 + s1) * s1 * 0.45;
  };

  // --- musicians
  const scores = computeScores(musicians);
  const ranked = [...musicians].sort((a, b) => (scores.get(b.id)! - scores.get(a.id)!));
  const tierOf = new Map<string, Tier>();
  ranked.forEach((m, i) => {
    const s = scores.get(m.id)!;
    tierOf.set(m.id, i < MAJOR_COUNT ? 0 : i < BRANCH_COUNT && s > 0 ? 1 : 2);
  });

  // Pass 1 places everyone with alternating sides; pass 2 re-picks the side that
  // faces each musician's influences and bandmates.
  /**
   * Split a side's leaves into twigs. Leaves only share a twig if they are close
   * in time, which keeps a twig's climb short enough to fan out at an angle
   * rather than run straight up alongside the limb. A twig with one or two leaves
   * looks like a mistake, so a short tail is folded back into the twig before it.
   */
  const intoTwigs = (ordered: Musician[], yOf: (m: Musician) => number): Musician[][] => {
    if (ordered.length < TWIG_MIN) return [ordered];
    const groups: Musician[][] = [[]];
    ordered.forEach((m) => {
      const cur = groups[groups.length - 1];
      const tooFar = cur.length > 0 && Math.abs(yOf(cur[0]) - yOf(m)) > TWIG_SPAN;
      if (cur.length >= TWIG_MAX || tooFar) groups.push([m]);
      else cur.push(m);
    });
    // fold any run shorter than the minimum into its neighbour
    for (let i = groups.length - 1; i > 0; i--) {
      if (groups[i].length < TWIG_MIN) {
        groups[i - 1].push(...groups[i]);
        groups.splice(i, 1);
      }
    }
    return groups;
  };

  const layoutPass = (affinity: Map<string, number> | null): Map<string, TreeMusician> => {
    const out = new Map<string, TreeMusician>();

    styles.forEach((style) => {
      const color = getStyleHex(style);
      const list = byStyle.get(style)!;
      const yOf = (m: Musician) => yearToY(activeYear(m)) + (noise(m.id) - 0.5) * 7;
      // oldest first: a twig grows upward and outward as it gets younger
      const byAge = (a: Musician, b: Musician) => yOf(b) - yOf(a);

      const sideOf = (m: Musician, y: number, fallback: boolean) => {
        if (!affinity) return fallback;
        const pull = affinity.get(m.id);
        return pull === undefined ? fallback : pull > limbX(style, y);
      };

      const put = (m: Musician, x: number, y: number, twig: string | null) => {
        const ax = limbX(style, y);
        out.set(m.id, {
          m,
          year: activeYear(m),
          style,
          color,
          x,
          y,
          ax,
          ay: y,
          tier: tierOf.get(m.id)!,
          score: scores.get(m.id)!,
          twig,
          angle: (Math.atan2(-9, x - ax || 1) * 180) / Math.PI + (noise(m.id + 'a') - 0.5) * 26,
        });
      };

      // The influential sit straight on the wood, alternating sides.
      list
        .filter((m) => tierOf.get(m.id)! <= 1)
        .sort(byAge)
        .forEach((m, i) => {
          const y = yOf(m);
          const right = sideOf(m, y, i % 2 === 1);
          put(m, limbX(style, y) + (right ? 1 : -1) * LIMB_REACH[tierOf.get(m.id)!], y, null);
        });

      // Everyone else rides out on a twig, three leaves to a twig at least.
      const left: Musician[] = [];
      const right: Musician[] = [];
      list
        .filter((m) => tierOf.get(m.id)! === 2)
        .sort(byAge)
        .forEach((m, i) => {
          const y = yOf(m);
          (sideOf(m, y, i % 2 === 1) ? right : left).push(m);
        });

      ([['L', left, -1], ['R', right, 1]] as const).forEach(([side, members, dir]) => {
        intoTwigs([...members].sort(byAge), yOf).forEach((group, gi) => {
          const twig = group.length >= TWIG_MIN ? `${style}|${side}|${gi}` : null;
          group.forEach((m, i) => {
            const y = yOf(m);
            const reach = twig ? TWIG_BASE + i * TWIG_STEP : LIMB_REACH[1];
            put(m, limbX(style, y) + dir * reach, y, twig);
          });
        });
      });
    });

    return out;
  };

  /**
   * Rows are shared by every style, and the canopy narrows towards the trunk, so
   * a slice's own slotting cannot guarantee spacing on its own. A few relaxation
   * sweeps push apart anything still within MIN_SEP, so every leaf stays its own
   * clickable target.
   */
  const separate = (placed: Map<string, TreeMusician>) => {
    const all = [...placed.values()].sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 40; pass++) {
      let moved = false;
      for (let i = 0; i < all.length; i++) {
        const a = all[i];
        for (let j = i + 1; j < all.length && all[j].y - a.y < MIN_SEP; j++) {
          const b = all[j];
          const dy = b.y - a.y;
          const dx = b.x - a.x;
          const need = Math.sqrt(MIN_SEP * MIN_SEP - dy * dy);
          if (Math.abs(dx) >= need) continue;
          const push = (need - Math.abs(dx)) / 2 + 0.05;
          const dir = dx === 0 ? (a.ax <= b.ax ? -1 : 1) : Math.sign(dx);
          a.x -= dir * push;
          b.x += dir * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return placed;
  };

  const first = separate(layoutPass(null));
  const affinity = new Map<string, number>();
  musicians.forEach((m) => {
    const related = [
      ...(m.influences ?? []),
      ...(m.influencedBy ?? []),
      ...(m.playedWith ?? []),
    ];
    const xs = related.map((id) => first.get(id)?.x).filter((v): v is number => v !== undefined);
    if (xs.length) affinity.set(m.id, xs.reduce((a, b) => a + b, 0) / xs.length);
  });
  const byId = separate(layoutPass(affinity));
  const nodes = [...byId.values()];

  // --- branch geometry
  const forkPoints = (from: string, to: string): Pt[] => {
    const y1 = limbBottomY.get(to)!;
    const x1 = limbX(to, y1);
    const reach = Math.abs(x1 - (axisOf.get(from) ?? 0));
    const startY = Math.min(limbBottomY.get(from)!, y1 + Math.max(6 * ROW_H, reach * 0.3));
    const x0 = limbX(from, startY);
    const midY = (startY + y1) / 2;
    return cubicPoints([x0, startY], [x0, midY], [x1, midY], [x1, y1]);
  };

  const subtreeCount = new Map<string, number>();
  const countOf = (s: string, guard = new Set<string>()): number => {
    if (guard.has(s)) return 0;
    guard.add(s);
    const n = byStyle.get(s)!.length + (children.get(s) ?? []).reduce((a, c) => a + countOf(c, guard), 0);
    subtreeCount.set(s, n);
    return n;
  };
  styles.forEach((s) => countOf(s));

  const thickness = (n: number) => Math.max(9, Math.min(64, Math.sqrt(n) * 5.2));

  // Root styles leave the trunk at their own era, always above the ground line.
  const trunkTopY = Math.min(...rootStyles.map((s) => limbBottomY.get(s)!));
  const branches: TreeBranch[] = rootStyles.map((s) => {
    const y1 = limbBottomY.get(s)!;
    const x1 = limbX(s, y1);
    const y0 = Math.min(GROUND_Y - 30, y1 + Math.max(3.5 * ROW_H, Math.abs(x1 - trunkX) * 0.3));
    const dir = Math.sign(x1 - trunkX) || 1;
    const w = thickness(subtreeCount.get(s) ?? 1);
    const pts = cubicPoints(
      [trunkX + dir * 26, y0],
      [trunkX + dir * 26, (y0 + y1) / 2],
      [x1, (y0 + y1) / 2],
      [x1, y1]
    );
    return {
      key: `trunk>${s}`,
      d: taperedPath(pts, w * 1.5, w),
      w,
      color: getStyleHex(s),
      style: s,
      graft: false,
    };
  });
  parentOf.forEach((p, c) => {
    const w = thickness(subtreeCount.get(c) ?? 1);
    branches.push({
      key: `${p}>${c}`,
      d: taperedPath(forkPoints(p, c), w * 1.35, w),
      w,
      color: getStyleHex(c),
      style: c,
      graft: false,
    });
  });
  grafts.forEach(([p, c]) => {
    const pts = forkPoints(p, c);
    branches.push({
      key: `graft:${p}>${c}`,
      d: `M ${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ')}`,
      w: 2,
      color: getStyleHex(c),
      style: c,
      graft: true,
    });
  });

  const limbs: TreeLimb[] = styles.map((style) => {
    const bottom = limbBottomY.get(style)!;
    const top = limbTopY.get(style)!;
    const pts: Pt[] = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const y = bottom + ((top - bottom) * i) / steps;
      pts.push([limbX(style, y), y]);
    }
    const w = thickness(byStyle.get(style)!.length);
    return {
      style,
      d: taperedPath(pts, w, 2),
      w,
      color: getStyleHex(style),
      bottomY: bottom,
      topY: top,
      midX: limbX(style, (bottom + top) / 2),
      midY: (bottom + top) / 2,
      labelX: limbX(style, bottom + (top - bottom) * 0.58),
      labelY: bottom + (top - bottom) * 0.58,
      // written along the limb, so it reads as grain on the branch
      labelAngle:
        (Math.atan2(
          -(top - bottom) * 0.06,
          limbX(style, bottom + (top - bottom) * 0.52) - limbX(style, bottom + (top - bottom) * 0.64)
        ) *
          180) /
        Math.PI,
      count: byStyle.get(style)!.length,
    };
  });

  // --- twigs: one bough per cluster of leaves, drawn through the leaves it carries
  const twigGroups = new Map<string, TreeMusician[]>();
  nodes.forEach((n) => {
    if (!n.twig) return;
    const g = twigGroups.get(n.twig);
    if (g) g.push(n);
    else twigGroups.set(n.twig, [n]);
  });
  const twigs: TreeTwig[] = [...twigGroups.entries()].map(([key, leaves]) => {
    leaves.sort((a, b) => b.y - a.y); // from the limb outwards
    const root = leaves[0];
    const dir = Math.sign(root.x - root.ax) || 1;
    const pts: Pt[] = [
      [root.ax - dir * 5, root.ay + 26],
      [root.ax + dir * 14, root.ay + 8],
      ...leaves.map((n) => [n.x, n.y] as Pt),
    ];
    const tip = leaves[leaves.length - 1];
    const prev = leaves[Math.max(0, leaves.length - 2)];
    pts.push([tip.x + (tip.x - prev.x) * 0.3, tip.y + (tip.y - prev.y) * 0.3]);
    return { key, d: taperedPath(smooth(pts), 11, 2), style: root.style };
  });

  // --- trunk + roots, after a sweetgum: one straight central leader that keeps
  // going up through the crown, standing on a flared, buttressed base.
  const trunkTop = trunkTopY - 5.5 * ROW_H;
  const HALF_BASE = 190;
  const HALF_NECK = 64;
  const HALF_TOP = 26;
  const neckY = GROUND_Y - (GROUND_Y - trunkTop) * 0.12;
  // Up the left side, across the top, back down the right.
  const flank = (dir: number, up: boolean) => {
    const base = `${trunkX + dir * HALF_BASE} ${TRUNK_BASE_Y}`;
    const neckIn = `${trunkX + dir * HALF_BASE * 0.62} ${GROUND_Y - 60}, ${trunkX + dir * HALF_NECK * 1.1} ${neckY + 40}, ${trunkX + dir * HALF_NECK} ${neckY}`;
    const leader = `${trunkX + dir * HALF_NECK * 0.82} ${neckY - (neckY - trunkTop) * 0.45}, ${trunkX + dir * HALF_TOP * 1.5} ${trunkTop + 120}, ${trunkX + dir * HALF_TOP} ${trunkTop}`;
    return up
      ? `M ${base} C ${neckIn} C ${leader}`
      : `C ${trunkX + dir * HALF_TOP * 1.5} ${trunkTop + 120}, ${trunkX + dir * HALF_NECK * 0.82} ${neckY - (neckY - trunkTop) * 0.45}, ${trunkX + dir * HALF_NECK} ${neckY} C ${trunkX + dir * HALF_NECK * 1.1} ${neckY + 40}, ${trunkX + dir * HALF_BASE * 0.62} ${GROUND_Y - 60}, ${base}`;
  };
  const trunk = `${flank(-1, true)} L ${trunkX + HALF_TOP} ${trunkTop} ${flank(1, false)} Z`;

  // Bark: a few grain lines that follow the trunk, the way the reference is inked.
  const bark = [-0.62, -0.3, -0.06, 0.2, 0.46, 0.72].map((f, i) => {
    const wobble = (noise(`bark${i}`) - 0.5) * 26;
    const pts = cubicPoints(
      [trunkX + f * HALF_BASE * 0.72, TRUNK_BASE_Y - 60],
      [trunkX + f * HALF_NECK * 1.3 + wobble, neckY + 30],
      [trunkX + f * HALF_NECK * 0.8 - wobble, neckY - (neckY - trunkTop) * 0.5],
      [trunkX + f * HALF_TOP * 0.9, trunkTop + 30]
    );
    return taperedPath(pts, 5, 1.5);
  });

  // Buttress roots: tapered wedges spreading out of the base, not hairline strokes.
  // They are drawn behind the trunk, so they start low enough to stay hidden where
  // they leave it and only read once they are clear of the wood.
  const roots = [-1, 1].flatMap((dir) =>
    [0.5, 0.9, 1.35].map((spread, i) => {
      const len = (420 + i * 300) * dir;
      const startY = TRUNK_BASE_Y - 210 + ROOT_DROP + i * 46;
      const pts = cubicPoints(
        [trunkX + dir * 30, startY],
        [trunkX + len * 0.35, startY + 70 * spread],
        [trunkX + len * 0.7, TRUNK_BASE_Y + ROOT_DROP + 60 * spread],
        [trunkX + len, TRUNK_BASE_Y + ROOT_DROP + 120 * spread]
      );
      return taperedPath(pts, 96 - i * 22, 4);
    })
  );

  // --- foliage: a soft hull around each style's musicians, so the canopy reads
  // as a canopy when you are zoomed out too far to see individual leaves.
  const foliage: Foliage[] = styles.map((style) => {
    const rows = new Map<number, [number, number]>();
    nodes.filter((n) => n.style === style).forEach((n) => {
      const cur = rows.get(n.year);
      if (cur) rows.set(n.year, [Math.min(cur[0], n.x), Math.max(cur[1], n.x)]);
      else rows.set(n.year, [n.x, n.x]);
    });
    const ys = [...rows.keys()].sort((a, b) => a - b); // oldest (lowest) first
    const PAD = 34;
    const right: string[] = [];
    const left: string[] = [];
    ys.forEach((r) => {
      const [lo, hi] = rows.get(r)!;
      const y = yearToY(r);
      const c = (lo + hi) / 2;
      right.push(`${Math.max(hi + PAD, c + PAD).toFixed(1)} ${y.toFixed(1)}`);
      left.push(`${Math.min(lo - PAD, c - PAD).toFixed(1)} ${y.toFixed(1)}`);
    });
    return {
      style,
      d: right.length < 2 ? '' : `M ${right.join(' L ')} L ${left.reverse().join(' L ')} Z`,
      color: getStyleHex(style),
    };
  }).filter((f) => f.d);

  const xs = nodes.map((n) => n.x);
  return {
    yearToY,
    nodes,
    foliage,
    byId,
    branches,
    limbs,
    twigs,
    trunk,
    bark,
    roots,
    trunkX,
    // a little room for the names that hang off the outermost nodes
    minX: Math.min(-400, ...xs) - 650,
    maxX: Math.max(400, ...xs) + 650,
  };
}
