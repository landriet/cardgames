import { runPimcGame, PimcGameResult } from "./src/pimc";

console.debug = () => {};

const numGames = parseInt(process.argv[2] ?? "10", 10);
const numSamples = parseInt(process.argv[3] ?? "50", 10);

console.log(`PIMC Simulation: ${numGames} games, ${numSamples} samples per decision`);
console.log("---");

const startTotal = performance.now();
const results: PimcGameResult[] = [];

for (let i = 0; i < numGames; i++) {
  const startGame = performance.now();
  const result = runPimcGame(numSamples);
  const elapsed = performance.now() - startGame;
  results.push(result);

  console.log(
    `Game ${i + 1}: ${result.victory ? "WIN" : "LOSS"} | ` +
      `Score: ${result.score} | HP: ${result.health} | ` +
      `Moves: ${result.moves.length} | Time: ${(elapsed / 1000).toFixed(1)}s`,
  );
}

const totalElapsed = performance.now() - startTotal;
const wins = results.filter((r) => r.victory).length;
const scores = results.map((r) => r.score).sort((a, b) => a - b);
const avgScore = scores.reduce((s, v) => s + v, 0) / numGames;
const medianScore = numGames % 2 === 0 ? (scores[numGames / 2 - 1] + scores[numGames / 2]) / 2 : scores[Math.floor(numGames / 2)];

console.log("---");
console.log(`Win Rate: ${((wins / numGames) * 100).toFixed(1)}%`);
console.log(`Avg Score: ${avgScore.toFixed(1)}`);
console.log(`Median Score: ${medianScore.toFixed(1)}`);
console.log(`Total Time: ${(totalElapsed / 1000).toFixed(1)}s`);
