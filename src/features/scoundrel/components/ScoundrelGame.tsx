import { useState } from 'react';
import { initGame, handleCardAction, avoidRoom } from '../logic/engine';
import { ScoundrelGameState, DungeonCard } from '../../../types/scoundrel';
import Card from '../../../components/Card';
import Modal from '../../../components/Modal';
import MonsterAttackChoice from '../../../components/MonsterAttackChoice';

// Map numeric rank to string rank for Card component
export const rankToString = (rank: number): string => {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return rank.toString();
};

export default function ScoundrelGame() {
  const [game, setGame] = useState<ScoundrelGameState>(initGame());

  // Unified handler for card click, always delegates to engine
  const handleCardClick = (card: DungeonCard) => {
    try {
      setGame((prev: ScoundrelGameState) => handleCardAction(prev, card));
    } catch (e: any) {
      alert(e.message || 'Invalid action');
    }
  } 

  return (
    <div className="p-4 max-w-xl mx-auto bg-white dark:bg-gray-900">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Scoundrel</h1>
      <div className="mb-2 text-gray-800 dark:text-gray-100">
        Health:{' '}
        <span className="font-mono">
          {game.health} / {game.maxHealth}
        </span>
      </div>

      {/* Deck and Room side-by-side */}
      <div className="mb-4 flex flex-row items-center gap-8">
        {/* Deck pile display on the left */}
        {game.deck.length > 0 && (
          <div className="flex flex-col items-center">
            <div className="">
              {/* Show only one card if more than one remains */}
              <div className="">
                <Card suit={game.deck[0].suit as any} rank={rankToString(game.deck[0].rank) as any} faceUp={false} />
              </div>
            </div>
            <div className="text-xs text-gray-800 dark:text-gray-200 mt-1">{game.deck.length} card{game.deck.length > 1 ? 's' : ''} left</div>
          </div>
        )}
        {/* Room cards on the right */}
        <div className="flex-1">
          <div className="flex gap-2 mt-2">
            {game.currentRoom.cards.map((card: DungeonCard, idx: number) => (
              <div
                key={idx}
                className="flex flex-col items-center cursor-pointer hover:scale-105 transition-transform"
                onClick={() => handleCardClick(card)}
                tabIndex={0}
                role="button"
                aria-label={`Interact with ${card.type}`}
              >
                <Card
                  suit={card.suit as any}
                  rank={rankToString(card.rank) as any}
                  faceUp={true}
                />
                <div className="text-xs text-gray-800 dark:text-gray-200 mt-1">{card.type}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Equipped Weapon display with stacked monsters */}
      <div className="mb-4 text-gray-800 dark:text-gray-100">
        Equipped Weapon:{' '}
        {game.equippedWeapon ? (
          <span className="relative inline-block ml-2" style={{ minWidth: '80px', minHeight: '120px' }}>
            {/* Weapon card at base */}
            <div className="absolute top-0 left-0 z-10">
              <Card
                suit={game.equippedWeapon.suit as any}
                rank={rankToString(game.equippedWeapon.rank) as any}
                faceUp={true}
              />
            </div>
            {/* Stack monsters on weapon, each offset lower and right */}
            {game.monstersOnWeapon && game.monstersOnWeapon.map((monster: DungeonCard, idx: number) => (
              <div
                key={idx}
                className="absolute z-20"
                style={{ top: `${(idx + 1) * 16}px`, left: `${(idx + 1) * 30}px` }}
              >
                <Card
                  suit={monster.suit as any}
                  rank={rankToString(monster.rank) as any}
                  faceUp={true}
                />
              </div>
            ))}
          </span>
        ) : (
          <span className="font-mono">None</span>
        )}
      </div>
      {/* Action buttons */}
      <div className="flex gap-4 mt-8">
        <button
          className={`px-4 py-2 rounded ${game.canDeferRoom && !game.lastActionWasDefer && game.currentRoom.cards.length === 4 ? 'bg-yellow-600 text-white hover:bg-yellow-700' : 'bg-gray-400 text-gray-200 cursor-not-allowed'}`}
          onClick={() => {
            if (game.canDeferRoom && !game.lastActionWasDefer && game.currentRoom.cards.length === 4) {
          setGame((prev: ScoundrelGameState) => avoidRoom(prev));
            }
          }}
          disabled={!game.canDeferRoom || game.lastActionWasDefer || game.currentRoom.cards.length !== 4}
        >
          Skip Room
        </button>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => setGame(initGame())}
        >
          Restart Game
        </button>
      </div>

      {/* Monster attack choice modal */}
      <Modal
        isOpen={!!game.pendingMonsterChoice}
        onClose={() => {
          setGame((prev: ScoundrelGameState) => ({ ...prev, pendingMonsterChoice: undefined }));
        }}
        ariaLabel="Choose attack mode"
      >
        <MonsterAttackChoice
          onBarehand={() => {
            if (game.pendingMonsterChoice) {
              setGame((prev: ScoundrelGameState) => handleCardAction(prev, game.pendingMonsterChoice!.monster, 'barehanded'));
            }
          }}
          onWeapon={() => {
            if (game.pendingMonsterChoice) {
              setGame((prev: ScoundrelGameState) => handleCardAction(prev, game.pendingMonsterChoice!.monster, 'weapon'));
            }
          }}
        />
      </Modal>
    </div>
  );
}
