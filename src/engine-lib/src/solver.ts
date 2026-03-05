import { DungeonCard, Game, GameAction } from "./index";

// --- Compact State Hashing ---

export type CardIndex = Map<string, number>;

export function buildCardIndex(originalDeck: DungeonCard[]): CardIndex {
  const index = new Map<string, number>();
  for (let i = 0; i < originalDeck.length; i++) {
    index.set(cardKey(originalDeck[i]), i);
  }
  return index;
}

function cardKey(card: DungeonCard): string {
  return `${card.type}-${card.suit}-${card.rank}`;
}

export function compactStateKey(game: Game, cardIndex: CardIndex): string {
  const deckIds = game.deck.map((c) => cardIndex.get(cardKey(c))!).sort((a, b) => a - b);
  const roomIds = game.currentRoom.cards.map((c) => cardIndex.get(cardKey(c))!).sort((a, b) => a - b);

  const health = game.player.health;
  const weaponRank = game.player.equippedWeapon ? game.player.equippedWeapon.rank : 0;
  const lastMonsterRank = game.player.lastMonsterDefeated ? game.player.lastMonsterDefeated.rank : 0;
  const monstersOnWeapon = game.player.monstersOnWeapon.map((m) => m.rank).sort((a, b) => a - b);

  const flags =
    (game.player.potionTakenThisTurn ? 1 : 0) |
    (game.canDeferRoom ? 2 : 0) |
    (game.lastActionWasDefer ? 4 : 0) |
    (game.roomBeingEntered ? 8 : 0);

  return `${deckIds.join(",")}|${roomIds.join(",")}|${health}|${weaponRank}|${lastMonsterRank}|${monstersOnWeapon.join(",")}|${flags.toString(16)}`;
}

// --- Zobrist Hashing ---

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

interface ZobristTable {
  cardInDeck: [Uint32Array, Uint32Array];
  cardInRoom: [Uint32Array, Uint32Array];
  monsterOnWeapon: [Uint32Array, Uint32Array];
  health: [Uint32Array, Uint32Array];
  weaponRank: [Uint32Array, Uint32Array];
  lastMonsterRank: [Uint32Array, Uint32Array];
  flags: [Uint32Array, Uint32Array];
}

const ZOBRIST_MAX_RANK = 15;
const DEFAULT_MAX_TT_ENTRIES = 16_000_000;

function createZobristTable(numCards: number, maxMoWPositions: number): ZobristTable {
  const rng = mulberry32(0xdeadbeef);
  const fill = (size: number): [Uint32Array, Uint32Array] => {
    const a = new Uint32Array(size);
    const b = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      a[i] = rng() >>> 0;
      b[i] = rng() >>> 0;
    }
    return [a, b];
  };

  return {
    cardInDeck: fill(numCards),
    cardInRoom: fill(numCards),
    monsterOnWeapon: fill(maxMoWPositions * ZOBRIST_MAX_RANK),
    health: fill(21),
    weaponRank: fill(ZOBRIST_MAX_RANK),
    lastMonsterRank: fill(ZOBRIST_MAX_RANK),
    flags: fill(16),
  };
}

type CardIdentityIndex = Map<DungeonCard, number>;

type TranspositionEntry = { victory: boolean; score: number; bestAction?: GameAction };

export interface SolveResult {
  victory: boolean;
  score: number;
  nodesExplored: number;
  nodeLimitHit?: boolean;
  trace?: SolveTraceStep[];
}

export interface SolveTraceStep {
  step: number;
  action: GameAction;
  healthBefore: number;
  healthAfter: number;
  deckBefore: number;
  deckAfter: number;
  roomBefore: string[];
  roomAfter: string[];
  gameOver: boolean;
  victory: boolean;
  scoreAfter: number;
}

export interface RootActionResult {
  action: GameAction;
  victory: boolean;
  score: number;
}

export interface SolveRootActionsResult {
  actionResults: RootActionResult[];
  nodesExplored: number;
  nodeLimitHit: boolean;
}

export interface SolverOptions {
  trace?: boolean;
  nodeLimit?: number;
}

export interface SolverContextOptions {
  maxTranspositionEntries?: number;
  storeBestAction?: boolean;
}

export interface SolverContext {
  cardIdentityByKey: Map<string, number[]>;
  zobrist: ZobristTable;
  transpositionTable: Map<bigint, TranspositionEntry>;
  maxTranspositionEntries: number;
  storeBestAction: boolean;
  originalDeck: DungeonCard[];
}

interface NodeLimitRef {
  count: number;
  limit: number;
}

function buildCardIdentityByKey(deck: DungeonCard[]): Map<string, number[]> {
  const byKey = new Map<string, number[]>();
  for (let i = 0; i < deck.length; i++) {
    const key = cardKey(deck[i]);
    const ids = byKey.get(key);
    if (ids) {
      ids.push(i);
    } else {
      byKey.set(key, [i]);
    }
  }
  return byKey;
}

function collectAllCardsFromGame(game: Game): DungeonCard[] {
  const cards: DungeonCard[] = [];
  for (const c of game.deck) cards.push(c);
  for (const c of game.currentRoom.cards) cards.push(c);
  for (const c of game.discard) cards.push(c);
  if (game.player.equippedWeapon) cards.push(game.player.equippedWeapon);
  for (const c of game.player.monstersOnWeapon) cards.push(c);
  if (game.player.lastMonsterDefeated) cards.push(game.player.lastMonsterDefeated);
  return cards;
}

function buildCardIdentityIndex(game: Game, context: SolverContext): CardIdentityIndex {
  const identity: CardIdentityIndex = new Map();
  const seenPerKey = new Map<string, number>();

  const add = (card: DungeonCard) => {
    if (identity.has(card)) return;
    const key = cardKey(card);
    const seenCount = seenPerKey.get(key) ?? 0;
    seenPerKey.set(key, seenCount + 1);

    const ids = context.cardIdentityByKey.get(key);
    if (!ids || seenCount >= ids.length) {
      throw new Error(`SolverContext is missing identity for card ${key} occurrence ${seenCount}`);
    }

    identity.set(card, ids[seenCount]);
  };

  for (const card of game.deck) add(card);
  for (const card of game.currentRoom.cards) add(card);
  for (const card of game.discard) add(card);
  if (game.player.equippedWeapon) add(game.player.equippedWeapon);
  for (const card of game.player.monstersOnWeapon) add(card);
  if (game.player.lastMonsterDefeated) add(game.player.lastMonsterDefeated);

  return identity;
}

const _mowScratch = new Uint8Array(52);

function zobristStateKey(game: Game, cardIdentity: CardIdentityIndex, table: ZobristTable): bigint {
  let h1 = 0;
  let h2 = 0;

  for (const card of game.deck) {
    const idx = cardIdentity.get(card)!;
    h1 ^= table.cardInDeck[0][idx];
    h2 ^= table.cardInDeck[1][idx];
  }

  for (const card of game.currentRoom.cards) {
    const idx = cardIdentity.get(card)!;
    h1 ^= table.cardInRoom[0][idx];
    h2 ^= table.cardInRoom[1][idx];
  }

  let mowLen = 0;
  for (const m of game.player.monstersOnWeapon) {
    _mowScratch[mowLen++] = m.rank;
  }

  for (let i = 1; i < mowLen; i++) {
    const v = _mowScratch[i];
    let j = i - 1;
    while (j >= 0 && _mowScratch[j] > v) {
      _mowScratch[j + 1] = _mowScratch[j];
      j--;
    }
    _mowScratch[j + 1] = v;
  }

  for (let i = 0; i < mowLen; i++) {
    const slot = i * ZOBRIST_MAX_RANK + _mowScratch[i];
    h1 ^= table.monsterOnWeapon[0][slot];
    h2 ^= table.monsterOnWeapon[1][slot];
  }

  h1 ^= table.health[0][game.player.health];
  h2 ^= table.health[1][game.player.health];

  const wr = game.player.equippedWeapon ? game.player.equippedWeapon.rank : 0;
  h1 ^= table.weaponRank[0][wr];
  h2 ^= table.weaponRank[1][wr];

  const lmr = game.player.lastMonsterDefeated ? game.player.lastMonsterDefeated.rank : 0;
  h1 ^= table.lastMonsterRank[0][lmr];
  h2 ^= table.lastMonsterRank[1][lmr];

  const flags =
    (game.player.potionTakenThisTurn ? 1 : 0) |
    (game.canDeferRoom ? 2 : 0) |
    (game.lastActionWasDefer ? 4 : 0) |
    (game.roomBeingEntered ? 8 : 0);
  h1 ^= table.flags[0][flags];
  h2 ^= table.flags[1][flags];

  return (BigInt(h1 >>> 0) << 32n) | BigInt(h2 >>> 0);
}

function maybeTrimTranspositionTable(transpositionTable: Map<bigint, TranspositionEntry>, maxEntries: number): void {
  if (transpositionTable.size >= maxEntries) {
    transpositionTable.clear();
  }
}

function makeDfs(
  game: Game,
  cardIdentity: CardIdentityIndex,
  context: SolverContext,
  nodeLimitRef: NodeLimitRef,
  storeBestAction: boolean,
): () => { victory: boolean; score: number } {
  const transpositionTable = context.transpositionTable;

  function dfs(): { victory: boolean; score: number } {
    nodeLimitRef.count++;

    if (game.gameOver) {
      return { victory: false, score: game.calculateScore() };
    }
    if (game.victory) {
      return { victory: true, score: game.calculateScore() };
    }

    if (nodeLimitRef.count >= nodeLimitRef.limit) {
      return { victory: false, score: game.calculateScore() };
    }

    const stateKey = zobristStateKey(game, cardIdentity, context.zobrist);
    const cached = transpositionTable.get(stateKey);
    if (cached) return { victory: cached.victory, score: cached.score };

    const actions = game.getPossibleActions();
    if (actions.length === 0) {
      const result = { victory: false, score: game.calculateScore() };
      maybeTrimTranspositionTable(transpositionTable, context.maxTranspositionEntries);
      transpositionTable.set(stateKey, result);
      return result;
    }

    actions.sort((a, b) => actionPriority(a, game) - actionPriority(b, game));

    const best = { victory: false, score: game.calculateScore() };
    let bestAction: GameAction | undefined;

    for (const action of actions) {
      if (isDominated(action, actions, game)) continue;

      if (
        action.actionType === "playCard" &&
        action.card?.type === "monster" &&
        action.mode === "barehanded" &&
        game.player.health <= action.card.rank
      ) {
        continue;
      }

      if (action.actionType === "playCard" && action.card?.type === "monster" && action.mode === "weapon" && game.player.equippedWeapon) {
        const damage = Math.max(action.card.rank - game.player.equippedWeapon.rank, 0);
        if (game.player.health <= damage) continue;
      }

      doAction(game, action);
      const result = dfs();
      undoAction(game);

      if (compareBetter(result, best)) {
        best.victory = result.victory;
        best.score = result.score;
        bestAction = action;
      }

      if (best.victory) break;
    }

    maybeTrimTranspositionTable(transpositionTable, context.maxTranspositionEntries);
    if (storeBestAction && bestAction) {
      transpositionTable.set(stateKey, { ...best, bestAction });
    } else {
      transpositionTable.set(stateKey, best);
    }

    return best;
  }

  return dfs;
}

function runSolve(game: Game, context: SolverContext, options: SolverOptions = {}): SolveResult {
  const cardIdentity = buildCardIdentityIndex(game, context);
  const nodeLimitRef: NodeLimitRef = { count: 0, limit: options.nodeLimit ?? Infinity };
  const shouldStoreBestAction = context.storeBestAction || options.trace === true;

  const dfs = makeDfs(game, cardIdentity, context, nodeLimitRef, shouldStoreBestAction);
  const result = dfs();

  const finalResult: SolveResult = {
    ...result,
    nodesExplored: nodeLimitRef.count,
    nodeLimitHit: nodeLimitRef.count >= nodeLimitRef.limit,
  };

  if (options.trace) {
    const tableTrace = replayBestPath(game, context);
    const tableTraceReachedTerminal =
      tableTrace.length > 0 && (tableTrace[tableTrace.length - 1].gameOver || tableTrace[tableTrace.length - 1].victory);
    finalResult.trace = tableTraceReachedTerminal ? tableTrace : replayBestPathByReSolve(game, context.originalDeck, options.nodeLimit);
  }

  return finalResult;
}

export function createSolverContext(originalDeck: DungeonCard[], options: SolverContextOptions = {}): SolverContext {
  const cardIdentityByKey = buildCardIdentityByKey(originalDeck);
  const maxCards = Math.max(originalDeck.length, 1);

  return {
    cardIdentityByKey,
    zobrist: createZobristTable(maxCards, maxCards),
    transpositionTable: new Map<bigint, TranspositionEntry>(),
    maxTranspositionEntries: options.maxTranspositionEntries ?? DEFAULT_MAX_TT_ENTRIES,
    storeBestAction: options.storeBestAction ?? false,
    originalDeck,
  };
}

export function resetSolverContext(context: SolverContext): void {
  context.transpositionTable.clear();
}

export function solve(game: Game, originalDeck: DungeonCard[], options: SolverOptions = {}): SolveResult {
  const context = createSolverContext(originalDeck, { storeBestAction: options.trace === true });
  return runSolve(game, context, options);
}

export function solveWithContext(game: Game, context: SolverContext, options: SolverOptions = {}): SolveResult {
  return runSolve(game, context, options);
}

export function solveRootActions(game: Game, options: SolverOptions = {}): SolveRootActionsResult {
  const context = createSolverContext(collectAllCardsFromGame(game));
  return solveRootActionsWithContext(game, context, options);
}

export function solveRootActionsWithContext(game: Game, context: SolverContext, options: SolverOptions = {}): SolveRootActionsResult {
  const cardIdentity = buildCardIdentityIndex(game, context);
  const nodeLimitRef: NodeLimitRef = { count: 0, limit: options.nodeLimit ?? Infinity };

  const dfs = makeDfs(game, cardIdentity, context, nodeLimitRef, context.storeBestAction || options.trace === true);
  const actions = game.getPossibleActions();
  const actionResults: RootActionResult[] = [];

  for (const action of actions) {
    doAction(game, action);
    const result = dfs();
    undoAction(game);
    actionResults.push({ action, victory: result.victory, score: result.score });
  }

  return {
    actionResults,
    nodesExplored: nodeLimitRef.count,
    nodeLimitHit: nodeLimitRef.count >= nodeLimitRef.limit,
  };
}

function actionPriority(action: GameAction, game: Game): number {
  if (action.actionType === "enterRoom") return 0;
  if (action.actionType === "skipRoom") return 1;
  if (action.actionType === "playCard") {
    if (action.card?.type === "weapon") return 2;
    if (action.card?.type === "monster" && action.mode === "weapon") {
      if (game.player.equippedWeapon && action.card.rank <= game.player.equippedWeapon.rank) return 3;
      return 4;
    }
    if (action.card?.type === "potion") return 5;
    if (action.card?.type === "monster" && action.mode === "barehanded") return 6;
  }
  return 7;
}

function isDominated(action: GameAction, allActions: GameAction[], game: Game): boolean {
  if (action.actionType === "playCard" && action.card?.type === "monster" && action.mode === "barehanded") {
    if (game.player.equippedWeapon && action.card.rank <= game.player.equippedWeapon.rank) {
      const hasWeaponAction = allActions.some(
        (a) =>
          a.actionType === "playCard" &&
          a.card?.type === "monster" &&
          a.mode === "weapon" &&
          a.card.suit === action.card!.suit &&
          a.card.rank === action.card!.rank,
      );
      if (hasWeaponAction) return true;
    }
  }

  if (action.actionType === "playCard" && action.card?.type === "potion" && game.player.potionTakenThisTurn) {
    return true;
  }

  return false;
}

function compareBetter(a: { victory: boolean; score: number }, b: { victory: boolean; score: number }): boolean {
  if (a.victory && !b.victory) return true;
  if (!a.victory && b.victory) return false;
  return a.score > b.score;
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

function undoAction(game: Game): void {
  game.undoLastAction();
}

function replayBestPath(rootGame: Game, context: SolverContext): SolveTraceStep[] {
  const replay = rootGame.clone();
  const replayCardIdentity = buildCardIdentityIndex(replay, context);
  const trace: SolveTraceStep[] = [];
  let step = 1;

  while (!replay.gameOver && !replay.victory) {
    const stateKey = zobristStateKey(replay, replayCardIdentity, context.zobrist);
    const cached = context.transpositionTable.get(stateKey);
    if (!cached?.bestAction) break;

    const healthBefore = replay.player.health;
    const deckBefore = replay.deck.length;
    const roomBefore = replay.currentRoom.cards.map((card) => card.toString());
    const action = cached.bestAction;

    doAction(replay, action);

    trace.push({
      step,
      action,
      healthBefore,
      healthAfter: replay.player.health,
      deckBefore,
      deckAfter: replay.deck.length,
      roomBefore,
      roomAfter: replay.currentRoom.cards.map((card) => card.toString()),
      gameOver: replay.gameOver,
      victory: replay.victory,
      scoreAfter: replay.calculateScore(),
    });
    step++;
  }

  return trace;
}

function replayBestPathByReSolve(rootGame: Game, originalDeck: DungeonCard[], nodeLimit?: number): SolveTraceStep[] {
  const replay = rootGame.clone();
  const trace: SolveTraceStep[] = [];
  let step = 1;
  const maxSteps = 1000;

  while (!replay.gameOver && !replay.victory && step <= maxSteps) {
    const actions = replay.getPossibleActions();
    if (actions.length === 0) break;
    actions.sort((a, b) => actionPriority(a, replay) - actionPriority(b, replay));

    let chosenAction: GameAction | undefined;
    let bestResult: { victory: boolean; score: number } | undefined;

    for (const action of actions) {
      const candidate = replay.clone();
      doAction(candidate, action);
      const result = solve(candidate, originalDeck, { trace: false, nodeLimit });

      if (!bestResult || compareBetter(result, bestResult)) {
        bestResult = result;
        chosenAction = action;
      }

      if (bestResult.victory) break;
    }

    if (!chosenAction) break;

    const healthBefore = replay.player.health;
    const deckBefore = replay.deck.length;
    const roomBefore = replay.currentRoom.cards.map((card) => card.toString());

    doAction(replay, chosenAction);

    trace.push({
      step,
      action: chosenAction,
      healthBefore,
      healthAfter: replay.player.health,
      deckBefore,
      deckAfter: replay.deck.length,
      roomBefore,
      roomAfter: replay.currentRoom.cards.map((card) => card.toString()),
      gameOver: replay.gameOver,
      victory: replay.victory,
      scoreAfter: replay.calculateScore(),
    });
    step++;
  }

  return trace;
}
