import readline from "readline";
import { Game } from "./src/index";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printState(game: Game) {
  console.log("\n--- SC0UNDREL (engine-lib demo) ---");
  console.log(`Health: ${game.player.health}/${game.player.maxHealth}`);
  console.log(`Equipped Weapon: ${game.player.equippedWeapon ? `${game.player.equippedWeapon.rank}` : "None"}`);
  console.log(`Monsters on Weapon: ${game.player.monstersOnWeapon?.map((m) => m.rank).join(", ") || "None"}`);
  console.log(`Room Cards:`);
  game.currentRoom.cards.forEach((card, i) => {
    console.log(`  [${i + 1}] ${card.type.toUpperCase()} (${card.suit} ${card.rank})`);
  });
  console.log(`Deck: ${game.deck.length} cards left`);
}

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function playGame() {
  const game = new Game();
  let inRoom = false;
  while (!game.gameOver && !game.victory) {
    printState(game);
    if (!inRoom) {
      let choice = await ask("Avoid room (a) or enter room (e)? ");
      if (choice.toLowerCase() === "a") {
        game.avoidRoom();
        continue;
      } else if (choice.toLowerCase() === "e") {
        game.enterRoom();
        inRoom = true;
      } else {
        console.log("Invalid choice.");
        continue;
      }
    }
    let actions = 0;
    while (game.currentRoom.cards.length > 1 && actions < 3) {
      //check game state before acting
      if (game.gameOver || game.victory) break;

      printState(game);
      let idxStr = await ask(`Choose a card to act on: `);
      let idx = parseInt(idxStr) - 1;
      if (isNaN(idx) || idx < 0 || idx >= game.currentRoom.cards.length) {
        console.log("Invalid card index.");
        continue;
      }
      let card = game.currentRoom.cards[idx];
      if (card.type === "monster") {
        let mode: "barehanded" | "weapon" = "barehanded";
        if (game.player.equippedWeapon) {
          let modeChoice = await ask("Fight with weapon (w) or barehanded (b)? ");
          if (modeChoice.toLowerCase() === "w") mode = "weapon";
        }
        game.handleCardAction(card, mode);
      } else if (card.type === "weapon") {
        game.handleCardAction(card);
      } else if (card.type === "potion") {
        game.handleCardAction(card);
      } else {
        console.log("Unknown card type.");
        continue;
      }
      actions++;
    }
  }
  printState(game);
  if (game.victory) {
    console.log("Congratulations! You won!");
  } else {
    console.log("Game Over!");
  }
  rl.close();
}

playGame();
