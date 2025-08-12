import Card from "../../../components/Card";
import { DungeonCard } from "../../../types/scoundrel";
import { rankToString } from "./ScoundrelGame";

export default function RoomCards({
  cards,
  onCardClick,
}: {
  cards: (DungeonCard | undefined)[];
  onCardClick: (card: DungeonCard) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 mt-2">
      {[0, 1, 2, 3].map((idx) => {
        const card = cards[idx];
        return (
          <div
            key={idx}
            className="relative flex flex-col items-center justify-center h-32 w-20 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50 dark:bg-gray-800 transition-transform"
            tabIndex={card ? 0 : -1}
            role={card ? "button" : undefined}
            aria-label={card ? `Interact with ${card.type}` : `Empty spot`}
            onClick={card ? () => onCardClick(card) : undefined}
            style={{ minWidth: "85px", minHeight: "128px" }}
          >
            {card ? (
              <Card
                suit={card.suit as any}
                rank={rankToString(card.rank) as any}
                faceUp={true}
              />
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                &nbsp;
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
