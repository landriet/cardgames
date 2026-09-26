# Card Capture — AI-Readable Rules

This document restructures the rules from [`Card_Capture_Rules_-_English_-_Spreads.pdf`](../Card_Capture_Rules_-_English_-_Spreads.pdf) into explicit game state, setup, turn phases, actions, and end conditions. It preserves the source rules and labels unresolved wording instead of silently treating an interpretation as canonical.

**Game:** _Card Capture_, a solitaire deck builder using a standard 54-card deck  
**Designer:** Lucas Gentry  
**Layout:** Vlad Radionov

## Quick reference

```yaml
game: Card Capture
deck_size: 54
enemy_row_size: 4
player_hand_size: 4
turn_order:
  - enemy_phase
  - discard_phase
  - draw_phase
  - capture_phase
player_initial_deck:
  cards: all 2s, 3s, 4s, and both Jokers
  count: 14
enemy_initial_deck:
  cards: all 5s through Aces, all suits
  count: 40
enemy_combatants: [J, Q, K, A]
rank_values:
  J: 11
  Q: 12
  K: 13
  A: 14
capture_choices:
  - capture_one_enemy_card
  - let_enemy_capture_position_1_and_one_hand_card
  - sacrifice_two_hand_cards_to_return_one_enemy_card_to_deck_bottom
```

## Objective and terminology

Capture every enemy combatant: all Aces, Jacks, Queens, and Kings in the Enemy Draw Deck or Enemy Row. Capture them through **Capture an Enemy Card**, using cards of the same suit and sufficient combined value. Numeric cards are tools; face cards and Aces are combatants.

- **Personal Draw Deck:** the player's draw pile.
- **Player's hand:** up to four cards available during the Capture Phase.
- **Player's Discard Pile:** receives spent cards and enemy cards captured by the player. The player may not inspect it during the game.
- **Enemy Draw Deck:** the enemy's face-down draw pile.
- **Enemy Row:** four numbered positions. In the source diagram, positions run left to right as **Position 4, Position 3, Position 2, Position 1**. Position 1 is therefore the rightmost position and is the position used by **Let Your Card Get Captured**.
- **Enemy Capture Pile:** starts empty. Cards sent here are removed from play. The player may not inspect this pile during the game.
- **Enemy combatant:** any Ace, Jack, Queen, or King.
- **Enemy non-face card:** any other rank. Under the initial deck split, Enemy Draw Deck non-face cards are 5–10.

The standard deck has 52 suited cards plus two Jokers. The Personal Draw Deck contains all four suits of 2, 3, and 4 (12 cards) plus both Jokers (14 cards total). The Enemy Draw Deck contains all four suits of ranks 5 through Ace (40 cards total), including 16 combatants.

## Card values and suits

| Card  |                                        Value |
| ----- | -------------------------------------------: |
| 2–10  |                               Printed number |
| Jack  |                                           11 |
| Queen |                                           12 |
| King  |                                           13 |
| Ace   |                                           14 |
| Joker | No fixed value or suit; see Joker rule below |

Suits are clubs, diamonds, hearts, and spades. A Joker acts as one other card in the player's hand; the examples use it as an additional copy of that card when totaling value. Details not settled by the source are listed under [Unspecified rules and implementation notes](#unspecified-rules-and-implementation-notes).

## Setup

1. Remove all 2s, 3s, and 4s, plus both Jokers. Shuffle these together to form the Personal Draw Deck.
2. Shuffle all remaining cards to form the Enemy Draw Deck. Place it on the left side of the play area.
3. Create four empty Enemy Row positions and an empty Enemy Capture Pile.
4. Draw four cards from the Enemy Draw Deck, placing the first in Position 1, the second in Position 2, the third in Position 3, and the fourth in Position 4.
5. If any dealt Enemy Row card is a Jack, Queen, King, or Ace, remove it from the row and put it on the bottom of the Enemy Draw Deck. Do not immediately refill those positions during setup; the Enemy Phase will refill them.
6. Create an empty Player's Discard Pile.

The rulebook's setup illustration shows four cards in the player's hand, but its written setup steps do not say when to draw them. See the implementation note below.

## Round sequence

Each round has four phases in this order. The Capture Phase always ends the round; if the game has not ended, begin the next round with the Enemy Phase.

### 1. Enemy Phase

If the Enemy Draw Deck is empty, skip this phase as instructed by the source. Otherwise:

1. Move Enemy Row cards to the right to fill empty positions, preserving their relative order. In position terms, compact cards toward Position 1 (the right side of the row).
2. Draw replacement cards from the top of the Enemy Draw Deck into remaining empty positions, starting at Position 4 and moving toward Position 1. Stop if the deck runs out.

Example: if Position 3 is empty and Position 4 contains a 9 of Hearts, move that 9 into Position 3, then draw a replacement into Position 4.

### 2. Discard Phase

The player may discard any number of cards from their hand, including zero. Put discarded cards in the Player's Discard Pile. The player may not look through that pile at any point during the game.

### 3. Draw Phase

Draw from the Personal Draw Deck until the hand contains four cards. If the Personal Draw Deck runs out before the hand reaches four, shuffle the Player's Discard Pile to make a new Personal Draw Deck, then continue drawing. Do not inspect the discard pile while doing this.

### 4. Capture Phase

Choose one of the following actions. The player is not required to capture an enemy card; the other two actions are available if the player cannot or does not want to do so.

#### A. Capture an Enemy Card

Choose one card in the Enemy Row. Spend one or more cards from the hand whose combined value is **equal to or greater than** the chosen enemy card's value. The spent cards must match the enemy card's suit. Discard the spent cards and the captured enemy card to the Player's Discard Pile.

The source says the suit must match and its examples use only cards of the target's suit. For a rules implementation, require every spent card (including a Joker's assigned copy) to match the target suit.

**Joker example from the source:** A 3 of Clubs plus a Joker acting as another 3 of Clubs totals 6 of Clubs, enough to capture a 5 of Clubs. A 4 of Hearts, 2 of Hearts, and a Joker acting as another 4 of Hearts total 10 of Hearts, enough to capture either a 9 or 10 of Hearts, but not both.

#### B. Let Your Card Get Captured

Take the enemy card in **Position 1** and one card of the player's choice from the hand. Put both cards in the Enemy Capture Pile; both are removed from play.

If an Ace, Jack, Queen, or King enters the Enemy Capture Pile, the player immediately loses. This includes either the Position 1 enemy card or the card chosen from the player's hand.

#### C. Sacrifice Two Cards from Your Hand

Choose two cards from the hand and put them in the Enemy Capture Pile. A sacrificed card may not be an Ace, Jack, Queen, or King; putting one there would immediately lose the game. Then choose one card from the Enemy Row and put it on the bottom of the Enemy Draw Deck. The returned enemy card is not captured or discarded.

## End conditions

### Immediate loss

The player immediately loses whenever an Ace, Jack, Queen, or King enters the Enemy Capture Pile.

### Victory

At the end of a Capture Phase, the player wins when all of the following are true:

1. The Enemy Draw Deck is empty.
2. All four Enemy Row positions are empty.
3. No Ace, Jack, Queen, or King is in the Enemy Capture Pile.

The intended outcome is that every enemy combatant has been captured by the player into the Player's Discard Pile, rather than lost to the Enemy Capture Pile. If cards remain in the Enemy Draw Deck or Enemy Row, begin another round. The source also says the player loses if they become “stuck in a position that forces [them] to lose,” but does not define that condition.

## State model for an implementation

Track at least:

```text
personalDrawDeck: ordered cards
playerHand: cards
playerDiscardPile: cards (hidden from the player)
enemyDrawDeck: ordered cards
enemyRow: Position1..Position4, each a card or empty
enemyCapturePile: cards (hidden from the player)
phase: enemy | discard | draw | capture
status: playing | won | lost
```

Track physical card identity (rank and suit; Joker identity) separately from effective rank/suit when a Joker is used for a capture. Player discard and Enemy Capture piles are tracked by the game engine but are not inspectable by the player.

## Unspecified rules and implementation notes

These details are absent or ambiguous in the source PDF. Keep any chosen policy explicit in an implementation.

1. **Opening hand:** the setup illustration shows four cards in the player's hand, but the written setup does not instruct the player to draw them. Recommended default: draw four from the Personal Draw Deck during setup, matching the illustration. A strict reading of the written steps could instead leave the hand empty until the first Draw Phase.
2. **Joker assignment:** the source says a Joker acts like any one other card in the player's hand and illustrates counting it as an additional copy. It does not specify whether the copied card must also be spent, whether multiple Jokers may copy the same card, or whether a Joker may copy another Joker. The examples only demonstrate copying a non-Joker card.
3. **Returning multiple setup combatants:** the source says to put any dealt face cards at the bottom of the Enemy Draw Deck, but does not specify their order if multiple face cards were dealt.
4. **Deck exhaustion during a refill or draw:** the Enemy Phase says to skip when the Enemy Draw Deck is empty, but does not detail partial refills. The Draw Phase says to shuffle the discard pile when the Personal Draw Deck runs out, but does not define what happens if the player still cannot reach four cards after the discard pile is shuffled.
5. **“Stuck” loss:** the source names getting stuck as a way to lose but gives no formal test for it. The only fully specified loss condition is a face card entering the Enemy Capture Pile.

## Source-faithful action checklist

- An Enemy Row card captured by the player goes to the Player's Discard Pile.
- A spent card used to capture an Enemy Row card goes to the Player's Discard Pile.
- **Let Your Card Get Captured** always uses Position 1 and removes one enemy card plus one hand card from play.
- **Sacrifice Two Cards** removes two hand cards from play and returns one chosen Enemy Row card to the bottom of the Enemy Draw Deck.
- Any Ace, Jack, Queen, or King sent to the Enemy Capture Pile causes an immediate loss.
- Each Capture Phase performs one of the three listed actions.
- Check victory only after the Capture Phase.
