/**
 * Targeted test to isolate which undo operation causes card duplication.
 * Tests each undo path (enterRoom, avoidRoom, handleCardAction) with
 * card uniqueness assertions.
 */
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
  cardsResolvedThisTurn?: number;
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
  game.cardsResolvedThisTurn = opts.cardsResolvedThisTurn ?? 0;
  game.lastResolvedCardType = null;
  game.lastResolvedPotionValue = null;
  game.lastAction = null;
  game.discard = opts.discard ?? [];
  return game;
}

function cardKey(card: DungeonCard): string {
  return `${card.type}-${card.suit}-${card.rank}`;
}

function allCardKeys(game: Game): string[] {
  const keys: string[] = [];
  for (const c of game.deck) keys.push("deck:" + cardKey(c));
  for (const c of game.currentRoom.cards) keys.push("room:" + cardKey(c));
  for (const c of game.discard) keys.push("discard:" + cardKey(c));
  for (const c of game.player.monstersOnWeapon) keys.push("weapon-stack:" + cardKey(c));
  if (game.player.equippedWeapon) keys.push("equipped:" + cardKey(game.player.equippedWeapon));
  return keys;
}

function findDuplicateCard(game: Game): string | null {
  const seen = new Map<string, string>();
  const zones: Array<{ name: string; cards: DungeonCard[] }> = [
    { name: "deck", cards: game.deck },
    { name: "room", cards: game.currentRoom.cards },
    { name: "discard", cards: game.discard },
    { name: "weapon-stack", cards: game.player.monstersOnWeapon },
  ];
  if (game.player.equippedWeapon) {
    zones.push({ name: "equipped", cards: [game.player.equippedWeapon] });
  }
  for (const zone of zones) {
    for (const card of zone.cards) {
      const key = cardKey(card);
      if (seen.has(key)) {
        return `${key} in ${seen.get(key)} AND ${zone.name}`;
      }
      seen.set(key, zone.name);
    }
  }
  return null;
}

function snapshotState(game: Game): string {
  return JSON.stringify({
    deck: game.deck.map(cardKey).sort(),
    room: game.currentRoom.cards.map(cardKey).sort(),
    discard: game.discard.map(cardKey).sort(),
    hp: game.player.health,
    weapon: game.player.equippedWeapon ? cardKey(game.player.equippedWeapon) : null,
    monstersOnWeapon: game.player.monstersOnWeapon.map(cardKey).sort(),
    roomBeingEntered: game.roomBeingEntered,
    canDeferRoom: game.canDeferRoom,
    lastActionWasDefer: game.lastActionWasDefer,
    cardsResolved: game.cardsResolvedThisTurn,
  });
}

describe("undoHandleCardAction card duplication", () => {
  it("undo of a playCard that triggers dealRoom does not duplicate cards", () => {
    // Setup: room has 2 cards (already resolved 2 cards), deck has 3+
    // Playing the 3rd card triggers cardsResolvedThisTurn >= 3, roomBeingEntered = false
    // Then applyTurnRules triggers dealRoom since room has 1 card left
    const deck = [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11)];
    const room = [new MonsterCard("spades", 2), new WeaponCard(5)];
    const game = createGameWithState({
      deck: deck.slice(),
      room: room.map((c) => c.clone()),
      player: new Player(20, 20),
      roomBeingEntered: true,
      cardsResolvedThisTurn: 2, // already resolved 2 cards
    });

    const before = snapshotState(game);
    expect(findDuplicateCard(game)).toBeNull();

    // Play weapon — this is the 3rd card, triggers roomBeingEntered=false + dealRoom
    game.handleCardAction(new WeaponCard(5));
    expect(findDuplicateCard(game)).toBeNull();

    // Undo
    game.undoHandleCardAction();
    const after = snapshotState(game);

    expect(findDuplicateCard(game)).toBeNull();
    expect(after).toBe(before);
  });

  it("undo of barehanded monster that triggers dealRoom does not duplicate cards", () => {
    const deck = [new WeaponCard(8), new PotionCard(3), new MonsterCard("clubs", 4)];
    const room = [new MonsterCard("spades", 6), new MonsterCard("clubs", 2)];
    const game = createGameWithState({
      deck: deck.slice(),
      room: room.map((c) => c.clone()),
      player: new Player(20, 20),
      roomBeingEntered: true,
      cardsResolvedThisTurn: 2,
    });

    const before = snapshotState(game);
    expect(findDuplicateCard(game)).toBeNull();

    // Play monster barehanded — 3rd card, triggers dealRoom
    game.handleCardAction(new MonsterCard("clubs", 2), "barehanded");
    expect(findDuplicateCard(game)).toBeNull();

    // Undo
    game.undoHandleCardAction();
    expect(findDuplicateCard(game)).toBeNull();
    expect(snapshotState(game)).toBe(before);
  });

  it("undo of potion that triggers dealRoom does not duplicate cards", () => {
    const deck = [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11)];
    const room = [new PotionCard(5), new MonsterCard("spades", 3)];
    const game = createGameWithState({
      deck: deck.slice(),
      room: room.map((c) => c.clone()),
      player: new Player(15, 20),
      roomBeingEntered: true,
      cardsResolvedThisTurn: 2,
    });

    const before = snapshotState(game);
    expect(findDuplicateCard(game)).toBeNull();

    game.handleCardAction(new PotionCard(5));
    expect(findDuplicateCard(game)).toBeNull();

    game.undoHandleCardAction();
    expect(findDuplicateCard(game)).toBeNull();
    expect(snapshotState(game)).toBe(before);
  });
});

describe("undoAvoidRoom card duplication", () => {
  it("undo of avoidRoom does not duplicate cards", () => {
    const deck = [
      new MonsterCard("clubs", 5),
      new MonsterCard("spades", 6),
      new MonsterCard("clubs", 7),
      new MonsterCard("spades", 8),
      new MonsterCard("clubs", 9),
      new MonsterCard("spades", 11),
      new MonsterCard("clubs", 12),
      new MonsterCard("spades", 13),
    ];
    const room = [new PotionCard(3), new WeaponCard(4), new MonsterCard("clubs", 2), new MonsterCard("spades", 10)];
    const game = createGameWithState({
      deck: deck.slice(),
      room: room.map((c) => c.clone()),
      player: new Player(20, 20),
      canDeferRoom: true,
      lastActionWasDefer: false,
    });

    const before = snapshotState(game);
    expect(findDuplicateCard(game)).toBeNull();

    game.avoidRoom();
    expect(findDuplicateCard(game)).toBeNull();

    game.undoAvoidRoom();
    expect(findDuplicateCard(game)).toBeNull();
    expect(snapshotState(game)).toBe(before);
  });
});

describe("Multi-step undo sequences with card duplication check", () => {
  it("enterRoom -> play 3 cards (triggering deal) -> undo all preserves uniqueness", () => {
    const deck = [new MonsterCard("clubs", 9), new MonsterCard("spades", 10), new MonsterCard("clubs", 11), new MonsterCard("spades", 12)];
    const room = [new WeaponCard(8), new PotionCard(5), new MonsterCard("clubs", 3), new MonsterCard("spades", 4)];
    const game = createGameWithState({
      deck: deck.slice(),
      room: room.map((c) => c.clone()),
      player: new Player(20, 20),
    });

    const before = snapshotState(game);
    expect(findDuplicateCard(game)).toBeNull();

    // Enter room
    game.enterRoom();
    expect(findDuplicateCard(game)).toBeNull();

    // Play weapon (1st card)
    game.handleCardAction(new WeaponCard(8));
    expect(findDuplicateCard(game)).toBeNull();

    // Play potion (2nd card)
    game.handleCardAction(new PotionCard(5));
    expect(findDuplicateCard(game)).toBeNull();

    // Play monster with weapon (3rd card) — triggers deal
    game.handleCardAction(new MonsterCard("clubs", 3), "weapon");
    expect(findDuplicateCard(game)).toBeNull();

    // Now undo all three plays + enterRoom
    game.undoHandleCardAction(); // undo 3rd play (reverses deal)
    expect(findDuplicateCard(game)).toBeNull();

    game.undoHandleCardAction(); // undo 2nd play
    expect(findDuplicateCard(game)).toBeNull();

    game.undoHandleCardAction(); // undo 1st play
    expect(findDuplicateCard(game)).toBeNull();

    game.undoEnterRoom(); // undo enter
    expect(findDuplicateCard(game)).toBeNull();

    expect(snapshotState(game)).toBe(before);
  });

  it("avoidRoom -> enterRoom -> play cards -> undo all preserves uniqueness", () => {
    const deck = [
      new MonsterCard("clubs", 2),
      new MonsterCard("spades", 3),
      new MonsterCard("clubs", 4),
      new MonsterCard("spades", 5),
      new MonsterCard("clubs", 6),
      new MonsterCard("spades", 7),
      new MonsterCard("clubs", 8),
      new MonsterCard("spades", 9),
      new WeaponCard(10),
      new PotionCard(2),
      new MonsterCard("clubs", 10),
      new MonsterCard("spades", 11),
    ];
    const room = [new PotionCard(5), new WeaponCard(4), new MonsterCard("clubs", 14), new MonsterCard("spades", 14)];
    const game = createGameWithState({
      deck: deck.slice(),
      room: room.map((c) => c.clone()),
      player: new Player(20, 20),
      canDeferRoom: true,
      lastActionWasDefer: false,
    });

    const before = snapshotState(game);
    expect(findDuplicateCard(game)).toBeNull();

    // Avoid room
    game.avoidRoom();
    expect(findDuplicateCard(game)).toBeNull();

    // Enter the new room
    game.enterRoom();
    expect(findDuplicateCard(game)).toBeNull();

    // Play first card
    const firstRoomCard = game.currentRoom.cards[0];
    game.handleCardAction(firstRoomCard, firstRoomCard.type === "monster" ? "barehanded" : undefined);
    expect(findDuplicateCard(game)).toBeNull();

    // Undo all
    game.undoHandleCardAction();
    expect(findDuplicateCard(game)).toBeNull();

    game.undoEnterRoom();
    expect(findDuplicateCard(game)).toBeNull();

    game.undoAvoidRoom();
    expect(findDuplicateCard(game)).toBeNull();

    expect(snapshotState(game)).toBe(before);
  });
});
