import readline from "readline";
import { avoidRoom, enterRoom, handleCardAction, initGame } from "./features/scoundrel/logic/engine";
import { ScoundrelGameState } from "./types/scoundrel";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printState(state: ScoundrelGameState) {
  console.log("\n--- SC0UNDREL ---");
  console.log(`Health: ${state.health}/${state.maxHealth}`);
  console.log(`Equipped Weapon: ${state.equippedWeapon ? `${state.equippedWeapon.rank}` : "None"}`);
  console.log(`Monsters on Weapon: ${state.monstersOnWeapon?.map((m) => m.rank).join(", ") || "None"}`);
  console.log(`Room Cards:`);
  state.currentRoom.cards.forEach((card, i) => {
    console.log(`  [${i + 1}] ${card.type.toUpperCase()} (${card.suit} ${card.rank})`);
  });
  if (state.nextRoomBase) {
    console.log(`Next Room Base: ${state.nextRoomBase.type} (${state.nextRoomBase.suit} ${state.nextRoomBase.rank})`);
  }
  console.log(`Deck: ${state.deck.length} cards left`);
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function playGame() {
  let state = initGame();
  let inRoom = false;
  while (!state.gameOver && !state.victory) {
    printState(state);
    if (!inRoom) {
      // Room entry choice
      let choice = await ask("Avoid room (a) or enter room (e)? ");
      if (choice.toLowerCase() === "a") {
        state = avoidRoom(state);
        continue;
      } else if (choice.toLowerCase() === "e") {
        state = enterRoom(state);
        inRoom = true;
      } else {
        console.log("Invalid choice.");
        continue;
      }
    }
    // Resolve 3 of 4 cards
    let actions = 0;
    while (state.currentRoom.cards.length > 1 && actions < 3) {
      printState(state);
      let idxStr = await ask(`Choose a card to act on: `);
      let idx = parseInt(idxStr) - 1;
      if (isNaN(idx) || idx < 0 || idx >= state.currentRoom.cards.length) {
        console.log("Invalid card index.");
        continue;
      }
      let card = state.currentRoom.cards[idx];
      if (card.type === "monster") {
        let mode: "barehanded" | "weapon" = "barehanded";
        if (state.equippedWeapon) {
          let modeChoice = await ask("Fight with weapon (w) or barehanded (b)? ");
          if (modeChoice.toLowerCase() === "w") mode = "weapon";
        }
        state = handleCardAction(state, card, mode);
      } else if (card.type === "weapon") {
        state = handleCardAction(state, card);
      } else if (card.type === "potion") {
        state = handleCardAction(state, card);
      } else {
        console.log("Unknown card type.");
        continue;
      }
      actions++;
    }
  }
  printState(state);
  if (state.victory) {
    console.log("Congratulations! You won!");
  } else {
    console.log("Game Over!");
  }
  rl.close();
}

playGame();
