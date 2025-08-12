import Modal from "../../../components/Modal";
import MonsterAttackChoice from "../../../components/MonsterAttackChoice";

export default function MonsterAttackModal({
  isOpen,
  onBarehand,
  onWeapon,
  onClose,
}: {
  isOpen: boolean;
  onBarehand: () => void;
  onWeapon: () => void;
  onClose: () => void;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} ariaLabel="Choose attack mode">
      <MonsterAttackChoice onBarehand={onBarehand} onWeapon={onWeapon} />
    </Modal>
  );
}
