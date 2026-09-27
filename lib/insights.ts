import { Dims, ScenarioItem } from "./scenarios";

export function errorScore(ranking: number[], expertOrderIds: number[]): number {
  let score = 0;
  ranking.forEach((itemId, pos) => {
    score += Math.abs(pos - expertOrderIds.indexOf(itemId));
  });
  return score;
}

export function synergyScore(avgIndividualScore: number, teamScore: number): number {
  return avgIndividualScore - teamScore;
}

const DIM_KEYS: (keyof Dims)[] = ["speed", "stabilize", "resource", "strategy", "risk"];

/**
 * For each dimension, a weighted average of how highly this ranking placed
 * items that carry that dimension. 1.0 = consistently ranked items with that
 * dimension at the top; 0 = consistently ranked them at the bottom.
 */
export function styleProfile(ranking: number[], items: ScenarioItem[]): Dims {
  const totals: Dims = { speed: 0, stabilize: 0, resource: 0, strategy: 0, risk: 0 };
  const weights: Dims = { speed: 0, stabilize: 0, resource: 0, strategy: 0, risk: 0 };
  const n = ranking.length;

  ranking.forEach((itemId, pos) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const importance = (n - pos) / n; // 1.0 for the top pick, near 0 for the last
    DIM_KEYS.forEach((d) => {
      totals[d] += item.dims[d] * importance;
      weights[d] += item.dims[d];
    });
  });

  const result = {} as Dims;
  DIM_KEYS.forEach((d) => {
    result[d] = weights[d] > 0 ? totals[d] / weights[d] : 0;
  });
  return result;
}

export function biasFlags(params: {
  individualRankings: Record<string, number[]>;
  teamRanking: number[];
  expertOrderIds: number[];
  items: ScenarioItem[];
}): string[] {
  const { individualRankings, teamRanking, expertOrderIds, items } = params;
  const flags: string[] = [];

  // Anchoring: did the team's top pick match what most individuals opened with?
  const firstPicks = Object.values(individualRankings).map((r) => r[0]);
  if (firstPicks.length >= 2) {
    const counts: Record<number, number> = {};
    firstPicks.forEach((id) => (counts[id] = (counts[id] || 0) + 1));
    const [topId, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (topCount >= Math.ceil(firstPicks.length / 2) && teamRanking[0] === Number(topId)) {
      flags.push(
        "The team's top pick matched what most individuals opened with — a sign of early anchoring rather than fresh group reasoning."
      );
    }
  }

  const teamStyle = styleProfile(teamRanking, items);
  const expertStyle = styleProfile(expertOrderIds, items);

  if (teamStyle.resource - expertStyle.resource > 0.12) {
    flags.push(
      "The team leaned on familiar, tool-like items more than the expert logic did — a classic availability bias."
    );
  }
  if (expertStyle.strategy - teamStyle.strategy > 0.12) {
    flags.push("The team under-weighted longer-term or strategic items relative to the expert ranking.");
  }
  if (teamStyle.speed - expertStyle.speed > 0.12) {
    flags.push("The team prioritized fast, visible action over items the expert ranking valued more highly.");
  }
  if (expertStyle.risk - teamStyle.risk > 0.12) {
    flags.push("The team under-weighted risk-management items relative to the expert ranking.");
  }

  return flags;
}
