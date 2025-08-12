import React from "react";
import { Hand, Sword } from "lucide-react";

interface MonsterAttackChoiceProps {
  onBarehand: () => void;
  onWeapon: () => void;
}

const MonsterAttackChoice: React.FC<MonsterAttackChoiceProps> = ({
  onBarehand,
  onWeapon,
}) => {
  return (
    <div className="flex justify-center gap-8">
      <button
        onClick={onBarehand}
        aria-label="Fight barehanded"
        className="rounded-full bg-gray-200 hover:bg-gray-300 focus:bg-gray-400 p-4 shadow transition-colors duration-150 focus:outline-none"
      >
        <Hand size={32} className="text-gray-700" />
      </button>
      <button
        onClick={onWeapon}
        aria-label="Fight with weapon"
        className="rounded-full bg-blue-200 hover:bg-blue-300 focus:bg-blue-400 p-4 shadow transition-colors duration-150 focus:outline-none"
      >
        <Sword size={32} className="text-blue-700" />
      </button>
    </div>
  );
};

export default MonsterAttackChoice;
