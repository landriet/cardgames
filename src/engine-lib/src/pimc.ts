import { DungeonCard, Game, GameAction, RuleConfig } from "./index";
import { SimulationResult } from "./simulation";
import { solveRootActions } from "./solver";

function cardKey(card: DungeonCard): string {
  return `${card.type}-${card.suit}-${card.rank}`;
}

export function getUnseenCards(game: Game): DungeonCard[] {
  // Build set of all seen card keys
  const seen = new Set<string>();

  for (const card of game.currentRoom.cards) {
    seen.add(cardKey(card));
  }
  for (const card of game.discard) {
    seen.add(cardKey(card));
  }
  if (game.player.equippedWeapon) {
    seen.add(cardKey(game.player.equippedWeapon));
  }
  for (const card of game.player.monstersOnWeapon) {
    seen.add(cardKey(card));
  }

  // Full canonical deck minus seen cards
  // Use a multiset approach: count occurrences in full deck, subtract seen
  const fullDeck = Game.createDeck();

  // Count how many of each key are seen
  const seenCounts = new Map<string, number>();
  for (const card of [...game.currentRoom.cards, ...game.discard]) {
    const key = cardKey(card);
    seenCounts.set(key, (seenCounts.get(key) ?? 0) + 1);
  }
  if (game.player.equippedWeapon) {
    const key = cardKey(game.player.equippedWeapon);
    seenCounts.set(key, (seenCounts.get(key) ?? 0) + 1);
  }
  for (const card of game.player.monstersOnWeapon) {
    const key = cardKey(card);
    seenCounts.set(key, (seenCounts.get(key) ?? 0) + 1);
  }

  // Filter full deck
  const result: DungeonCard[] = [];
  const usedCounts = new Map<string, number>();
  for (const card of fullDeck) {
    const key = cardKey(card);
    const used = usedCounts.get(key) ?? 0;
    const seenCount = seenCounts.get(key) ?? 0;
    if (used < seenCount) {
      usedCounts.set(key, used + 1);
    } else {
      result.push(card);
    }
  }

  return result;
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface ActionStats {
  action: GameAction;
  avgScore: number;
  wins: number;
  scores: number[];
}

export interface PimcResult {
  bestAction: GameAction;
  stats: ActionStats[];
}

function actionKey(a: GameAction): string {
  if (a.actionType === "enterRoom") return "enterRoom";
  if (a.actionType === "skipRoom") return "skipRoom";
  if (a.card) return `play|${a.card.type}|${a.card.suit}|${a.card.rank}|${a.mode ?? ""}`;
  return a.actionType;
}

export function pimcBestAction(game: Game, numSamples: number, nodeLimit?: number): PimcResult {
  const actions = game.getPossibleActions();

  if (actions.length === 0) {
    return { bestAction: { actionType: "enterRoom" }, stats: [] };
  }

  if (actions.length === 1) {
    return {
      bestAction: actions[0],
      stats: [{ action: actions[0], avgScore: 0, wins: 0, scores: [] }],
    };
  }

  const unseen = getUnseenCards(game);

  // Build mapping from action key to index in the original actions array
  const actionKeyToIndex = new Map<string, number>();
  for (let i = 0; i < actions.length; i++) {
    actionKeyToIndex.set(actionKey(actions[i]), i);
  }

  // Initialize per-action score accumulators
  const actionScores: number[][] = actions.map(() => []);
  const actionWins: number[] = actions.map(() => 0);

  for (let s = 0; s < numSamples; s++) {
    const sampledDeck = shuffle(unseen.map((c) => c.clone()));

    const clone = game.clone();
    clone.deck = sampledDeck;

    // One solve evaluating all root actions with a shared transposition table
    const result = solveRootActions(clone, { nodeLimit });

    for (const ar of result.actionResults) {
      const key = actionKey(ar.action);
      const idx = actionKeyToIndex.get(key);
      if (idx !== undefined) {
        actionScores[idx].push(ar.score);
        if (ar.victory) actionWins[idx]++;
      }
    }
  }

  // Build stats and find best
  const stats: ActionStats[] = actions.map((action, i) => ({
    action,
    avgScore: actionScores[i].length > 0 ? actionScores[i].reduce((sum, s) => sum + s, 0) / actionScores[i].length : 0,
    wins: actionWins[i],
    scores: actionScores[i],
  }));

  let bestIdx = 0;
  for (let i = 1; i < stats.length; i++) {
    if (stats[i].avgScore > stats[bestIdx].avgScore) {
      bestIdx = i;
    }
  }

  return { bestAction: actions[bestIdx], stats };
}

function doAction(game: Game, action: GameAction): void {
  if (action.actionType === "enterRoom") {
    game.enterRoom();
  } else if (action.actionType === "skipRoom") {
    game.avoidRoom();
  } else if (action.actionType === "playCard" && action.card) {
    game.handleCardAction(action.card, action.mode);
  }
}

export interface PimcGameResult {
  victory: boolean;
  score: number;
  health: number;
  moves: Array<{ action: GameAction; stats: ActionStats[] }>;
}

export function runPimcGame(numSamples: number, rules?: RuleConfig, nodeLimit?: number): PimcGameResult {
  const game = new Game(undefined, undefined, rules);
  const moves: PimcGameResult["moves"] = [];

  while (!game.gameOver && !game.victory) {
    const result = pimcBestAction(game, numSamples, nodeLimit);
    if (result.stats.length === 0) break;

    doAction(game, result.bestAction);
    moves.push({ action: result.bestAction, stats: result.stats });
  }

  return {
    victory: game.victory,
    score: game.calculateScore(),
    health: game.player.health,
    moves,
  };
}

export function runPimcSimulation(numGames: number, numSamples: number, rules?: RuleConfig, nodeLimit?: number): SimulationResult {
  const scores: number[] = [];
  let wins = 0;

  for (let i = 0; i < numGames; i++) {
    const result = runPimcGame(numSamples, rules, nodeLimit);
    scores.push(result.score);
    if (result.victory) wins++;
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
    avgNodesExplored: 0, // Not tracked for PIMC
  };
}
