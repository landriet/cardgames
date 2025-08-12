import Card from "../../../components/Card";
import { DungeonCard } from "../../../types/scoundrel";
import { rankToString } from "./ScoundrelGame";

export default function EquippedWeapon({
  weapon,
  monsters,
}: {
  weapon: DungeonCard | null;
  monsters: DungeonCard[];
}) {
  return (
    <span
      className="relative inline-block ml-2"
      style={{ minWidth: "80px", minHeight: "120px" }}
    >
      {weapon ? (
        <>
          <div className="absolute top-0 left-0 z-10">
            <Card
              suit={weapon.suit as any}
              rank={rankToString(weapon.rank) as any}
              faceUp={true}
            />
          </div>
          {monsters &&
            monsters.map((monster: DungeonCard, idx: number) => (
              <div
                key={idx}
                className="absolute z-20"
                style={{ top: `0px`, left: `${(idx + 1) * 34}px` }}
              >
                <Card
                  suit={monster.suit as any}
                  rank={rankToString(monster.rank) as any}
                  faceUp={true}
                />
              </div>
            ))}
        </>
      ) : (
        <span className="font-mono">None</span>
      )}
    </span>
  );
}
