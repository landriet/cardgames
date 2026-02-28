import { DungeonCard, Game, GameAction, MonsterCard, PotionCard, WeaponCard } from "./index";

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
  // Deck: sorted list of original-deck indices
  const deckIds = game.deck.map((c) => cardIndex.get(cardKey(c))!).sort((a, b) => a - b);

  // Room: sorted list of original-deck indices
  const roomIds = game.currentRoom.cards.map((c) => cardIndex.get(cardKey(c))!).sort((a, b) => a - b);

  // Player state
  const health = game.player.health;
  const weaponRank = game.player.equippedWeapon ? game.player.equippedWeapon.rank : 0;
  const lastMonsterRank = game.player.lastMonsterDefeated ? game.player.lastMonsterDefeated.rank : 0;
  const monstersOnWeapon = game.player.monstersOnWeapon.map((m) => m.rank).sort((a, b) => a - b);

  // Flags packed into a single hex char (4 bits)
  const flags =
    (game.player.potionTakenThisTurn ? 1 : 0) |
    (game.canDeferRoom ? 2 : 0) |
    (game.lastActionWasDefer ? 4 : 0) |
    (game.roomBeingEntered ? 8 : 0);

  return `${deckIds.join(",")}|${roomIds.join(",")}|${health}|${weaponRank}|${lastMonsterRank}|${monstersOnWeapon.join(",")}|${flags.toString(16)}`;
}

// --- Solver ---

export interface SolveResult {
  victory: boolean;
  score: number;
  nodesExplored: number;
}

export function solve(game: Game, originalDeck: DungeonCard[]): SolveResult {
  const cardIndex = buildCardIndex(originalDeck);
  const transpositionTable = new Map<string, { victory: boolean; score: number }>();
  let nodesExplored = 0;

  function dfs(): { victory: boolean; score: number } {
    nodesExplored++;

    // Terminal checks
    if (game.gameOver) {
      return { victory: false, score: game.calculateScore() };
    }
    if (game.victory) {
      return { victory: true, score: game.calculateScore() };
    }

    // Transposition table lookup
    const stateKey = compactStateKey(game, cardIndex);
    const cached = transpositionTable.get(stateKey);
    if (cached) return cached;

    const actions = game.getPossibleActions();
    if (actions.length === 0) {
      const result = { victory: false, score: game.calculateScore() };
      transpositionTable.set(stateKey, result);
      return result;
    }

    // Sort actions: weapons → weapon-kills → potions → barehanded
    actions.sort((a, b) => actionPriority(a, game) - actionPriority(b, game));

    // Start with current state score as baseline (in case all actions are pruned)
    let best: { victory: boolean; score: number } = { victory: false, score: game.calculateScore() };

    for (const action of actions) {
      // Dominated strategy pruning
      if (isDominated(action, actions, game)) continue;

      // Simulate death check for barehanded fights
      if (
        action.actionType === "playCard" &&
        action.card?.type === "monster" &&
        action.mode === "barehanded" &&
        game.player.health <= action.card.rank
      ) {
        continue; // Would die, prune
      }

      // Simulate death check for weapon fights
      if (action.actionType === "playCard" && action.card?.type === "monster" && action.mode === "weapon" && game.player.equippedWeapon) {
        const damage = Math.max(action.card.rank - game.player.equippedWeapon.rank, 0);
        if (game.player.health <= damage) continue; // Would die, prune
      }

      doAction(game, action);
      const result = dfs();
      undoAction(game);

      if (!best || compareBetter(result, best)) {
        best = result;
      }

      // Victory cutoff — can't do better than winning
      if (best.victory) break;
    }

    transpositionTable.set(stateKey, best);
    return best;
  }

  const result = dfs();
  return { ...result, nodesExplored };
}

function actionPriority(action: GameAction, game: Game): number {
  if (action.actionType === "enterRoom") return 0;
  if (action.actionType === "skipRoom") return 1;
  if (action.actionType === "playCard") {
    if (action.card?.type === "weapon") return 2;
    if (action.card?.type === "monster" && action.mode === "weapon") {
      // Zero-damage weapon kill gets highest card priority
      if (game.player.equippedWeapon && action.card.rank <= game.player.equippedWeapon.rank) return 3;
      return 4;
    }
    if (action.card?.type === "potion") return 5;
    if (action.card?.type === "monster" && action.mode === "barehanded") return 6;
  }
  return 7;
}

function isDominated(action: GameAction, allActions: GameAction[], game: Game): boolean {
  // If a zero-damage weapon kill is available for this monster, skip barehanded for the same monster
  if (action.actionType === "playCard" && action.card?.type === "monster" && action.mode === "barehanded") {
    if (game.player.equippedWeapon && action.card.rank <= game.player.equippedWeapon.rank) {
      // There's a weapon action for this same card that does 0 damage — barehanded is dominated
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

  // Second potion in a room is a no-op
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
