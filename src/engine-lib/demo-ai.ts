import { Game } from "./src/index";
import { bruteforce } from "./src/ai";

function main() {
  const game = new Game();
  const result = bruteforce(game);
  console.log("Bruteforce result:", result);
}

main();
