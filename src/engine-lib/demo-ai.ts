import { Game, MonsterCard, WeaponCard, PotionCard, Suit, Rank } from "./src/index";
import { bruteforce } from "./src/ai";
import workerpool from "workerpool";
import type { Pool } from "workerpool";

function buildStaticDeck(): Array<MonsterCard | WeaponCard | PotionCard> {
  // 7 monsters, 7 weapons, 6 potions
  const deck = [
    new MonsterCard("clubs", 10),
    new WeaponCard("diamonds", 8),
    new MonsterCard("clubs", 9),
    new MonsterCard("spades", 5),
    new MonsterCard("spades", 6),
    new MonsterCard("spades", 9),
    new WeaponCard("diamonds", 2),
    new MonsterCard("clubs", 11),
    new WeaponCard("diamonds", 3),
    new MonsterCard("spades", 7),
    new PotionCard("hearts", 2),
    new WeaponCard("diamonds", 5),
    new MonsterCard("clubs", 4),
    new WeaponCard("diamonds", 6),
    new MonsterCard("spades", 6),
    new PotionCard("hearts", 3),
    new MonsterCard("clubs", 2),
    new PotionCard("hearts", 4),
    new MonsterCard("clubs", 3),
    new MonsterCard("clubs", 7),
  ];
  return deck;
}

async function benchmarkAI(minSize = 7, maxSize = 20, pool: Pool) {
  const deck = Game.createDeck();
  const results: Array<{ size: number; timeMs: number; result: any }> = [];
  for (let size = minSize; size <= maxSize; size++) {
    const game = new Game(deck.slice(0, size));
    const start = performance.now();
    const result = await bruteforce(game, [], pool, false);
    const end = performance.now();
    results.push({ size, timeMs: end - start, result });
    console.log(`Deck size: ${size}, Time: ${(end - start).toFixed(2)}ms, Result:`, result);
  }
  return results;
}

async function main() {
  const cpuCount = require("os").cpus().length;
  const pool: Pool = workerpool.pool(__dirname + "/dist/ai.worker.js", { minWorkers: cpuCount, maxWorkers: cpuCount });
  await benchmarkAI(20, 20, pool);
  await pool.terminate();
}

main();
