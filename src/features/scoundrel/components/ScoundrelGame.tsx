import { useState } from 'react';

import { initGame, fightMonster, takeWeapon } from '../logic/engine';
import { ScoundrelGameState, DungeonCard } from '../../../types/scoundrel';
import Card from '../../../components/Card';

// Map numeric rank to string rank for Card component
const rankToString = (rank: number): string => {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return rank.toString();
};

const cardLabel = (card: DungeonCard) => {
  const rank = rankToString(card.rank);
  return `${rank} ${card.suit.charAt(0).toUpperCase() + card.suit.slice(1)}`;
};

export default function ScoundrelGame() {
  const [game, setGame] = useState<ScoundrelGameState>(initGame());

  // Handler to fight a monster barehanded
  const handleFightBarehanded = (monster: DungeonCard) => {
    setGame((prev: ScoundrelGameState) => fightMonster(prev, monster, 'barehanded'));
  };

  // Handler to equip a weapon
  const handleEquipWeapon = (weapon: DungeonCard) => {
    setGame((prev: ScoundrelGameState) => takeWeapon(prev, weapon));
  };

  // Handler to fight a monster with weapon
  const handleFightWithWeapon = (monster: DungeonCard) => {
    try {
      setGame((prev: ScoundrelGameState) => fightMonster(prev, monster, 'weapon'));
    } catch (e: any) {
      alert(e.message || 'Cannot fight with weapon');
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto bg-white dark:bg-gray-900">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Scoundrel</h1>
      <div className="mb-2 text-gray-800 dark:text-gray-100">
        Health:{' '}
        <span className="font-mono">
          {game.health} / {game.maxHealth}
        </span>
      </div>
      <div className="mb-2 text-gray-800 dark:text-gray-100">
        Equipped Weapon:{' '}
        {game.equippedWeapon ? (
          <span className="inline-flex flex-col items-center ml-2">
            <Card
              suit={game.equippedWeapon.suit as any}
              rank={rankToString(game.equippedWeapon.rank) as any}
              faceUp={true}
            />
          </span>
        ) : (
          <span className="font-mono">None</span>
        )}
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
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Current Room</h2>
          <div className="flex gap-2 mt-2">
            {game.currentRoom.cards.map((card: DungeonCard, idx: number) => (
              <div key={idx} className="flex flex-col items-center">
                <Card
                  suit={card.suit as any}
                  rank={rankToString(card.rank) as any}
                  faceUp={true}
                />
                <div className="text-xs text-gray-800 dark:text-gray-200 mt-1">{card.type}</div>
                {card.type === 'monster' && (
                  <>
                    <button
                      className="mt-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                      onClick={() => handleFightBarehanded(card)}
                    >
                      Fight Barehanded
                    </button>
                    {game.equippedWeapon && (
                      <button
                        className="mt-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 ml-1"
                        onClick={() => handleFightWithWeapon(card)}
                      >
                        Fight with Weapon
                      </button>
                    )}
                  </>
                )}
                {card.type === 'weapon' && (
                  <button
                    className="mt-1 px-2 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700"
                    onClick={() => handleEquipWeapon(card)}
                  >
                    Equip Weapon
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* TODO: Add action buttons and game over/victory display */}
      <button
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        onClick={() => setGame(initGame())}
      >
        Restart Game
      </button>
    </div>
  );
}
