import Modal from "../../../components/Modal";
import MonsterAttackChoice from "./MonsterAttackChoice";

interface MonsterAttackModalProps {
  isOpen: boolean;
  onBarehand: () => void;
  onWeapon: () => void;
  onClose: () => void;
  barehandDamage: number;
  weaponDamage: number;
  canUseWeapon: boolean;
}

export default function MonsterAttackModal({
  isOpen,
  onBarehand,
  onWeapon,
  onClose,
  barehandDamage,
  weaponDamage,
  canUseWeapon,
}: MonsterAttackModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="Choose attack mode">
      <MonsterAttackChoice
        onBarehand={onBarehand}
        onWeapon={onWeapon}
        barehandDamage={barehandDamage}
        weaponDamage={weaponDamage}
        canUseWeapon={canUseWeapon}
      />
    </Modal>
  );
}
