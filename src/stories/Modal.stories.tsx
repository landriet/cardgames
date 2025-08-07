import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Modal from '../components/Modal';

const meta: Meta<typeof Modal> = {
  title: 'Components/Modal',
  component: Modal,
  tags: ['autodocs'],
  argTypes: {
    isOpen: { control: 'boolean' },
    ariaLabel: { control: 'text' },
  },
};
export default meta;

type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  render: (args) => {
    const [open, setOpen] = useState(args.isOpen ?? false);
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <button
          className="mb-6 px-6 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700 transition"
          onClick={() => setOpen(true)}
        >
          Show Popup
        </button>
        <Modal isOpen={open} onClose={() => setOpen(false)} ariaLabel={args.ariaLabel}>
          <h2 className="text-xl font-bold mb-2">Beautiful Popup</h2>
          <p className="mb-4">This is a demo popup for displaying actions or text on top of the UI.</p>
          <button
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </Modal>
      </div>
    );
  },
  args: {
    isOpen: false,
    ariaLabel: 'Demo Popup',
  },
};
