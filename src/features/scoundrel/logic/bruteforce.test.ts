import { bruteforceAllPaths } from "./bruteforce.ts";
import { initGameWithStaticDeck } from "./engine.ts";

const initialState = initGameWithStaticDeck();
const allPaths = bruteforceAllPaths(initialState);
console.log(`Total terminal paths: ${allPaths.length}`);
allPaths.forEach((result, i) => {
  console.log(`Path #${i + 1}:`, result.path);
  // Optionally inspect result.state for final game state
});
