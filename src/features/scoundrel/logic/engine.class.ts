export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type CardType = "monster" | "weapon" | "potion";

// Base Card class
export class DungeonCard {
  constructor(
    public type: CardType,
    public suit: Suit,
    public rank: Rank,
  ) {}
}

export class MonsterCard extends DungeonCard {
  constructor(suit: Suit, rank: Rank) {
    super("monster", suit, rank);
  }
}

export class WeaponCard extends DungeonCard {
  constructor(suit: Suit, rank: Rank) {
    super("weapon", suit, rank);
  }
}

export class PotionCard extends DungeonCard {
  constructor(suit: Suit, rank: Rank) {
    super("potion", suit, rank);
  }
}

export class Room {
  cards: DungeonCard[];
  constructor(cards: DungeonCard[]) {
    this.cards = cards;
  }
  removeCard(card: DungeonCard): void {
    this.cards = this.cards.filter((c) => c !== card);
  }
  isEmpty(): boolean {
    return this.cards.length === 0;
  }
}

export class Player {
  health: number;
  maxHealth: number;
  equippedWeapon: WeaponCard | null = null;
  monstersOnWeapon: MonsterCard[] = [];
  lastMonsterDefeated: MonsterCard | null = null;
  potionTakenThisTurn: boolean = false;

  constructor(health = 20, maxHealth = 20) {
    this.health = health;
    this.maxHealth = maxHealth;
  }

  takePotion(card: PotionCard): void {
    if (this.potionTakenThisTurn) return;
    this.health = Math.min(this.health + card.rank, this.maxHealth);
    this.potionTakenThisTurn = true;
  }

  takeWeapon(card: WeaponCard): void {
    if (this.equippedWeapon) {
      this.monstersOnWeapon = [];
    }
    this.equippedWeapon = card;
    this.lastMonsterDefeated = null;
  }

  fightMonster(card: MonsterCard, mode: "barehanded" | "weapon"): void {
    if (mode === "barehanded") {
      this.health -= card.rank;
    } else if (this.equippedWeapon) {
      if (this.lastMonsterDefeated && card.rank > this.lastMonsterDefeated.rank) return;
      const damage = Math.max(card.rank - this.equippedWeapon.rank, 0);
      this.health -= damage;
      this.lastMonsterDefeated = card;
      this.monstersOnWeapon.push(card);
    }
  }
}

export class Game {
  deck: DungeonCard[];
  discard: DungeonCard[] = [];
  currentRoom: Room = new Room([]);
  player: Player;
  canDeferRoom: boolean = true;
  lastActionWasDefer: boolean = false;
  gameOver: boolean = false;
  victory: boolean = false;
  score: number = 0;

  constructor(deck?: DungeonCard[], player?: Player) {
    this.deck = deck ?? Game.createDeck();
    this.player = player ?? new Player();
    this.applyTurnRules();
  }

  /**
   * Returns all possible actions for the current state.
   * Each action is typed as 'playCard', 'enterRoom', or 'skipRoom'.
   * Card actions include card and mode; room actions do not.
   */
  getPossibleActions(): Array<{ actionType: string; card?: DungeonCard; mode?: "barehanded" | "weapon" }> {
    if (this.gameOver || !this.currentRoom || !Array.isArray(this.currentRoom.cards)) {
      return [];
    }
    const actions: Array<{ actionType: string; card?: DungeonCard; mode?: "barehanded" | "weapon" }> = [];
    // Room-level actions
    if (this.currentRoom && Array.isArray(this.currentRoom.cards) && this.currentRoom.cards.length === 4) {
      actions.push({ actionType: "enterRoom" });
      if (this.canDeferRoom && !this.lastActionWasDefer) {
        actions.push({ actionType: "skipRoom" });
      }
    } else {
      // Card actions
      for (const card of this.currentRoom.cards) {
        if (card.type === "monster") {
          actions.push({ actionType: "playCard", card, mode: "barehanded" });
          if (this.player.equippedWeapon) {
            if (!this.player.lastMonsterDefeated || card.rank <= this.player.lastMonsterDefeated.rank) {
              actions.push({ actionType: "playCard", card, mode: "weapon" });
            }
          }
        } else if (card.type === "potion") {
          actions.push({ actionType: "playCard", card });
        } else if (card.type === "weapon") {
          actions.push({ actionType: "playCard", card });
        }
      }
    }
    return actions;
  }

  /**
   * Simulates the effect of playing a dungeon card on the player's health.
   * Returns the simulated health value after the card action.
   */
  simulateCardAction(card: DungeonCard, mode?: "barehanded" | "weapon"): number {
    // Clone player state for simulation
    const simPlayer = Object.assign(Object.create(Object.getPrototypeOf(this.player)), this.player);
    if (card.type === "monster") {
      simPlayer.fightMonster(card as MonsterCard, mode ?? "barehanded");
    } else if (card.type === "weapon") {
      simPlayer.takeWeapon(card as WeaponCard);
    } else if (card.type === "potion") {
      simPlayer.takePotion(card as PotionCard);
    }
    return Math.max(0, Math.min(simPlayer.health, simPlayer.maxHealth));
  }

  /**
   * Handles the action of playing a dungeon card in the Scoundrel game.
   * Processes the given card action based on the current game state and the specified mode.
   */
  handleCardAction(card: DungeonCard, mode?: "barehanded" | "weapon"): void {
    if (card.type === "monster") {
      this.player.fightMonster(card as MonsterCard, mode ?? "barehanded");
      this.currentRoom.removeCard(card);
      this.discard.push(card);
    } else if (card.type === "weapon") {
      this.player.takeWeapon(card as WeaponCard);
      this.currentRoom.removeCard(card);
      this.discard.push(card);
    } else if (card.type === "potion") {
      this.player.takePotion(card as PotionCard);
      this.currentRoom.removeCard(card);
      this.discard.push(card);
    }

    this.applyTurnRules();
  }

  static createDeck(): DungeonCard[] {
    const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
    const deck: DungeonCard[] = [];
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        if ((suit === "hearts" || suit === "diamonds") && (rank === 11 || rank === 12 || rank === 13 || rank === 14)) continue;
        if ((suit === "hearts" || suit === "diamonds") && rank === 14) continue;
        let card: DungeonCard;
        if (suit === "hearts") card = new PotionCard(suit, rank as Rank);
        else if (suit === "diamonds") card = new WeaponCard(suit, rank as Rank);
        else card = new MonsterCard(suit, rank as Rank);
        deck.push(card);
      }
    }
    return Game.shuffle(deck);
  }

  static shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  dealRoom(): Room {
    const cards: DungeonCard[] = [];
    while (cards.length < 4 && this.deck.length > 0) {
      cards.push(this.deck.shift()!);
    }
    return new Room(cards);
  }

  enterRoom(): void {
    this.canDeferRoom = true;
    this.lastActionWasDefer = false;
    this.player.potionTakenThisTurn = false;
  }

  avoidRoom(): void {
    if (!this.canDeferRoom || this.lastActionWasDefer) return;
    this.deck.push(...this.currentRoom.cards);
    this.currentRoom.cards = [];
    this.canDeferRoom = false;
    this.lastActionWasDefer = true;
  }

  finalizeRoom(): void {
    if (this.currentRoom.cards.length === 1) {
      this.currentRoom.cards = [];
    }
  }

  applyTurnRules(): void {
    if (this.player.health <= 0) {
      this.gameOver = true;
      const monstersLeft = this.deck.filter((card) => card.type === "monster");
      const monstersValue = monstersLeft.reduce((sum, card) => sum + card.rank, 0);
      this.score = monstersValue;
      return;
    }
    if (this.deck.length === 0 && this.currentRoom.cards.length === 0) {
      this.victory = true;
    }

    if (this.currentRoom.cards.length === 1 && this.deck.length > 0) {
      this.finalizeRoom();
      this.currentRoom = this.dealRoom();
      this.player.potionTakenThisTurn = false;
      this.canDeferRoom = true;
      this.lastActionWasDefer = false;
    }
  }
}
