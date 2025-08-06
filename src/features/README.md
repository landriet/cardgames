# Scoundrel - Single Player Rogue-like Card Game
*Version 1.0 - Created by Zach Gage and Kurt Bieg*

## Setup

1. Use a standard deck of playing cards
2. Remove all **Jokers, Red Face Cards, and Red Aces** - set them aside (not used)
3. Shuffle the remaining cards and place face down on your left - this is the **Dungeon**
4. Start with **20 Health** (track on paper or in memory)

## Card Types

### Monsters (26 cards - all Clubs and Spades)
- Damage equals their ordered value:
  - Number cards = face value
  - Jack = 11
  - Queen = 12
  - King = 13
  - Ace = 14

### Weapons (9 cards - all Diamonds)
- Damage equals face value
- **Binding**: Must equip when picked up, discarding previous weapon
- Can only be used on monsters with value ≤ the last monster it killed

### Health Potions (9 cards - all Hearts)
- Restore health equal to face value
- **One per turn maximum** (second potion is discarded)
- Cannot exceed starting 20 health

## Table Layout
```
[Dungeon]  [Room - 4 face-up cards]  [Discard]
           [Equipped Weapon]
           [Monsters on Weapon]
```

## Gameplay

### Each Turn:
1. Flip cards from Dungeon until you have **4 face-up cards** forming a Room
2. Choose to **Enter** or **Avoid** the Room

### Avoiding Rooms:
- Scoop all 4 cards and place at bottom of Dungeon
- Cannot avoid **two Rooms in a row**
- No limit on total avoided rooms

### Entering Rooms:
- Must face **3 of the 4 cards** one at a time
- Leave the 4th card face-up for next Room

### Taking Cards:

#### Weapon:
- Must equip immediately
- Place face-up between you and Room
- Previous weapon and any monsters on it go to discard

#### Health Potion:
- Add value to health, then discard
- Cannot exceed 20 health
- Only one per turn (extras discarded with no effect)

#### Monster:
Choose to fight **barehanded** or **with equipped weapon**:

**Barehanded:**
- Take full monster damage
- Discard monster

**With Weapon:**
- Place monster on top of weapon (staggered to show weapon value)
- Damage = Monster value - Weapon value
- Take remaining damage (minimum 0)
- Weapon can now only kill monsters ≤ this monster's value

### Combat Examples:
- 5 Weapon vs 3 Monster: 3 - 5 = 0 damage taken
- 5 Weapon vs Jack (11): 11 - 5 = 6 damage taken
- 5 Weapon that killed Queen (12) can still fight monsters value ≤ 12
- 5 Weapon that killed 6 Monster cannot fight Queen (12 > 6) - must fight barehanded

## Game End Conditions

### Death (Health reaches 0):
- Find all remaining monsters in Dungeon
- Subtract their total value from current health
- **Score = negative health value**

### Victory (Complete Dungeon):
- **Score = remaining positive health**
- If health is exactly 20 and last card was a health potion: **Score = 20 + potion value**

## Additional Notes
- Discard pile can be placed anywhere (recommended to right of Room)
- Cards are discarded face down
- Weapons are retained until replaced, even when "weakened" by use

## TODO list
- [x] Implement fighting a monster:
    - [x] Barehanded: take full monster damage, discard monster
    - [ ] With weapon: place monster on weapon, calculate damage (monster - weapon, min 0), enforce weapon kill limit
- [ ] Implement logic for entering a room: player must face 3 of 4 cards, leave the 4th as nextRoomBase
- [ ] Implement taking a weapon: must equip immediately, discard previous weapon and monsters on it
- [ ] Implement taking a health potion: add value to health, discard, enforce max 20 health, only one per turn
- [ ] Enforce weapon weakening: weapon can only be used on monsters ≤ last monster it killed
- [ ] Enforce potion rule: only one potion per turn, extras discarded with no effect
- [ ] Implement end conditions:
    - [ ] Death: health reaches 0, subtract remaining monster values from health, score = negative health
    - [ ] Victory: dungeon complete, score = remaining health (bonus if last card was potion and health is 20)
- [ ] Implement discard pile logic: cards discarded face down, weapons/monsters handled per rules