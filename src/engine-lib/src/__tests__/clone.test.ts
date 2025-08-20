import { Game, Player, Room, MonsterCard, WeaponCard, PotionCard, DungeonCard } from "../index";

describe("Game.clone", () => {
  it("deep clones a Game instance and preserves prototypes", () => {
    const player = new Player(15, 20);
    player.equippedWeapon = new WeaponCard(10);
    player.monstersOnWeapon = [new MonsterCard("spades", 5)];
    player.lastMonsterDefeated = new MonsterCard("spades", 5);
    player.potionTakenThisTurn = true;

    const room = new Room([new MonsterCard("clubs", 7), new PotionCard(5), new WeaponCard(8)]);
    const deck = [new MonsterCard("hearts", 3), new WeaponCard(9), new PotionCard(4)];
    const discard = [new MonsterCard("diamonds", 6), new PotionCard(2)];

    const game = new Game([], player);
    game.deck = deck;
    game.currentRoom = room;
    game.discard = discard;
    game.canDeferRoom = false;
    game.lastActionWasDefer = true;
    game.gameOver = true;
    game.victory = false;
    game.roomBeingEntered = true;

    const clone = game.clone();

    expect(clone).not.toBe(game);
    expect(clone.player).not.toBe(game.player);
    expect(clone.currentRoom).not.toBe(game.currentRoom);
    expect(clone.deck).not.toBe(game.deck);
    expect(clone.discard).not.toBe(game.discard);

    expect(clone instanceof Game).toBe(true);
    expect(clone.player instanceof Player).toBe(true);
    expect(clone.currentRoom instanceof Room).toBe(true);

    expect(clone.player.health).toBe(15);
    expect(clone.player.maxHealth).toBe(20);
    expect(clone.player.equippedWeapon?.rank).toBe(10);
    expect(clone.player.monstersOnWeapon[0].suit).toBe("spades");
    expect(clone.player.lastMonsterDefeated?.rank).toBe(5);
    expect(clone.player.potionTakenThisTurn).toBe(true);

    expect(clone.currentRoom.cards.length).toBe(3);
    expect(clone.currentRoom.cards[0].type).toBe("monster");
    expect(clone.currentRoom.cards[1].type).toBe("potion");
    expect(clone.currentRoom.cards[2].type).toBe("weapon");

    expect(clone.deck.length).toBe(3);
    expect(clone.deck[0].type).toBe("monster");
    expect(clone.deck[1].type).toBe("weapon");
    expect(clone.deck[2].type).toBe("potion");

    expect(clone.discard.length).toBe(2);
    expect(clone.discard[0].type).toBe("monster");
    expect(clone.discard[1].type).toBe("potion");

    expect(clone.canDeferRoom).toBe(false);
    expect(clone.lastActionWasDefer).toBe(true);
    expect(clone.gameOver).toBe(true);
    expect(clone.victory).toBe(false);
    expect(clone.roomBeingEntered).toBe(true);
  });

  it("cloning is performant for large decks", () => {
    const deck: DungeonCard[] = [];
    for (let i = 0; i < 10000; i++) {
      deck.push(new MonsterCard("spades", ((i % 13) + 2) as import("../index").Rank));
    }
    const player = new Player(20, 20);
    const game = new Game([], player);
    game.deck = deck;

    const start = performance.now();
    const clone = game.clone();
    const end = performance.now();

    expect(clone.deck.length).toBe(10000);
    expect(end - start).toBeLessThan(100); // Should clone in under 100ms
  });
});
