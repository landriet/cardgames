import { initGame, handleCardAction, enterRoom, avoidRoom } from "./features/scoundrel/logic/engine.ts";
import * as ScoundrelTypes from "./types/scoundrel.ts";

// Simple simulation: play a game with random actions
function randomAction(state: ScoundrelTypes.ScoundrelGameState): ScoundrelTypes.ScoundrelGameState {
  if (state.gameOver || state.victory) return state;
  // Randomly choose to avoid or enter room
  if (state.canDeferRoom && Math.random() < 0.2) {
    return avoidRoom(state);
  } else {
    let newState = enterRoom(state);
    // Play 3 of 4 cards in the room
    for (let i = 0; i < 3; i++) {
      const card = newState.currentRoom.cards[0];
      newState = handleCardAction(newState, card);
    }
    return newState;
  }
}

function runSimulation() {
  let state = initGame();
  let steps = 0;
  while (!state.gameOver && !state.victory && steps < 100) {
    state = randomAction(state);
    steps++;
  }
  console.log("Game Over:", state.gameOver, "Victory:", state.victory, "Score:", state.score);
}

runSimulation();
