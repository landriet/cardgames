import { Game, MonsterCard, WeaponCard, PotionCard, Suit, Rank } from "./src/index";
import { bruteforce } from "./src/ai";

function buildStaticDeck(): Array<MonsterCard | WeaponCard | PotionCard> {
  // 7 monsters, 7 weapons, 6 potions
  const deck = [
    new MonsterCard("clubs", 3),
    new MonsterCard("spades", 5),
    new WeaponCard("diamonds", 8),
    new MonsterCard("spades", 6),
    new MonsterCard("spades", 9),
    new WeaponCard("diamonds", 2),
    new WeaponCard("diamonds", 3),
    new PotionCard("hearts", 2),
    new WeaponCard("diamonds", 5),
    new MonsterCard("clubs", 4),
    new WeaponCard("diamonds", 6),
    new PotionCard("hearts", 3),
    new MonsterCard("clubs", 2),
  ];
  return deck;
}

function main() {
  const staticDeck = buildStaticDeck();
  const game = new Game(staticDeck);
  const result = bruteforce(game);
  console.log("Bruteforce result:", result);
}

main();
