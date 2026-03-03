import { useState } from "react";
import { DungeonCard, ScoundrelGameState } from "../../types/scoundrel";
import { avoidRoom, handleCardAction, initGame, simulateCardActionHealth } from "./logic/engineAdapter";
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
  const canUseWeaponOnPendingMonster = !!(
    game.pendingMonsterChoice &&
    game.equippedWeapon &&
    (!game.lastMonsterDefeated || game.pendingMonsterChoice.monster.rank <= game.lastMonsterDefeated.rank)
  );

  // Calculate health percentage for the bar
  const healthPercent = Math.max(0, Math.min(100, Math.round((game.health / game.maxHealth) * 100)));

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Scoundrel</h1>
      <div className="mb-3 text-gray-800 dark:text-gray-100 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span>Health:</span>
          {/* Health bar */}
          <div className="w-32 h-4 bg-gray-300 dark:bg-gray-700 rounded overflow-hidden border border-gray-400 dark:border-gray-600">
            <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${healthPercent}%` }}></div>
          </div>
          <span className="font-semibold">
            {game.health} / {game.maxHealth}
          </span>
          {simulatedHealth !== null && simulatedHealth !== game.health && (
            <span className="text-green-500 font-semibold">
              {simulatedHealth} / {game.maxHealth}
            </span>
          )}
        </div>
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
          if (game.pendingMonsterChoice && canUseWeaponOnPendingMonster) {
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
        canUseWeapon={canUseWeaponOnPendingMonster}
      />

      {/* Death modal when player is dead */}
      <DeathModal isOpen={!!game.gameOver} onRestart={() => setGame(initGame())} score={game.score} />
    </div>
  );
}
