import React from "react";
import { Hand, Sword } from "lucide-react";

interface MonsterAttackChoiceProps {
  onBarehand: () => void;
  onWeapon: () => void;
  barehandDamage: number;
  weaponDamage: number;
}

const MonsterAttackChoice: React.FC<MonsterAttackChoiceProps> = ({ onBarehand, onWeapon, barehandDamage, weaponDamage }) => {
  return (
    <div className="flex justify-center gap-8">
      <div className="relative group">
        <button
          onClick={onBarehand}
          aria-label="Fight barehanded"
          className="rounded-full bg-gray-200 hover:bg-gray-300 focus:bg-gray-400 p-4 shadow transition-colors duration-150 focus:outline-none"
        >
          <Hand size={32} className="text-gray-700" />
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
          Will take {barehandDamage} damage
        </span>
      </div>
      <div className="relative group">
        <button
          onClick={onWeapon}
          aria-label="Fight with weapon"
          className="rounded-full bg-blue-200 hover:bg-blue-300 focus:bg-blue-400 p-4 shadow transition-colors duration-150 focus:outline-none"
        >
          <Sword size={32} className="text-blue-700" />
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-2 py-1 text-xs text-white bg-blue-700 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
          Will take {weaponDamage} damage
        </span>
      </div>
    </div>
  );
};

export default MonsterAttackChoice;
