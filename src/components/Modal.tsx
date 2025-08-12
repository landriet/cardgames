import React, { useEffect, useRef } from "react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  ariaLabel?: string;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  ariaLabel,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap for accessibility
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-800 bg-opacity-50 transition-opacity duration-300 ease-out"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || "Popup"}
      tabIndex={-1}
      ref={modalRef}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="relative bg-white p-6 rounded-lg shadow-lg transform transition-transform duration-300 ease-out w-full max-w-md mx-4">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-600 hover:text-gray-800 text-2xl font-bold focus:outline-none p-2"
          aria-label="Close popup"
        >
          &times;
        </button>
        {children}
      </div>
    </div>
  );
};

export default Modal;
