import { Game, MonsterCard, WeaponCard, PotionCard, Suit, Rank } from "./src/index";
import { bruteforce } from "./src/ai";

function buildStaticDeck(): Array<MonsterCard | WeaponCard | PotionCard> {
  // 7 monsters, 7 weapons, 6 potions
  const deck = [
    new MonsterCard("clubs", 10),
    new MonsterCard("clubs", 10),
    new MonsterCard("clubs", 10),
    new MonsterCard("clubs", 10),
    new WeaponCard("diamonds", 8),
    new MonsterCard("clubs", 3),
    new MonsterCard("spades", 5),
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

function benchmarkAI(minSize = 7, maxSize = 20) {
  const deck = Game.createDeck();
  const results: Array<{ size: number; timeMs: number; result: any }> = [];
  for (let size = minSize; size <= maxSize; size++) {
    const game = new Game(deck.slice(0, size));
    const start = performance.now();
    const result = bruteforce(game);
    const end = performance.now();
    results.push({ size, timeMs: end - start, result });
    console.log(`Deck size: ${size}, Time: ${(end - start).toFixed(2)}ms, Result:`, result);
  }
  return results;
}

function main() {
  // benchmarkAI(18, 18);

  const staticDeck = buildStaticDeck();
  const game = new Game(staticDeck);
  console.log("Starting game with static deck of size", staticDeck.length);
  const start = performance.now();
  const result = bruteforce(game);
  const end = performance.now();
  console.log(`Static deck size: ${staticDeck.length}, Time: ${(end - start).toFixed(2)}ms, Result:`, result);
}

main();
