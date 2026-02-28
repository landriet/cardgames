import { Game, Player, Room, MonsterCard, WeaponCard, PotionCard, DungeonCard, RuleConfig } from "../index";
import { compactStateKey, buildCardIndex, solve } from "../solver";

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
  game.lastAction = null;
  game.discard = opts.discard ?? [];
  return game;
}

describe("compactStateKey", () => {
  it("produces the same key for identical states", () => {
    const deck = [new MonsterCard("clubs", 2), new WeaponCard(4), new PotionCard(3), new MonsterCard("spades", 5)];
    const allCards = [...deck, new MonsterCard("clubs", 9), new MonsterCard("spades", 10)];
    const cardIndex = buildCardIndex(allCards);

    const game1 = createGameWithState({
      deck: deck.slice(0, 2),
      room: deck.slice(2),
      player: new Player(15, 20),
    });

    const game2 = createGameWithState({
      deck: [deck[1].clone(), deck[0].clone()], // different order, but sorted in key
      room: [deck[3].clone(), deck[2].clone()],
      player: new Player(15, 20),
    });

    expect(compactStateKey(game1, cardIndex)).toBe(compactStateKey(game2, cardIndex));
  });

  it("produces different keys when health differs", () => {
    const deck = [new MonsterCard("clubs", 2), new WeaponCard(4)];
    const cardIndex = buildCardIndex(deck);

    const game1 = createGameWithState({ deck, room: [], player: new Player(15, 20) });
    const game2 = createGameWithState({ deck: deck.map((c) => c.clone()), room: [], player: new Player(16, 20) });

    expect(compactStateKey(game1, cardIndex)).not.toBe(compactStateKey(game2, cardIndex));
  });

  it("produces different keys when weapon differs", () => {
    const deck = [new MonsterCard("clubs", 2)];
    const cardIndex = buildCardIndex(deck);

    const p1 = new Player(20, 20);
    p1.equippedWeapon = new WeaponCard(5);
    const p2 = new Player(20, 20);
    p2.equippedWeapon = new WeaponCard(8);

    const game1 = createGameWithState({ deck, room: [], player: p1 });
    const game2 = createGameWithState({ deck: deck.map((c) => c.clone()), room: [], player: p2 });

    expect(compactStateKey(game1, cardIndex)).not.toBe(compactStateKey(game2, cardIndex));
  });

  it("produces different keys when flags differ", () => {
    const deck = [new MonsterCard("clubs", 2)];
    const cardIndex = buildCardIndex(deck);

    const game1 = createGameWithState({ deck, room: [], player: new Player(20, 20), canDeferRoom: true });
    const game2 = createGameWithState({
      deck: deck.map((c) => c.clone()),
      room: [],
      player: new Player(20, 20),
      canDeferRoom: false,
    });

    expect(compactStateKey(game1, cardIndex)).not.toBe(compactStateKey(game2, cardIndex));
  });
});

describe("solve", () => {
  it("finds victory on a winning deck", () => {
    // Simple winning scenario: all potions, easy to survive
    // 4 potions in room, rest potions in deck, player at 20 health
    // Actually let's make a minimal deck: empty deck + empty room = victory
    const player = new Player(20, 20);
    const game = createGameWithState({
      deck: [],
      room: [],
      player,
    });
    game.victory = true; // already won

    const allCards: DungeonCard[] = [];
    const result = solve(game, allCards);
    expect(result.victory).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("finds victory on a small deck with weapons and weak monsters", () => {
    // Deck: weapon-10, then 3 weak monsters (rank 2,3,4)
    // Player can equip weapon and kill all with 0 damage
    const deck = [new WeaponCard(10), new MonsterCard("clubs", 2), new MonsterCard("spades", 3), new MonsterCard("clubs", 4)];
    const allCards = deck.map((c) => c.clone());

    const game = createGameWithState({
      deck: deck.slice(),
      room: [],
      player: new Player(20, 20),
    });
    // applyTurnRules to deal initial room
    game.applyTurnRules();

    const result = solve(game, allCards);
    expect(result.victory).toBe(true);
    expect(result.nodesExplored).toBeGreaterThan(0);
  });

  it("returns best score on a losing deck", () => {
    // All high monsters, no weapons — player will die
    const deck = [new MonsterCard("clubs", 14), new MonsterCard("spades", 14), new MonsterCard("clubs", 13), new MonsterCard("spades", 13)];
    const allCards = deck.map((c) => c.clone());

    const game = createGameWithState({
      deck: deck.slice(),
      room: [],
      player: new Player(20, 20),
    });
    game.applyTurnRules();

    const result = solve(game, allCards);
    expect(result.victory).toBe(false);
    expect(result.nodesExplored).toBeGreaterThan(0);
  });

  it("populates transposition table (nodesExplored is reasonable)", () => {
    // Medium deck: solver should explore multiple states
    const deck = [
      new WeaponCard(8),
      new PotionCard(5),
      new MonsterCard("clubs", 6),
      new MonsterCard("spades", 4),
      new MonsterCard("clubs", 3),
      new MonsterCard("spades", 2),
      new WeaponCard(5),
      new PotionCard(3),
    ];
    const allCards = deck.map((c) => c.clone());

    const game = createGameWithState({
      deck: deck.slice(),
      room: [],
      player: new Player(20, 20),
    });
    game.applyTurnRules();

    const result = solve(game, allCards);
    expect(result.nodesExplored).toBeGreaterThan(5);
    // With 8 cards and weapons, this should be solvable
    expect(result.victory).toBe(true);
  });

  it("solves a full standard game without crashing", () => {
    const deck = Game.createDeck();
    const allCards = deck.map((c) => c.clone());
    const game = new Game(deck.slice(), new Player());

    // Just verify it doesn't crash and returns a result
    const result = solve(game, allCards);
    expect(typeof result.victory).toBe("boolean");
    expect(typeof result.score).toBe("number");
    expect(result.nodesExplored).toBeGreaterThan(0);
  }, 30000); // allow up to 30s for a full game solve
});

describe("RuleConfig", () => {
  it("canSkipRooms: false prevents skipRoom actions", () => {
    const deck = [
      new MonsterCard("clubs", 14),
      new MonsterCard("spades", 14),
      new MonsterCard("clubs", 13),
      new MonsterCard("spades", 13),
      new MonsterCard("clubs", 12),
      new MonsterCard("spades", 12),
      new MonsterCard("clubs", 11),
      new MonsterCard("spades", 11),
    ];
    const game = new Game(deck.slice(), new Player(20, 20), { canSkipRooms: false });
    const actions = game.getPossibleActions();
    expect(actions.some((a) => a.actionType === "skipRoom")).toBe(false);
    expect(actions.some((a) => a.actionType === "enterRoom")).toBe(true);
  });

  it("weaponKillLimit: false allows killing stronger monsters with weapon", () => {
    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(5);
    player.lastMonsterDefeated = new MonsterCard("clubs", 3);

    const game = createGameWithState({
      deck: [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11), new MonsterCard("spades", 12)],
      room: [new MonsterCard("spades", 8), new PotionCard(3), new WeaponCard(4), new MonsterCard("clubs", 2)],
      player,
      roomBeingEntered: true,
    });
    game.rules = { ...DEFAULT_RULES, weaponKillLimit: false };

    const actions = game.getPossibleActions();
    // With weaponKillLimit: false, monster-spades-8 (rank > lastMonsterDefeated rank 3) should have weapon option
    const weaponActionForRank8 = actions.some(
      (a) => a.actionType === "playCard" && a.card?.type === "monster" && a.card.rank === 8 && a.mode === "weapon",
    );
    expect(weaponActionForRank8).toBe(true);
  });

  it("startingHealth and maxHealth are respected", () => {
    const game = new Game(undefined, undefined, { startingHealth: 15, maxHealth: 15 });
    expect(game.player.health).toBe(15);
    expect(game.player.maxHealth).toBe(15);
  });
});
