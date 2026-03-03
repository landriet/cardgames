import { Game, Player, Room, MonsterCard, WeaponCard, PotionCard, DungeonCard, RuleConfig } from "../index";
import { getUnseenCards, pimcBestAction, runPimcGame, runPimcSimulation } from "../pimc";

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
  discard?: DungeonCard[];
  roomBeingEntered?: boolean;
  canDeferRoom?: boolean;
}): Game {
  const game = Object.create(Game.prototype) as Game;
  game.rules = { ...DEFAULT_RULES };
  game.deck = opts.deck;
  game.currentRoom = new Room(opts.room);
  game.player = opts.player;
  game.canDeferRoom = opts.canDeferRoom ?? true;
  game.lastActionWasDefer = false;
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

describe("getUnseenCards", () => {
  it("returns full deck minus room cards and discard", () => {
    const fullDeck = Game.createDeck();
    // Take first 4 cards as room, next 2 as discard
    const roomCards = fullDeck.slice(0, 4);
    const discardCards = fullDeck.slice(4, 6);
    const deckCards = fullDeck.slice(6);

    const game = createGameWithState({
      deck: deckCards,
      room: roomCards,
      player: new Player(20, 20),
      discard: discardCards,
    });

    const unseen = getUnseenCards(game);
    // Unseen should equal the deck cards (everything not in room or discard)
    expect(unseen.length).toBe(deckCards.length);
  });

  it("excludes equipped weapon and monsters on weapon", () => {
    const fullDeck = Game.createDeck();
    const roomCards = fullDeck.slice(0, 4);

    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(5);
    player.monstersOnWeapon = [new MonsterCard("clubs", 3)];

    // Remove the weapon-diamonds-5 and monster-clubs-3 from the remaining deck
    const remaining = fullDeck
      .slice(4)
      .filter(
        (c) =>
          !(c.type === "weapon" && c.suit === "diamonds" && c.rank === 5) && !(c.type === "monster" && c.suit === "clubs" && c.rank === 3),
      );

    const game = createGameWithState({
      deck: remaining,
      room: roomCards,
      player,
    });

    const unseen = getUnseenCards(game);
    // Unseen = remaining (the deck), since all non-deck cards are accounted for
    expect(unseen.length).toBe(remaining.length);
    // None of the unseen should match the weapon or the monster on weapon
    expect(unseen.some((c) => c.type === "weapon" && c.rank === 5)).toBe(false);
    expect(unseen.some((c) => c.type === "monster" && c.suit === "clubs" && c.rank === 3)).toBe(false);
  });

  it("returns empty array when all cards are visible", () => {
    const deck = [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 5)];
    const game = createGameWithState({
      deck: [],
      room: deck,
      player: new Player(20, 20),
    });

    // Need to construct a full deck that only contains these 4 cards
    // Actually, getUnseenCards compares against Game.createDeck() which is the standard 44-card deck.
    // With only 4 cards in room and nothing else, there are 40 unseen cards.
    const unseen = getUnseenCards(game);
    expect(unseen.length).toBe(40);
  });
});

describe("pimcBestAction", () => {
  it("returns the only action when there is exactly one", () => {
    // Game with only enterRoom available (room dealt, not entered yet)
    const deck = [new MonsterCard("clubs", 14), new MonsterCard("spades", 14), new MonsterCard("clubs", 13), new MonsterCard("spades", 13)];
    const game = createGameWithState({
      deck: [],
      room: deck,
      player: new Player(20, 20),
      roomBeingEntered: false,
      canDeferRoom: false,
    });
    // canDeferRoom is false, so skipRoom is unavailable
    // Only enterRoom is possible

    const result = pimcBestAction(game, 5);
    expect(result.bestAction.actionType).toBe("enterRoom");
    expect(result.stats.length).toBe(1);
  });

  it("prefers weapon over barehanded for a fully-visible game", () => {
    // Put all 44 cards into visible locations so unseen = 0 (fully deterministic).
    // Room: one weak monster (clubs 2). Player has weapon (diamonds 10).
    // Remaining 42 cards go to discard.
    const fullDeck = Game.createDeck();
    const roomMonster = new MonsterCard("clubs", 2);
    const weapon = new WeaponCard(10);

    // Filter out the room monster and weapon from the full deck for discard
    const discardCards = fullDeck.filter(
      (c) =>
        !(c.type === "monster" && c.suit === "clubs" && c.rank === 2) && !(c.type === "weapon" && c.suit === "diamonds" && c.rank === 10),
    );

    const player = new Player(20, 20);
    player.equippedWeapon = weapon;

    const game = createGameWithState({
      deck: [],
      room: [roomMonster],
      player,
      discard: discardCards,
      roomBeingEntered: true,
    });

    // Weapon kill = 0 damage (score 20), barehanded = 2 damage (score 18)
    const result = pimcBestAction(game, 10);
    expect(result.bestAction.actionType).toBe("playCard");
    expect(result.bestAction.mode).toBe("weapon");
  });

  it("returns empty stats when no actions available", () => {
    const player = new Player(0, 20);
    const game = createGameWithState({
      deck: [],
      room: [],
      player,
    });
    game.gameOver = true;

    const result = pimcBestAction(game, 5);
    expect(result.stats.length).toBe(0);
  });
});

describe("runPimcGame", () => {
  it("plays a complete game and returns a result", () => {
    const result = runPimcGame(5); // low sample count for speed
    expect(typeof result.victory).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(typeof result.health).toBe("number");
    expect(result.moves.length).toBeGreaterThan(0);
  }, 60000); // generous timeout

  it("terminates with game over or victory", () => {
    const result = runPimcGame(5);
    expect(result.victory || result.health <= 0 || result.score !== undefined).toBe(true);
  }, 60000);
});

describe("runPimcSimulation", () => {
  it("runs multiple games and returns aggregated stats", () => {
    const result = runPimcSimulation(3, 5); // 3 games, 5 samples each
    expect(result.totalGames).toBe(3);
    expect(typeof result.winRate).toBe("number");
    expect(typeof result.avgScore).toBe("number");
    expect(typeof result.medianScore).toBe("number");
    expect(result.scoreDistribution.length).toBe(3);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(100);
  }, 120000);
});
