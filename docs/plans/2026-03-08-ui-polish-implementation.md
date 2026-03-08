# UI Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve the Scoundrel game UI with visual zones, card interactivity, type indicators, and polish fixes.

**Architecture:** CSS-only enhancements to existing components. No layout restructuring — same vertical flow with visual grouping via panels. Card type awareness flows from the existing `DungeonCard.type` field through to the `Card` component.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, existing `Card.tsx` component

---

### Task 1: Polish Fixes — Modal Dark Mode

**Files:**

- Modify: `src/components/Modal.tsx:34` (container bg and close button)

**Step 1: Fix modal container dark mode**

Change line 34 from:

```tsx
<div className="relative bg-white p-6 rounded-lg shadow-lg transform transition-transform duration-300 ease-out w-full max-w-md mx-4">
```

to:

```tsx
<div className="relative bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg transform transition-transform duration-300 ease-out w-full max-w-md mx-4">
```

**Step 2: Fix close button dark mode**

Change close button className from:

```tsx
"absolute top-2 right-2 text-gray-600 hover:text-gray-800 text-2xl font-bold focus:outline-none p-2";
```

to:

```tsx
"absolute top-2 right-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 text-2xl font-bold focus:outline-none p-2";
```

**Step 3: Verify visually**

Run: `npm run dev`
Toggle dark mode, trigger the death modal or monster attack modal. Confirm the modal background is dark gray, not white.

**Step 4: Commit**

```bash
git add src/components/Modal.tsx
git commit -m "fix: add dark mode support to Modal component"
```

---

### Task 2: Polish Fixes — Card Size Consistency

**Files:**

- Modify: `src/components/Card.tsx:46` (face-down card width)

**Step 1: Fix face-down card width**

Change line 46 from:

```tsx
style={{ width: "86px", height: "128px" }}
```

to:

```tsx
style={{ width: "82px", height: "128px" }}
```

**Step 2: Verify visually**

Run: `npm run dev`
Confirm the deck (face-down) card and room (face-up) cards are the same width.

**Step 3: Commit**

```bash
git add src/components/Card.tsx
git commit -m "fix: standardize card width to 82px for face-up and face-down"
```

---

### Task 3: Polish Fixes — Disabled Button Styling

**Files:**

- Modify: `src/features/scoundrel/components/ActionButtons.tsx:15`

**Step 1: Improve disabled state**

Change the disabled button class from:

```tsx
"bg-gray-400 text-gray-200 cursor-not-allowed";
```

to:

```tsx
"bg-gray-400 text-gray-200 cursor-not-allowed opacity-50";
```

**Step 2: Verify visually**

Run: `npm run dev`
Skip a room, then confirm the Skip Room button is visibly dimmed on the next room.

**Step 3: Commit**

```bash
git add src/features/scoundrel/components/ActionButtons.tsx
git commit -m "fix: improve disabled Skip Room button visibility"
```

---

### Task 4: Card Type Indicators

**Files:**

- Modify: `src/components/Card.tsx` (add `cardType` prop and left border)
- Modify: `src/features/scoundrel/components/RoomCards.tsx` (pass `cardType` to Card)
- Modify: `src/features/scoundrel/components/EquippedWeapon.tsx` (pass `cardType` to Card)
- Modify: `src/features/scoundrel/components/DeckDisplay.tsx` (no change needed — face-down cards don't show type)

**Step 1: Add `cardType` prop to Card component**

In `src/components/Card.tsx`, add to the `CardProps` interface:

```tsx
export type GameCardType = "monster" | "weapon" | "potion";

export interface CardProps {
  suit: Suit;
  rank: Rank;
  faceUp?: boolean;
  className?: string;
  cardType?: GameCardType;
}
```

Add a border color map:

```tsx
const cardTypeBorderColors: Record<GameCardType, string> = {
  monster: "border-l-4 border-l-red-500",
  weapon: "border-l-4 border-l-blue-500",
  potion: "border-l-4 border-l-green-500",
};
```

In the face-up card `<div>`, add the border class when `cardType` is provided:

```tsx
<div
  style={{ width: "82px", height: "128px" }}
  className={`rounded-lg shadow-lg border border-gray-300 bg-white flex items-center justify-center relative select-none ${cardType ? cardTypeBorderColors[cardType] : ""} ${className}`}
>
```

**Step 2: Pass cardType in RoomCards.tsx**

Change the Card usage from:

```tsx
<Card suit={card.suit as any} rank={rankToString(card.rank) as any} faceUp={true} />
```

to:

```tsx
<Card suit={card.suit as any} rank={rankToString(card.rank) as any} faceUp={true} cardType={card.type} />
```

**Step 3: Pass cardType in EquippedWeapon.tsx**

Pass `cardType` for both the weapon card and the monster cards:

```tsx
<Card suit={weapon.suit as any} rank={rankToString(weapon.rank) as any} faceUp={true} cardType={weapon.type} />
```

and for monsters:

```tsx
<Card suit={monster.suit as any} rank={rankToString(monster.rank) as any} faceUp={true} cardType={monster.type} />
```

**Step 4: Verify visually**

Run: `npm run dev`
Confirm room cards show colored left borders: red for clubs/spades, blue for diamonds, green for hearts.

**Step 5: Run existing tests**

Run: `npm run test`
Expected: all tests pass (no logic changes).

**Step 6: Commit**

```bash
git add src/components/Card.tsx src/features/scoundrel/components/RoomCards.tsx src/features/scoundrel/components/EquippedWeapon.tsx
git commit -m "feat: add card type color indicators (red monster, blue weapon, green potion)"
```

---

### Task 5: Equipped Weapon Overflow Fix

**Files:**

- Modify: `src/features/scoundrel/components/EquippedWeapon.tsx` (replace absolute positioning with flex)

**Step 1: Rewrite to flex layout with overlap**

Replace the entire component body with:

```tsx
export default function EquippedWeapon({ weapon, monsters }: { weapon: DungeonCard | null; monsters: DungeonCard[] }) {
  if (!weapon) {
    return <span className="font-mono text-gray-500 dark:text-gray-400">None</span>;
  }

  return (
    <div className="flex flex-row items-start">
      <div className="flex-shrink-0">
        <Card suit={weapon.suit as any} rank={rankToString(weapon.rank) as any} faceUp={true} cardType={weapon.type} />
      </div>
      {monsters.map((monster: DungeonCard, idx: number) => (
        <div key={idx} className="flex-shrink-0 -ml-12">
          <Card suit={monster.suit as any} rank={rankToString(monster.rank) as any} faceUp={true} cardType={monster.type} />
        </div>
      ))}
    </div>
  );
}
```

Key changes:

- Uses `flex` row instead of absolute positioning
- Overlap via `-ml-12` (negative margin) instead of computed `left` offsets
- No fixed `minWidth`/`minHeight` on the container — flex handles sizing naturally
- Returns early with "None" text when no weapon

**Step 2: Update the parent in ScoundrelGame.tsx**

Change the equipped weapon section from:

```tsx
<div className="mb-4 text-gray-800 dark:text-gray-100">
  Equipped Weapon: <EquippedWeapon weapon={game.equippedWeapon} monsters={game.monstersOnWeapon || []} />
</div>
```

to:

```tsx
<div className="mb-4 text-gray-800 dark:text-gray-100">
  <div className="text-sm font-semibold mb-1">Equipped Weapon</div>
  <EquippedWeapon weapon={game.equippedWeapon} monsters={game.monstersOnWeapon || []} />
</div>
```

**Step 3: Verify visually**

Run: `npm run dev`
Equip a weapon and defeat monsters. Confirm cards stack with overlap and don't clip outside the container.

**Step 4: Commit**

```bash
git add src/features/scoundrel/components/EquippedWeapon.tsx src/features/scoundrel/ScoundrelGame.tsx
git commit -m "fix: replace absolute positioning with flex layout for equipped weapon"
```

---

### Task 6: Visual Zones

**Files:**

- Modify: `src/features/scoundrel/ScoundrelGame.tsx` (wrap sections in panels)

**Step 1: Wrap status bar in a panel**

Replace the current status bar div (lines ~114-133) with:

```tsx
<div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
  <div className="flex items-center gap-4">{/* ... existing health bar and winnability badge content ... */}</div>
</div>
```

**Step 2: Wrap dungeon room in a panel**

Replace the deck+room container (lines ~136-145) with:

```tsx
<div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800/50 rounded-lg">
  <div className="flex flex-row items-top gap-8">
    <DeckDisplay deck={game.deck} />
    <RoomCards
      cards={game.currentRoom.cards}
      onCardClick={handleCardClick}
      onCardHover={setHoveredCard}
      onCardUnhover={() => setHoveredCard(null)}
    />
  </div>
</div>
```

**Step 3: Wrap equipped weapon in a panel**

Replace the weapon section with:

```tsx
<div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
  <div className="text-sm font-semibold mb-1 text-gray-800 dark:text-gray-100">Equipped Weapon</div>
  <EquippedWeapon weapon={game.equippedWeapon} monsters={game.monstersOnWeapon || []} />
</div>
```

**Step 4: Reduce action button top margin**

In `ActionButtons.tsx`, change `mt-8` to `mt-2` since the panels now provide visual separation.

**Step 5: Verify visually**

Run: `npm run dev`
Confirm three distinct visual zones are visible with subtle background differences.

**Step 6: Commit**

```bash
git add src/features/scoundrel/ScoundrelGame.tsx src/features/scoundrel/components/ActionButtons.tsx
git commit -m "feat: add visual zone panels for status, dungeon room, and weapon"
```

---

### Task 7: Status Bar — Rooms Cleared

**Files:**

- Modify: `src/features/scoundrel/ScoundrelGame.tsx` (add room counter to status bar)

**Step 1: Derive rooms cleared from game state**

Add a computed value before the return statement. The initial deck has 44 cards (full deck minus Jokers and the first room). Each room deals 4 cards. We can calculate rooms entered from the deck size and cards in the current room:

```tsx
// Each room uses 4 cards from the deck. Starting deck has deckSize cards.
// Room count = how many times we've drawn a new room.
// Approximate: (initial deck size - current deck size) / 4, but simpler:
// count resolved cards in discard + monstersOnWeapon + equipped weapon + current room
const roomsCleared = Math.max(0, Math.floor((game.discard.length + game.monstersOnWeapon.length + (game.equippedWeapon ? 1 : 0)) / 4));
const currentRoom = roomsCleared + 1;
```

Actually simpler — track based on how many cards have left the deck:

```tsx
// 44 cards start in the deck, 4 dealt per room
const totalCardsDealt = 44 - game.deck.length;
const currentRoom = Math.ceil(totalCardsDealt / 4);
```

**Step 2: Add room counter to status bar**

In the status bar panel, between health and winnability badge, add:

```tsx
<div className="text-sm font-semibold text-gray-600 dark:text-gray-300">Room {currentRoom || 1}</div>
```

**Step 3: Verify visually**

Run: `npm run dev`
Play through a few rooms. Confirm the room counter increments each time a new room is entered.

**Step 4: Commit**

```bash
git add src/features/scoundrel/ScoundrelGame.tsx
git commit -m "feat: add room counter to status bar"
```

---

### Task 8: Card Interactivity — Hover and Click States

**Files:**

- Modify: `src/features/scoundrel/components/RoomCards.tsx` (hover/click CSS, empty slot styling)

**Step 1: Add hover/click transitions and cursor to card slots**

Replace the card slot div (the one with `key={idx}`) with:

```tsx
<div
  key={idx}
  className={`relative flex flex-col items-center justify-center rounded-lg transition-all duration-150 ${
    card
      ? "cursor-pointer hover:scale-105 active:scale-95"
      : "border-2 border-dashed border-gray-300 dark:border-gray-600"
  }`}
  tabIndex={card ? 0 : -1}
  role={card ? "button" : undefined}
  aria-label={card ? `Interact with ${card.type}` : `Empty spot`}
  onClick={card ? () => onCardClick(card) : undefined}
  onMouseEnter={card && onCardHover ? () => onCardHover(card) : undefined}
  onMouseLeave={card && onCardUnhover ? () => onCardUnhover() : undefined}
  style={{ minWidth: "85px", minHeight: "128px" }}
>
```

Key changes:

- Removed `h-32 bg-gray-100 dark:bg-gray-800` from all slots
- Added `transition-all duration-150` for smooth animations
- Added `cursor-pointer hover:scale-105 active:scale-95` for cards
- Added `border-2 border-dashed` for empty slots

**Step 2: Add colored hover glow based on card type**

Add a hover glow ring that matches card type. Update the card slot className:

```tsx
const hoverGlowClass = card
  ? {
      monster: "hover:ring-2 hover:ring-red-400 hover:shadow-lg",
      weapon: "hover:ring-2 hover:ring-blue-400 hover:shadow-lg",
      potion: "hover:ring-2 hover:ring-green-400 hover:shadow-lg",
    }[card.type]
  : "";
```

Apply it in the className:

```tsx
className={`relative flex flex-col items-center justify-center rounded-lg transition-all duration-150 ${
  card
    ? `cursor-pointer hover:scale-105 active:scale-95 ${hoverGlowClass}`
    : "border-2 border-dashed border-gray-300 dark:border-gray-600"
}`}
```

**Step 3: Verify visually**

Run: `npm run dev`
Hover over room cards — confirm colored glow ring appears, cards scale up. Click — confirm brief scale-down. Empty slots show dashed border.

**Step 4: Commit**

```bash
git add src/features/scoundrel/components/RoomCards.tsx
git commit -m "feat: add hover glow, scale, and click feedback to room cards"
```

---

### Task 9: Card Interactivity — Damage/Heal Preview Badges

**Files:**

- Modify: `src/features/scoundrel/components/RoomCards.tsx` (add overlay badges)
- Modify: `src/features/scoundrel/ScoundrelGame.tsx` (pass damage preview data to RoomCards)

**Step 1: Add preview data props to RoomCards**

Update the RoomCards props to accept a hovered card and game state for computing previews:

```tsx
export default function RoomCards({
  cards,
  onCardClick,
  onCardHover,
  onCardUnhover,
  hoveredCard,
  equippedWeapon,
  health,
  maxHealth,
}: {
  cards: (DungeonCard | undefined)[];
  onCardClick: (card: DungeonCard) => void;
  onCardHover?: (card: DungeonCard) => void;
  onCardUnhover?: () => void;
  hoveredCard: DungeonCard | null;
  equippedWeapon: DungeonCard | null;
  health: number;
  maxHealth: number;
}) {
```

**Step 2: Compute and render preview badges**

Inside the card slot, after the `<Card>` component, add a badge overlay when the card is hovered:

```tsx
{
  card && hoveredCard === card && card.type === "monster" && (
    <div className="absolute top-1 right-1 bg-red-600 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow z-30">
      -{card.rank}
    </div>
  );
}
{
  card && hoveredCard === card && card.type === "potion" && (
    <div className="absolute top-1 right-1 bg-green-600 text-white text-xs font-bold rounded-full w-7 h-7 flex items-center justify-center shadow z-30">
      +{Math.min(card.rank, maxHealth - health)}
    </div>
  );
}
```

Note: Monster damage shown is barehanded damage (full rank). The actual damage depends on weapon choice, but showing the worst case is still useful. Potion heal is capped at `maxHealth - health`.

**Step 3: Pass new props from ScoundrelGame.tsx**

Update the `<RoomCards>` call:

```tsx
<RoomCards
  cards={game.currentRoom.cards}
  onCardClick={handleCardClick}
  onCardHover={setHoveredCard}
  onCardUnhover={() => setHoveredCard(null)}
  hoveredCard={hoveredCard}
  equippedWeapon={game.equippedWeapon}
  health={game.health}
  maxHealth={game.maxHealth}
/>
```

**Step 4: Verify visually**

Run: `npm run dev`
Hover over a monster card — confirm red badge shows damage. Hover over a potion — confirm green badge shows heal amount.

**Step 5: Run all tests**

Run: `npm run test`
Expected: all tests pass.

**Step 6: Commit**

```bash
git add src/features/scoundrel/components/RoomCards.tsx src/features/scoundrel/ScoundrelGame.tsx
git commit -m "feat: add damage/heal preview badges on card hover"
```

---

### Task 10: Final Verification

**Step 1: Run full test suite**

Run: `npm run test`
Expected: all tests pass.

**Step 2: Run linter**

Run: `npm run lint`
Expected: no errors.

**Step 3: Run build**

Run: `npm run build`
Expected: successful build with no type errors.

**Step 4: Manual visual QA**

Run: `npm run dev`
Check:

- [ ] Three visual zone panels visible (status, dungeon, weapon)
- [ ] Card type indicators (colored left borders) on all face-up cards
- [ ] Hover glow on room cards matches card type color
- [ ] Scale up on hover, scale down on click
- [ ] Damage/heal badges appear on hover
- [ ] Empty card slots show dashed borders
- [ ] Room counter increments correctly
- [ ] Dark mode: modal has dark background, all zones look correct
- [ ] Equipped weapon cards stack with overlap, no clipping
- [ ] Disabled Skip Room button is visibly dimmed
- [ ] Face-down deck card matches face-up card width
