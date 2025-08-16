import { useState } from "react";
import { DungeonCard, ScoundrelGameState } from "../../types/scoundrel";
import { avoidRoom, handleCardAction, initGame } from "./logic/engine";
import { simulateCardActionHealth } from "./logic/engine";
import ActionButtons from "./components/ActionButtons";
import EquippedWeapon from "./components/EquippedWeapon";
import RoomCards from "./components/RoomCards";
import DeckDisplay from "./components/DeckDisplay";
import MonsterAttackModal from "./components/MonsterAttackModal";
import DeathModal from "./components/DeathModal";

// Map numeric rank to string rank for Card component
export const rankToString = (rank: number): string => {
  if (rank === 14) return "A";
  if (rank === 13) return "K";
  if (rank === 12) return "Q";
  if (rank === 11) return "J";
  return rank.toString();
};

export default function ScoundrelGame() {
  const [game, setGame] = useState<ScoundrelGameState>(initGame());
  const [hoveredCard, setHoveredCard] = useState<DungeonCard | null>(null);

  // Unified handler for card click, always delegates to engine
  const handleCardClick = (card: DungeonCard) => {
    try {
      setGame((prev: ScoundrelGameState) => handleCardAction(prev, card));
    } catch (e: any) {
      alert(e.message || "Invalid action");
    }
  };

  // Compute simulated health if hovering a potion
  let simulatedHealth: number | null = null;
  if (hoveredCard && hoveredCard.type === "potion") {
    simulatedHealth = simulateCardActionHealth(game, hoveredCard);
  }

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Scoundrel</h1>
      <div className="mb-3 text-gray-800 dark:text-gray-100 ">
        Health:{" "}
        <span className="font-semibold">
          {game.health} / {game.maxHealth}
        </span>
        {simulatedHealth !== null && simulatedHealth !== game.health && (
          <span className="ml-2 px-2 py-1 text-green-500 font-semibold">
            {simulatedHealth} / {game.maxHealth}
          </span>
        )}
      </div>

      {/* Deck and Room side-by-side */}
      <div className="mb-4 flex flex-row items-top gap-8">
        {/* Deck pile display on the left */}
        <DeckDisplay deck={game.deck} />
        <RoomCards
          cards={game.currentRoom.cards}
          onCardClick={handleCardClick}
          onCardHover={setHoveredCard}
          onCardUnhover={() => setHoveredCard(null)}
        />
      </div>
      {/* Equipped Weapon display with stacked monsters */}
      <div className="mb-4 text-gray-800 dark:text-gray-100">
        Equipped Weapon: <EquippedWeapon weapon={game.equippedWeapon} monsters={game.monstersOnWeapon || []} />
      </div>
      {/* Action buttons */}
      <ActionButtons
        game={game}
        onSkipRoom={() => {
          if (game.canDeferRoom && !game.lastActionWasDefer && game.currentRoom.cards.length === 4) {
            setGame((prev: ScoundrelGameState) => avoidRoom(prev));
          }
        }}
        onRestart={() => setGame(initGame())}
      />

      {/* Monster attack choice modal */}
      <MonsterAttackModal
        isOpen={!!game.pendingMonsterChoice}
        onBarehand={() => {
          if (game.pendingMonsterChoice) {
            setGame((prev: ScoundrelGameState) => handleCardAction(prev, game.pendingMonsterChoice!.monster, "barehanded"));
          }
        }}
        onWeapon={() => {
          if (game.pendingMonsterChoice) {
            setGame((prev: ScoundrelGameState) => handleCardAction(prev, game.pendingMonsterChoice!.monster, "weapon"));
          }
        }}
        onClose={() => {
          setGame((prev: ScoundrelGameState) => ({
            ...prev,
            pendingMonsterChoice: undefined,
          }));
        }}
        barehandDamage={game.pendingMonsterChoice ? game.pendingMonsterChoice.monster.rank : 0}
        weaponDamage={
          game.pendingMonsterChoice && game.equippedWeapon
            ? Math.max(game.pendingMonsterChoice.monster.rank - game.equippedWeapon.rank, 0)
            : 0
        }
      />

      {/* Death modal when player is dead */}
      <DeathModal isOpen={!!game.gameOver} onRestart={() => setGame(initGame())} />
    </div>
  );
}
