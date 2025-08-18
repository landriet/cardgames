# Scoundrel - Complete Rules

_A Single Player Rogue-like Card Game by Zach Gage and Kurt Bieg_
_Version 1.0 - August 15th, 2011_

## Setup

### Deck Preparation

1. Start with a standard deck of playing cards
2. Remove and set aside (not used in game):
   - All Jokers
   - All Red Face Cards (Hearts and Diamonds: Jacks, Queens, Kings)
   - All Red Aces (Hearts and Diamonds)
3. Shuffle the remaining cards
4. Place the shuffled deck face down on your left - this is called the **Dungeon**

### Health Tracking

- Start with 20 Health points
- Track this on paper or in memory

### Table Layout

```
Dungeon (face down)    Room (4 face up cards)    Discard (face down)
     |                                                    |
     |                Equipped Weapon                     |
     |           (with Monsters on top)                   |
```

## Card Types & Values

### Monsters (26 cards - All Clubs and Spades)

- **Damage Value**: Equal to card's ordered value
  - Number cards: Face value (2-10)
  - Jack: 11 damage
  - Queen: 12 damage
  - King: 13 damage
  - Ace: 14 damage

### Weapons (9 cards - All Diamonds)

- **Damage Value**: Equal to card's face value
- **Binding**: When picked up, must equip immediately and discard previous weapon
- **Usage Restriction**: After killing a monster, weapon can only be used on monsters with value ≤ the last monster it killed

### Health Potions (9 cards - All Hearts)

- **Healing Value**: Equal to card's face value
- **Restrictions**:
  - Only one potion per turn (second potion is discarded with no effect)
  - Cannot exceed maximum health of 20
  - Discard after use

## Gameplay

### Turn Structure

1. **Room Creation**: Flip 4 cards face up from the Dungeon to create a Room
2. **Room Decision**: Choose to enter the Room OR avoid it

### Room Avoidance

- You may avoid any Room by scooping up all 4 cards and placing them at the bottom of the Dungeon
- **Restriction**: Cannot avoid two Rooms in a row
- No limit on total rooms avoided (except the consecutive rule)

### Enter a Room

If you choose to enter a Room:

1. Face 3 of the 4 cards one by one, resolving each according to its type (weapon, health potion, monster).
2. After you have resolved 3 cards, your turn is complete.
3. The fourth (unresolved) card remains face up in front of you. This card will become part of the next Room you create on your next turn, joined by 3 new cards drawn from the Dungeon.

**Summary:** After resolving 3 cards, always leave the fourth card face up; it is carried forward into the next Room. At the start of each new Room, always draw 3 new cards from the Dungeon if available; if fewer than 3 remain, use all remaining cards.

#### Card Resolution

##### When You Choose a Weapon

1. Must equip it immediately
2. Place face up between you and remaining Room cards
3. If you had a previous weapon:
   - Move old weapon to discard
   - Move any monsters on old weapon to discard

##### When You Choose a Health Potion

1. Add its value to your current health
2. Discard the potion
3. Health cannot exceed 20
4. If second potion in same turn: discard with no healing effect

##### When You Choose a Monster

Choose one combat option:

**Fight Barehanded:**

- Subtract monster's full damage value from your Health
- Move monster to discard deck

**Fight with Equipped Weapon:**

- Place monster face up on top of weapon (stagger so weapon value shows)
- Calculate: Monster Value - Weapon Value = Damage taken
- If result is 0 or negative, take no damage
- Subtract any positive damage from your Health
- Monster remains on weapon (weapon not discarded)
- **Important**: Weapon can now only fight monsters with value ≤ this monster's value

### Combat Examples

#### Weapon Combat Calculations

- **5 Weapon vs 3 Monster**: 3 - 5 = -2 → No damage taken
- **5 Weapon vs Jack (11)**: 11 - 5 = 6 → Take 6 damage

#### Weapon Usage Restrictions

- **5 Weapon kills Queen (12)**: Can later fight any monster ≤ 12
- **5 Weapon kills 6 Monster**: Can later only fight monsters ≤ 6
- **Cannot use weapon on stronger monsters**: Must fight barehanded

## Game End Conditions

### Death (Health reaches 0)

- Game ends immediately
- **Score**: Find remaining monsters in Dungeon, add their values, subtract from current health (negative score)

### Victory (Complete entire Dungeon)

- **Score**: Your remaining positive health
- **Special**: If health is exactly 20 and last card was a health potion, add potion's value to score

## Key Strategic Notes

1. **Weapon Management**: Consider the long-term impact of which monsters you use weapons against
2. **Room Avoidance**: Use strategically but remember the consecutive restriction
3. **Health Potion Timing**: Plan usage carefully since only one per turn
4. **Risk Assessment**: Weigh fighting barehanded vs. limiting weapon effectiveness

---

_© 2011, Zach Gage and Kurt Bieg_
