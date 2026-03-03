import { Game, Player, Room, MonsterCard, WeaponCard, PotionCard, DungeonCard, RuleConfig } from "../index";

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

describe("Rules compliance", () => {
  it("weapon fights keep killed monster on weapon and out of discard", () => {
    const player = new Player(20, 20);
    player.equippedWeapon = new WeaponCard(10);
    const monster = new MonsterCard("clubs", 5);

    const game = createGameWithState({
      deck: [new MonsterCard("spades", 9), new MonsterCard("clubs", 10), new MonsterCard("spades", 11)],
      room: [monster, new PotionCard(3), new WeaponCard(4), new MonsterCard("spades", 2)],
      player,
      roomBeingEntered: true,
    });

    game.handleCardAction(monster, "weapon");

    expect(game.player.monstersOnWeapon.some((m) => m.suit === "clubs" && m.rank === 5)).toBe(true);
    expect(game.discard.some((c) => c.type === "monster" && c.suit === "clubs" && c.rank === 5)).toBe(false);
  });

  it("ends room entry after resolving exactly three cards", () => {
    const player = new Player(20, 20);
    const game = createGameWithState({
      deck: [],
      room: [new PotionCard(3), new MonsterCard("clubs", 2), new MonsterCard("spades", 4), new WeaponCard(5)],
      player,
      roomBeingEntered: false,
    });

    game.enterRoom();
    game.handleCardAction(new PotionCard(3));
    game.handleCardAction(new MonsterCard("clubs", 2), "barehanded");
    game.handleCardAction(new MonsterCard("spades", 4), "barehanded");

    expect(game.roomBeingEntered).toBe(false);
    expect(game.currentRoom.cards.length).toBe(1);
    expect(game.getPossibleActions().some((a) => a.actionType === "playCard")).toBe(false);
    expect(game.getPossibleActions().some((a) => a.actionType === "enterRoom")).toBe(true);
  });

  it("does not deal a new room mid-entry when fewer than three cards are available", () => {
    const player = new Player(20, 20);
    const game = createGameWithState({
      deck: [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11)],
      room: [new PotionCard(3), new MonsterCard("spades", 2)],
      player,
      roomBeingEntered: false,
    });

    game.enterRoom();
    const deckBefore = game.deck.length;
    game.handleCardAction(new PotionCard(3));

    expect(game.roomBeingEntered).toBe(true);
    expect(game.currentRoom.cards.length).toBe(1);
    expect(game.deck.length).toBe(deckBefore);
  });

  it("allows avoid room when dungeon is empty", () => {
    const game = createGameWithState({
      deck: [],
      room: [new MonsterCard("clubs", 8)],
      player: new Player(20, 20),
      canDeferRoom: true,
      lastActionWasDefer: false,
      roomBeingEntered: false,
    });

    const actions = game.getPossibleActions();
    expect(actions.some((a) => a.actionType === "skipRoom")).toBe(true);

    game.avoidRoom();
    expect(game.lastActionWasDefer).toBe(true);
    expect(game.currentRoom.cards.length).toBe(1);
  });

  it("uses death scoring without clamping health", () => {
    const game = createGameWithState({
      deck: [new MonsterCard("clubs", 4), new WeaponCard(5), new MonsterCard("spades", 7)],
      room: [],
      player: new Player(-2, 20),
    });
    game.gameOver = true;

    expect(game.calculateScore()).toBe(-13);
  });

  it("applies victory potion bonus when health is 20 and last resolved card was a potion", () => {
    const game = createGameWithState({
      deck: [],
      room: [],
      player: new Player(20, 20),
    });
    game.victory = true;
    game.lastResolvedCardType = "potion";
    game.lastResolvedPotionValue = 6;

    expect(game.calculateScore()).toBe(26);
  });
});
