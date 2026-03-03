import { Game, Player, RuleConfig } from "./index";
import { solve, SolveResult } from "./solver";

export interface SimulationResult {
  winRate: number;
  avgScore: number;
  medianScore: number;
  scoreDistribution: number[];
  totalGames: number;
  avgNodesExplored: number;
}

export interface SimulationOptions {
  trace?: boolean;
  onGameComplete?: (details: { gameNumber: number; result: SolveResult }) => void;
}

export function runSimulation(rules: RuleConfig, numGames: number, options: SimulationOptions = {}): SimulationResult {
  const fullRules: Required<RuleConfig> = {
    startingHealth: rules.startingHealth ?? 20,
    maxHealth: rules.maxHealth ?? 20,
    potionsPerRoom: rules.potionsPerRoom ?? 1,
    canSkipRooms: rules.canSkipRooms ?? true,
    canSkipConsecutive: rules.canSkipConsecutive ?? false,
    weaponKillLimit: rules.weaponKillLimit ?? true,
  };

  const scores: number[] = [];
  let wins = 0;
  let totalNodes = 0;

  for (let i = 0; i < numGames; i++) {
    const deck = Game.createDeck();
    const originalDeck = deck.map((c) => c.clone());
    const player = new Player(fullRules.startingHealth, fullRules.maxHealth);
    const game = new Game(deck, player, fullRules);

    const result = solve(game, originalDeck, { trace: options.trace });

    scores.push(result.score);
    if (result.victory) wins++;
    totalNodes += result.nodesExplored;
    options.onGameComplete?.({ gameNumber: i + 1, result });
  }

  scores.sort((a, b) => a - b);

  const avgScore = scores.reduce((sum, s) => sum + s, 0) / numGames;
  const medianScore = numGames % 2 === 0 ? (scores[numGames / 2 - 1] + scores[numGames / 2]) / 2 : scores[Math.floor(numGames / 2)];

  return {
    winRate: (wins / numGames) * 100,
    avgScore,
    medianScore,
    scoreDistribution: scores,
    totalGames: numGames,
    avgNodesExplored: totalNodes / numGames,
  };
}
