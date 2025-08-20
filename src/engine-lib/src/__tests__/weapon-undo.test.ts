import { Game, Player, Room, WeaponCard, MonsterCard } from "../index";

describe("Weapon Equip Undo Logic", () => {
  it("undoes weapon equip with no previous weapon", () => {
    const player = new Player(10, 10);
    const weapon = new WeaponCard("diamonds", 7);
    const room = new Room([weapon]);
    const game = new Game([], player);
    game.currentRoom = room;
    game.handleCardAction(weapon);
    expect(player.equippedWeapon).toEqual(weapon);
    expect(room.cards).not.toContain(weapon);
    game.undoHandleCardAction();
    expect(player.equippedWeapon).toBeNull();
    expect(room.cards).toContainEqual(weapon);
  });

  it("undoes weapon equip with previous weapon and monsters", () => {
    const player = new Player(10, 10);
    const oldWeapon = new WeaponCard("diamonds", 5);
    const newWeapon = new WeaponCard("diamonds", 7);
    player.equippedWeapon = oldWeapon;
    player.monstersOnWeapon = [new MonsterCard("spades", 3), new MonsterCard("spades", 2)];
    const room = new Room([newWeapon]);
    const game = new Game([], player);
    game.currentRoom = room;

    game.handleCardAction(newWeapon);
    expect(player.equippedWeapon).toEqual(newWeapon);
    expect(player.monstersOnWeapon).toEqual([]);
    expect(room.cards).not.toContain(newWeapon);

    game.undoHandleCardAction();
    expect(player.equippedWeapon).toEqual(oldWeapon);
    expect(player.monstersOnWeapon).toEqual([new MonsterCard("spades", 3), new MonsterCard("spades", 2)]);
    expect(room.cards).toContainEqual(newWeapon);
  });
});
