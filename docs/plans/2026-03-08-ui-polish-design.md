# Scoundrel UI Polish Design

**Date**: 2026-03-08
**Approach**: Refined Stack — minimal restructure, maximum interactivity
**Constraints**: CSS-only (no animation libraries), desktop-first, no new dependencies

## 1. Visual Zones

Wrap each game section in a visually distinct panel with subtle backgrounds and rounded borders:

- **Status bar** (top): `bg-gray-50 dark:bg-gray-800` panel containing health, rooms cleared, winnability badge
- **Dungeon room** (center): slightly darker panel (`bg-gray-100 dark:bg-gray-850`) containing deck + 4 room cards — draws focus as the main play area
- **Equipped weapon** (below room): its own panel with label and card display, properly sized to contain stacked monster cards
- **Action buttons** (bottom): remain as-is, tighter spacing to weapon zone

No layout restructuring — same vertical flow, just visual grouping.

## 2. Card Interactivity

Enhance room cards in `RoomCards.tsx`:

- `cursor-pointer` on clickable cards
- Hover: `scale-105` + increased shadow + colored border glow matching card type (red monster, blue weapon, green potion)
- Click: brief `scale-95` for tactile feedback
- Transitions: `transition-all duration-150` on card wrappers
- Empty slots: `border-dashed border-gray-300` instead of solid gray background

Damage/heal preview badges on hover:

- Monsters: small red badge overlaid on card showing damage (e.g. "-7")
- Potions: small green badge overlaid on card showing heal (e.g. "+3")
- Weapons: no overlay needed

## 3. Card Type Indicators

Add colored left border accent to `Card.tsx` via optional `cardType` prop:

- Monsters (clubs, spades): `border-l-4 border-red-500`
- Weapons (diamonds): `border-l-4 border-blue-500`
- Potions (hearts): `border-l-4 border-green-500`

Subtle accent that works as a learning aid without overwhelming experienced players.

## 4. Status Bar

Single horizontal strip with:

- **Health bar** (left): existing bar + numeric readout, unchanged
- **Rooms cleared** (center): "Room 5" label for dungeon progress
- **Winnability badge** (right): existing badge, unchanged

Simulated health preview on potion hover stays next to health numbers.

No running score displayed during gameplay (score only shown on death).

## 5. Polish Fixes

- **Modal dark mode**: `Modal.tsx` — use `bg-white dark:bg-gray-800`, fix close button colors
- **Card back size**: standardize face-up and face-down to 82px width (fix 82/86 inconsistency)
- **Equipped weapon overflow**: replace absolute positioning with flex row + negative margin overlap
- **Disabled button styling**: lower opacity + no hover effect on disabled Skip Room button
