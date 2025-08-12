import React, { useState } from "react";
import Card, { Rank as CardRank, Suit as CardSuit } from "../components/Card";
import { removeCardFromCurrentRoom } from "../features/scoundrel/logic/engine";
import type { DungeonCard, Room } from "../types/scoundrel";

// Mock cards for the room
const mockCards: DungeonCard[] = [
  { suit: "spades", rank: 2, type: "monster" },
  { suit: "hearts", rank: 5, type: "potion" },
  { suit: "diamonds", rank: 7, type: "weapon" },
  { suit: "clubs", rank: 9, type: "monster" },
];

export default {
  title: "Features/Room/RemoveCard",
  component: Card,
};

export const RemoveCardFromRoom = () => {
  const [room, setRoom] = useState<Room>({ cards: mockCards });

  const handleRemove = (idx: number) => {
    // Simulate state shape for removeCardFromCurrentRoom
    setRoom((prev) => {
      const fakeState = { currentRoom: prev } as any;
      const newState = removeCardFromCurrentRoom(fakeState, idx);
      return newState.currentRoom;
    });
  };

  // Helper to convert numeric rank to string for Card component
  const rankToString = (rank: number): CardRank => {
    if (rank === 14) return "A";
    if (rank === 13) return "K";
    if (rank === 12) return "Q";
    if (rank === 11) return "J";
    return rank.toString() as CardRank;
  };

  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex gap-2">
        {room.cards.map((card, idx) => (
          <div key={idx} className="flex flex-col items-center">
            <Card
              suit={card.suit as CardSuit}
              rank={rankToString(card.rank)}
              faceUp={true}
            />
            <button
              className="mt-2 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-700"
              onClick={() => handleRemove(idx)}
              data-testid={`remove-card-${idx}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {room.cards.length === 0 && (
        <div className="text-gray-500">Room is empty</div>
      )}
    </div>
  );
};
