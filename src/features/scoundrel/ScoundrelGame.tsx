import { useEffect, useRef, useState } from "react";
import { DungeonCard, ScoundrelGameState } from "../../types/scoundrel";
import { avoidRoom, handleCardAction, initGame, simulateCardActionHealth } from "./logic/engineAdapter";
import type { SolverRequest, SolverResponse, WinnabilityStatus } from "./logic/winnability";
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

function getDeckSeedFromUrl(): number | undefined {
  const seedParam = new URLSearchParams(window.location.search).get("seed");
  if (seedParam === null) return undefined;
  const parsed = Number(seedParam);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function initGameFromUrlSeed(): ScoundrelGameState {
  return initGame({ deckSeed: getDeckSeedFromUrl() });
}

function labelForWinnabilityStatus(status: WinnabilityStatus): string {
  if (status === "computing") return "Calculating...";
  if (status === "winnable") return "Winnable";
  if (status === "not_winnable") return "Not Winnable";
  if (status === "victory") return "Victory";
  return "Defeat";
}

function classForWinnabilityStatus(status: WinnabilityStatus): string {
  if (status === "computing") return "bg-slate-500 text-white";
  if (status === "winnable" || status === "victory") return "bg-green-600 text-white";
  return "bg-red-600 text-white";
}

export default function ScoundrelGame() {
  const [game, setGame] = useState<ScoundrelGameState>(initGameFromUrlSeed());
  const [hoveredCard, setHoveredCard] = useState<DungeonCard | null>(null);
  const [winnabilityStatus, setWinnabilityStatus] = useState<WinnabilityStatus>("computing");
  const solverWorkerRef = useRef<Worker | null>(null);
  const latestSolverRequestRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL("./workers/winnabilityWorker.ts", import.meta.url), { type: "module" });
    solverWorkerRef.current = worker;

    worker.onmessage = (event: MessageEvent<SolverResponse>) => {
      const response = event.data;
      if (response.requestId !== latestSolverRequestRef.current) return;
      setWinnabilityStatus(response.status);
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error("Winnability worker failed", event.message);
    };

    return () => {
      worker.terminate();
      solverWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = solverWorkerRef.current;
    if (!worker) return;

    setWinnabilityStatus("computing");
    const requestId = latestSolverRequestRef.current + 1;
    latestSolverRequestRef.current = requestId;

    const request: SolverRequest = {
      requestId,
      gameState: game,
    };
    worker.postMessage(request);
  }, [game]);

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

  // 44 cards start in the deck (full Scoundrel deck), 4 dealt per room
  const totalCardsDealt = 44 - game.deck.length;
  const currentRoom = Math.max(1, Math.ceil(totalCardsDealt / 4));

  // Calculate health percentage for the bar
  const healthPercent = Math.max(0, Math.min(100, Math.round((game.health / game.maxHealth) * 100)));

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Scoundrel</h1>
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-gray-800 dark:text-gray-100 flex items-center gap-4">
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
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-300">Room {currentRoom}</div>
          <div className={`px-2 py-1 text-sm font-semibold rounded ${classForWinnabilityStatus(winnabilityStatus)}`}>
            {labelForWinnabilityStatus(winnabilityStatus)}
          </div>
        </div>
      </div>

      {/* Deck and Room side-by-side */}
      <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
        <div className="flex flex-row items-top gap-8">
          {/* Deck pile display on the left */}
          <DeckDisplay deck={game.deck} />
          <RoomCards
            cards={game.currentRoom.cards}
            onCardClick={handleCardClick}
            onCardHover={setHoveredCard}
            onCardUnhover={() => setHoveredCard(null)}
            hoveredCard={hoveredCard}
            equippedWeapon={game.equippedWeapon}
            health={game.health}
            maxHealth={game.maxHealth}
          />
        </div>
      </div>
      {/* Equipped Weapon display with stacked monsters */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-sm font-semibold mb-1 text-gray-800 dark:text-gray-100">Equipped Weapon</div>
        <EquippedWeapon weapon={game.equippedWeapon} monsters={game.monstersOnWeapon || []} />
      </div>
      {/* Action buttons */}
      <ActionButtons
        game={game}
        onSkipRoom={() => {
          if (game.canDeferRoom && !game.lastActionWasDefer && game.currentRoom.cards.length === 4) {
            setGame((prev: ScoundrelGameState) => avoidRoom(prev));
          }
        }}
        onRestart={() => setGame(initGameFromUrlSeed())}
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
      <DeathModal isOpen={!!game.gameOver} onRestart={() => setGame(initGameFromUrlSeed())} score={game.score} />
    </div>
  );
}
