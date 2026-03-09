import Card from "../../../components/Card";
import { DungeonCard } from "../../../types/scoundrel";
import { rankToString } from "../ScoundrelGame";

export default function EquippedWeapon({ weapon, monsters }: { weapon: DungeonCard | null; monsters: DungeonCard[] }) {
  if (!weapon) {
    return <span className="font-mono text-gray-500 dark:text-gray-400">None</span>;
  }

  return (
    <div className="flex flex-row items-start">
      <div className="flex-shrink-0">
        <Card suit={weapon.suit as any} rank={rankToString(weapon.rank) as any} faceUp={true} />
      </div>
      {monsters.map((monster: DungeonCard, idx: number) => (
        <div key={idx} className="flex-shrink-0 -ml-12">
          <Card suit={monster.suit as any} rank={rankToString(monster.rank) as any} faceUp={true} />
        </div>
      ))}
    </div>
  );
}
