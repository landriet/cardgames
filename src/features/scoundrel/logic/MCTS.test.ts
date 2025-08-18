// MCTS.test.ts
// Simple test/demo for Scoundrel MCTS AI
import { MCTS } from "./MCTS.ts";
import { ScoundrelMCTSGame } from "./ScoundrelMCTSGame.ts";
import { initGameWithStaticDeck } from "./engine.ts";

// build a specific deck to always test on the same

function runAIGameDemo(iterations = 1000) {
  let state = initGameWithStaticDeck();
  const gameAdapter = new ScoundrelMCTSGame(state);
  const mcts = new MCTS(gameAdapter, iterations);
  let turn = 0;
  while (!gameAdapter.gameOver(state)) {
    turn++;
    const move = mcts.selectMove();
    mcts.logRoot({ showChildren: true, maxChildren: 5 });
    const newState = gameAdapter.playMove(state, move);
    gameAdapter.setState(newState);
    mcts.advanceRoot(move, newState); // Advance MCTS tree to new state
    state = newState;
    console.log(`Turn ${turn}: AI chose card ${move.card.type} (rank ${move.card.rank})${move.mode ? ", mode: " + move.mode : ""}`);
    // Log the root node after each move for inspection
    if (state.gameOver) {
      console.log("Game Over! Score:", state.score);
      break;
    }
    if (state.victory) {
      console.log("Victory! Final health:", state.health);
      break;
    }
  }
}

// Run demo with default iterations
runAIGameDemo();

// Export for test runners
export { runAIGameDemo };
