import { Game, Player, Room, MonsterCard, WeaponCard, PotionCard, DungeonCard, RuleConfig } from "../index";
import { solve } from "../solver";

const DEFAULT_RULES: Required<RuleConfig> = {
  startingHealth: 20,
  maxHealth: 20,
  potionsPerRoom: 1,
  canSkipRooms: true,
  canSkipConsecutive: false,
  weaponKillLimit: true,
};

function createGameWithState(opts: {
  deck: DungeonCard[];
  room: DungeonCard[];
  player: Player;
  canDeferRoom?: boolean;
  lastActionWasDefer?: boolean;
  roomBeingEntered?: boolean;
  discard?: DungeonCard[];
}): Game {
  const game = Object.create(Game.prototype) as Game;
  game.rules = { ...DEFAULT_RULES };
  game.deck = opts.deck;
  game.currentRoom = new Room(opts.room);
  game.player = opts.player;
  game.canDeferRoom = opts.canDeferRoom ?? true;
  game.lastActionWasDefer = opts.lastActionWasDefer ?? false;
  game.gameOver = false;
  game.victory = false;
  game.roomBeingEntered = opts.roomBeingEntered ?? false;
  game.cardsResolvedThisTurn = 0;
  game.lastResolvedCardType = null;
  game.lastResolvedPotionValue = null;
  game.lastAction = null;
  game.discard = opts.discard ?? [];
  return game;
}

function cardKey(card: DungeonCard): string {
  return `${card.type}-${card.suit}-${card.rank}`;
}

function findDuplicateCard(game: Game): string | null {
  const seen = new Map<string, number>();
  const allCards: DungeonCard[] = [...game.deck, ...game.currentRoom.cards, ...game.discard, ...game.player.monstersOnWeapon];
  if (game.player.equippedWeapon) {
    allCards.push(game.player.equippedWeapon);
  }
  for (const card of allCards) {
    const key = cardKey(card);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) return key;
  }
  return null;
}

function findDuplicateInRoomStrings(roomCards: string[]): string | null {
  const seen = new Set<string>();
  for (const card of roomCards) {
    if (seen.has(card)) return card;
    seen.add(card);
  }
  return null;
}

describe("Card uniqueness: DFS undo/redo integrity", () => {
  it("maintains card uniqueness after every undo/redo cycle on a medium deck", () => {
    const deck: DungeonCard[] = [
      new WeaponCard(8),
      new PotionCard(5),
      new MonsterCard("clubs", 6),
      new MonsterCard("spades", 4),
      new MonsterCard("clubs", 3),
      new MonsterCard("spades", 2),
      new WeaponCard(5),
      new PotionCard(3),
    ];

    const game = createGameWithState({
      deck: deck.slice(),
      room: [],
      player: new Player(20, 20),
    });
    game.applyTurnRules();

    function dfsCheck(depth: number): void {
      if (game.gameOver || game.victory || depth > 100) return;

      const dup = findDuplicateCard(game);
      if (dup) {
        throw new Error(
          `Duplicate card "${dup}" found at depth ${depth}. ` +
            `Deck: [${game.deck.map(cardKey).join(", ")}], ` +
            `Room: [${game.currentRoom.cards.map(cardKey).join(", ")}], ` +
            `Discard: [${game.discard.map(cardKey).join(", ")}]`,
        );
      }

      const actions = game.getPossibleActions();
      for (const action of actions) {
        if (action.actionType === "enterRoom") {
          game.enterRoom();
        } else if (action.actionType === "skipRoom") {
          game.avoidRoom();
        } else if (action.actionType === "playCard" && action.card) {
          if (action.card.type === "monster" && action.mode === "barehanded" && game.player.health <= action.card.rank) continue;
          if (action.card.type === "monster" && action.mode === "weapon" && game.player.equippedWeapon) {
            const damage = Math.max(action.card.rank - game.player.equippedWeapon.rank, 0);
            if (game.player.health <= damage) continue;
          }
          game.handleCardAction(action.card, action.mode);
        }

        dfsCheck(depth + 1);
        game.undoLastAction();

        const undoDup = findDuplicateCard(game);
        if (undoDup) {
          throw new Error(
            `Duplicate card "${undoDup}" found AFTER UNDO at depth ${depth}. ` +
              `Deck: [${game.deck.map(cardKey).join(", ")}], ` +
              `Room: [${game.currentRoom.cards.map(cardKey).join(", ")}], ` +
              `Discard: [${game.discard.map(cardKey).join(", ")}]`,
          );
        }

        // Only explore first action per depth to keep runtime reasonable
        break;
      }
    }

    dfsCheck(0);
  });
});

describe("Card uniqueness: solver trace replay", () => {
  it("trace never contains duplicate cards on a medium deck", () => {
    const deck: DungeonCard[] = [
      new WeaponCard(8),
      new PotionCard(5),
      new MonsterCard("clubs", 6),
      new MonsterCard("spades", 4),
      new MonsterCard("clubs", 3),
      new MonsterCard("spades", 2),
      new WeaponCard(5),
      new PotionCard(3),
    ];
    const originalDeck = deck.map((c) => c.clone());
    const game = createGameWithState({
      deck: deck.slice(),
      room: [],
      player: new Player(20, 20),
    });
    game.applyTurnRules();

    const result = solve(game, originalDeck, { trace: true });
    expect(result.trace).toBeDefined();
    expect(result.trace!.length).toBeGreaterThan(0);

    for (const step of result.trace!) {
      const dupInRoomAfter = findDuplicateInRoomStrings(step.roomAfter);
      if (dupInRoomAfter) {
        throw new Error(
          `Step ${step.step} (${step.action.actionType}): duplicate "${dupInRoomAfter}" in roomAfter: [${step.roomAfter.join(", ")}]`,
        );
      }
      const dupInRoomBefore = findDuplicateInRoomStrings(step.roomBefore);
      if (dupInRoomBefore) {
        throw new Error(
          `Step ${step.step} (${step.action.actionType}): duplicate "${dupInRoomBefore}" in roomBefore: [${step.roomBefore.join(", ")}]`,
        );
      }
    }
  });
});
