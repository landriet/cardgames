import React from 'react';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface CardProps {
  suit: Suit;
  rank: Rank;
  faceUp?: boolean;
  className?: string;
}

const suitSymbols: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const suitColors: Record<Suit, string> = {
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
  clubs: 'text-black',
  spades: 'text-black',
};

export const Card: React.FC<CardProps> = ({ suit, rank, faceUp = true, className = '' }) => {
  return (
    <div
      className={`w-20 h-32 rounded-lg shadow-lg border border-gray-300 bg-white flex items-center justify-center relative select-none ${className}`}
    >
      {faceUp ? (
        <div className="w-full h-full flex flex-col justify-between p-2">
          <div className={`text-lg font-bold ${suitColors[suit]}`}>{rank}</div>
          <div className="flex-1 flex items-center justify-center">
            <span className={`text-3xl ${suitColors[suit]}`}>{suitSymbols[suit]}</span>
          </div>
          <div className={`text-lg font-bold text-right ${suitColors[suit]}`}>{rank}</div>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-blue-600 rounded-lg">
          <span className="text-white text-2xl font-bold">🂠</span>
        </div>
      )}
    </div>
  );
};

export default Card;
