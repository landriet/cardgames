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
        {/* Tooltip removed as requested */}
        <div className="mt-2 text-center text-lg text-gray-900 font-extrabold drop-shadow-sm">{barehandDamage}</div>
      </div>
      <div className="relative group">
        <button
          onClick={onWeapon}
          aria-label="Fight with weapon"
          className="rounded-full bg-blue-200 hover:bg-blue-300 focus:bg-blue-400 p-4 shadow transition-colors duration-150 focus:outline-none"
        >
          <Sword size={32} className="text-blue-700" />
        </button>
        {/* Tooltip removed as requested */}
        <div className="mt-2 text-center text-lg text-blue-900 font-extrabold drop-shadow-sm">{weaponDamage}</div>
      </div>
    </div>
  );
};

export default MonsterAttackChoice;
