import Card from "../../../components/Card";
import { DungeonCard } from "../../../types/scoundrel";
import { rankToString } from "./ScoundrelGame";

export default function DeckDisplay({ deck }: { deck: DungeonCard[] }) {
  if (deck.length === 0) return null;
  return (
    <div className="flex flex-col items-center">
      <div>
        <Card suit={deck[0].suit as any} rank={rankToString(deck[0].rank) as any} faceUp={false} />
      </div>
      <div className="text-xs text-gray-800 dark:text-gray-200 mt-1">
        {deck.length} card{deck.length > 1 ? "s" : ""} left
      </div>
    </div>
  );
}
