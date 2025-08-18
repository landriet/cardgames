// Utility to stringify ScoundrelGameState for debugging/logging
import { ScoundrelGameState, DungeonCard, Room } from "../types/scoundrel";

function cardToString(card: DungeonCard | null): string {
  if (!card) return "null";
  return `${card.type}(${card.rank} of ${card.suit})`;
}

function roomToString(room: Room): string {
  return room.cards.map(cardToString).join(", ");
}

export function scoundrelGameStateToString(state: ScoundrelGameState): string {
  return [
    //`Deck: [${state.deck.map(cardToString).join(', ')}]`,
    // `Discard: [${state.discard.map(cardToString).join(', ')}]`,
    `Current Room: [${roomToString(state.currentRoom)}]`,
    `Next Room Base: ${cardToString(state.nextRoomBase)}`,
    `Equipped Weapon: ${cardToString(state.equippedWeapon)}`,
    `Last Monster Defeated: ${cardToString(state.lastMonsterDefeated)}`,
    `Monsters on Weapon: [${state.monstersOnWeapon.map(cardToString).join(", ")}]`,
    `Health: ${state.health}/${state.maxHealth}`,
    `Can Defer Room: ${state.canDeferRoom}`,
    `Last Action Was Defer: ${state.lastActionWasDefer}`,
    `Game Over: ${state.gameOver}`,
    `Victory: ${state.victory}`,
    `Potion Taken This Turn: ${state.potionTakenThisTurn ?? "n/a"}`,
    `Score: ${state.score ?? "n/a"}`,
    `Pending Monster Choice: ${state.pendingMonsterChoice ? cardToString(state.pendingMonsterChoice.monster) : "n/a"}`,
  ].join("\n");
}
