import { useState } from 'react';

import { initGame } from '../logic/engine';
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

  // TODO: Add handlers for actions (attack, equip, use potion, defer room)

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Scoundrel</h1>
      <div className="mb-2">Health: <span className="font-mono">{game.health} / {game.maxHealth}</span></div>
      <div className="mb-2">Equipped Weapon: <span className="font-mono">{game.equippedWeapon ? cardLabel(game.equippedWeapon) : 'None'}</span></div>
      <div className="mb-4">
        <h2 className="font-semibold">Current Room</h2>
        <div className="flex gap-2 mt-2">
          {game.currentRoom.cards.map((card, idx) => (
            <div key={idx} className="flex flex-col items-center">
              <Card
                suit={card.suit as any}
                rank={rankToString(card.rank) as any}
                faceUp={true}
              />
              <div className="text-xs text-gray-500 mt-1">{card.type}</div>
            </div>
          ))}
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
