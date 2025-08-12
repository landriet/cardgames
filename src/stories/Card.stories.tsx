import type { Meta, StoryObj } from "@storybook/react-vite";
import Card, { Suit, Rank } from "../components/Card";

const meta: Meta<typeof Card> = {
  title: "Components/Card",
  component: Card,
  tags: ["autodocs"],
  argTypes: {
    suit: {
      control: "select",
      options: ["hearts", "diamonds", "clubs", "spades"],
    },
    rank: {
      control: "select",
      options: [
        "A",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "J",
        "Q",
        "K",
      ],
    },
    faceUp: {
      control: "boolean",
    },
  },
  args: {
    suit: "spades",
    rank: "A",
    faceUp: true,
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {};

export const FaceDown: Story = {
  args: {
    faceUp: false,
  },
};

export const AllSuits: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 8 }}>
      {(["hearts", "diamonds", "clubs", "spades"] as Suit[]).map((suit) => (
        <Card key={suit} {...args} suit={suit} />
      ))}
    </div>
  ),
};

export const AllRanks: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {(
        [
          "A",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "J",
          "Q",
          "K",
        ] as Rank[]
      ).map((rank) => (
        <Card key={rank} {...args} rank={rank} />
      ))}
    </div>
  ),
};
