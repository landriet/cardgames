import Card from "../../../components/Card";
import { DungeonCard } from "../../../types/scoundrel";
import { rankToString } from "../ScoundrelGame";

export default function RoomCards({
  cards,
  onCardClick,
  onCardHover,
  onCardUnhover,
  hoveredCard,
  equippedWeapon: _equippedWeapon,
  health,
  maxHealth,
}: {
  cards: (DungeonCard | undefined)[];
  onCardClick: (card: DungeonCard) => void;
  onCardHover?: (card: DungeonCard) => void;
  onCardUnhover?: () => void;
  hoveredCard: DungeonCard | null;
  /** Accepted for future use (e.g. weapon-adjusted damage preview); not used in badge computation yet. */
  equippedWeapon: DungeonCard | null;
  health: number;
  maxHealth: number;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {[0, 1, 2, 3].map((idx) => {
        const card = cards[idx];
        const hoverGlowClass = card
          ? {
              monster: "hover:ring-2 hover:ring-red-400 hover:shadow-lg",
              weapon: "hover:ring-2 hover:ring-blue-400 hover:shadow-lg",
              potion: "hover:ring-2 hover:ring-green-400 hover:shadow-lg",
            }[card.type]
          : "";
        return (
          <div
            key={idx}
            className={`relative flex flex-col items-center justify-center rounded-lg transition-all duration-150 ${
              card
                ? `cursor-pointer hover:scale-105 active:scale-95 ${hoverGlowClass}`
                : "border-2 border-dashed border-gray-300 dark:border-gray-600"
            }`}
            tabIndex={card ? 0 : -1}
            role={card ? "button" : undefined}
            aria-label={card ? `Interact with ${card.type}` : `Empty spot`}
            onClick={card ? () => onCardClick(card) : undefined}
            onMouseEnter={card && onCardHover ? () => onCardHover(card) : undefined}
            onMouseLeave={card && onCardUnhover ? () => onCardUnhover() : undefined}
            style={{ minWidth: "85px", minHeight: "128px" }}
          >
            {card ? (
              <>
                <Card suit={card.suit as any} rank={rankToString(card.rank) as any} faceUp={true} cardType={card.type} />
                {hoveredCard === card && card.type === "monster" && (
                  <div className="absolute top-1 right-1 bg-red-600 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow z-30">
                    -{card.rank}
                  </div>
                )}
                {hoveredCard === card && card.type === "potion" && (
                  <div className="absolute top-1 right-1 bg-green-600 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow z-30">
                    +{Math.min(card.rank, maxHealth - health)}
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">&nbsp;</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
