import React from "react";

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export interface CardProps {
  suit: Suit;
  rank: Rank;
  faceUp?: boolean;
  className?: string;
}

const suitSymbols: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const suitColors: Record<Suit, string> = {
  hearts: "text-red-600",
  diamonds: "text-red-600",
  clubs: "text-black",
  spades: "text-black",
};

export const Card: React.FC<CardProps> = ({ suit, rank, faceUp = true, className = "" }) => {
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
        <div className="w-full h-full flex items-center justify-center rounded-lg bg-blue-800 border-2 border-white relative overflow-hidden">
          {/* Subtle geometric pattern background using SVG */}
          <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 80 128" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="dots" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="1.5" fill="white" />
              </pattern>
            </defs>
            <rect width="80" height="128" fill="url(#dots)" />
          </svg>
          {/* Central medallion */}
          <div className="z-10 flex flex-col items-center">
            <div className="w-10 h-10 rounded-full border-2 border-white flex items-center justify-center bg-blue-700 shadow-inner">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-white">
                <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" />
                <circle cx="12" cy="12" r="3" fill="white" />
              </svg>
            </div>
            {/* Optional: add a small flourish below */}
            <svg width="32" height="8" viewBox="0 0 32 8" fill="none" className="mt-1">
              <path d="M2 4 Q8 0 16 4 Q24 8 30 4" stroke="white" strokeWidth="1.2" fill="none" />
            </svg>
          </div>
          {/* White border inside the card for double border effect */}
          <div className="absolute inset-1 rounded-md border border-white pointer-events-none" />
        </div>
      )}
    </div>
  );
};

export default Card;
