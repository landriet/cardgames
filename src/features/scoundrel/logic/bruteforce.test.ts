import { initGameWithStaticDeck } from "./engine.ts";
import { countWinningPaths } from "./bruteforce.ts";

console.log("Running brute-force win path count...");
const state = initGameWithStaticDeck();
const winCount = countWinningPaths(state);
console.log("Total winning paths:", winCount);
