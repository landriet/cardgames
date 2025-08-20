import e from "express";

// Types from original scoundrel.ts
export interface ScoundrelGameState {
  deck: DungeonCard[];
  discard: DungeonCard[];
  currentRoom: Room;
  equippedWeapon: DungeonCard | null;
  lastMonsterDefeated: DungeonCard | null;
  monstersOnWeapon: DungeonCard[];
  health: number;
  maxHealth: number;
  canDeferRoom: boolean;
  lastActionWasDefer: boolean;
  gameOver: boolean;
  victory: boolean;
  potionTakenThisTurn?: boolean;
  score?: number;
  pendingMonsterChoice?: { monster: DungeonCard };
}
// Scoundrel Engine Library
// Export all main classes and types

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type CardType = "monster" | "weapon" | "potion";

export class DungeonCard {
  constructor(
    public type: CardType,
    public suit: Suit,
    public rank: Rank,
  ) {}

  clone(): DungeonCard {
    return new DungeonCard(this.type, this.suit, this.rank);
  }

  toString(): string {
    return `${this.type}-${this.suit}-${this.rank}`;
  }
}

export class MonsterCard extends DungeonCard {
  constructor(suit: Suit, rank: Rank) {
    super("monster", suit, rank);
  }

  clone(): MonsterCard {
    return new MonsterCard(this.suit, this.rank);
  }
}

export class WeaponCard extends DungeonCard {
  constructor(rank: Rank) {
    super("weapon", "diamonds", rank);
  }

  clone(): WeaponCard {
    return new WeaponCard(this.rank);
  }
}

export class PotionCard extends DungeonCard {
  constructor(rank: Rank) {
    super("potion", "hearts", rank);
  }

  clone(): PotionCard {
    return new PotionCard(this.rank);
  }
}

export type GameAction = { actionType: string; card?: DungeonCard; mode?: "barehanded" | "weapon" };

export class Room {
  cards: DungeonCard[];
  constructor(cards: DungeonCard[]) {
    this.cards = cards;
  }
  clone(): Room {
    return new Room(
      this.cards.map((card) => {
        if (card instanceof MonsterCard) return card.clone();
        if (card instanceof WeaponCard) return card.clone();
        if (card instanceof PotionCard) return card.clone();
        return card.clone();
      }),
    );
  }
  removeCard(card: DungeonCard): void {
    const found = this.cards.some((c) => c.type === card.type && c.suit === card.suit && c.rank === card.rank);
    if (!found) {
      throw new Error("Card not found in room");
    }
    let removed = false;
    this.cards = this.cards.filter((c) => {
      if (!removed && c.type === card.type && c.suit === card.suit && c.rank === card.rank) {
        removed = true;
        return false;
      }
      return true;
    });
  }
  isEmpty(): boolean {
    return this.cards.length === 0;
  }
}

export class Player {
  static fromJSON(obj: any): Player {
    const player = new Player(obj.health, obj.maxHealth);
    player.equippedWeapon = obj.equippedWeapon ? new WeaponCard(obj.equippedWeapon.rank) : null;
    player.monstersOnWeapon = obj.monstersOnWeapon ? obj.monstersOnWeapon.map((m: any) => new MonsterCard(m.suit, m.rank)) : [];
    player.lastMonsterDefeated = obj.lastMonsterDefeated
      ? new MonsterCard(obj.lastMonsterDefeated.suit, obj.lastMonsterDefeated.rank)
      : null;
    player.potionTakenThisTurn = obj.potionTakenThisTurn;
    return player;
  }

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

  clone(): Player {
    const cloned = new Player(this.health, this.maxHealth);
    cloned.equippedWeapon = this.equippedWeapon ? this.equippedWeapon.clone() : null;
    cloned.monstersOnWeapon = this.monstersOnWeapon.map((m) => m.clone());
    cloned.lastMonsterDefeated = this.lastMonsterDefeated ? this.lastMonsterDefeated.clone() : null;
    cloned.potionTakenThisTurn = this.potionTakenThisTurn;
    return cloned;
  }

  takePotion(card: PotionCard): void {
    if (this.potionTakenThisTurn) return;
    this.health = Math.min(this.health + card.rank, this.maxHealth);
    this.potionTakenThisTurn = true;
  }

  undoTakePotion(card: PotionCard): void {
    if (!this.potionTakenThisTurn) return;
    this.health = Math.max(this.health - card.rank, 0);
    this.potionTakenThisTurn = false;
  }

  takeWeapon(card: WeaponCard): { previousWeapon: WeaponCard | undefined; previousMonsters: MonsterCard[] } {
    const previousWeapon = this.equippedWeapon ? this.equippedWeapon : undefined;
    const previousMonsters = [...this.monstersOnWeapon];
    if (this.equippedWeapon) {
      this.monstersOnWeapon = [];
    }
    this.equippedWeapon = card;
    this.lastMonsterDefeated = null;
    return { previousWeapon, previousMonsters };
  }

  undoTakeWeapon(previousWeapon: WeaponCard | undefined, previousMonsters: MonsterCard[] | undefined): void {
    this.equippedWeapon = previousWeapon ? previousWeapon : null;
    if (previousMonsters) {
      this.monstersOnWeapon = [...previousMonsters];
      this.lastMonsterDefeated = previousMonsters.length > 0 ? previousMonsters[previousMonsters.length - 1] : null;
    }
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

  undoFightMonster(card: MonsterCard, mode: "barehanded" | "weapon"): void {
    if (mode === "barehanded") {
      this.health += card.rank;
    } else {
      const damage = Math.max(this.equippedWeapon!.rank - card.rank, 0);
      this.health += damage;
      this.monstersOnWeapon = this.monstersOnWeapon.filter((m) => m.suit !== card.suit || m.rank !== card.rank);
      this.lastMonsterDefeated = this.monstersOnWeapon.length > 0 ? this.monstersOnWeapon[this.monstersOnWeapon.length - 1] : null;
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
  roomBeingEntered: boolean = false;
  lastAction: {
    actionType: string;
    card?: DungeonCard;
    mode?: "barehanded" | "weapon";
    previousWeapon?: WeaponCard;
    previousMonsters?: MonsterCard[];
  } | null = null;

  constructor(deck?: DungeonCard[], player?: Player) {
    this.deck = deck ?? Game.createDeck();
    this.player = player ?? new Player();
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
        if (suit === "hearts") card = new PotionCard(rank as Rank);
        else if (suit === "diamonds") card = new WeaponCard(rank as Rank);
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

  getPossibleActions(): GameAction[] {
    if (this.gameOver || !this.currentRoom || !Array.isArray(this.currentRoom.cards)) {
      return [];
    }
    const actions: GameAction[] = [];
    if (!this.roomBeingEntered) {
      actions.push({ actionType: "enterRoom" });
      if (this.canDeferRoom && !this.lastActionWasDefer && this.deck.length > 0) {
        actions.push({ actionType: "skipRoom" });
      }
    } else {
      for (const card of this.currentRoom.cards) {
        if (card.type === "monster") {
          if (this.player.equippedWeapon) {
            if (!this.player.lastMonsterDefeated || card.rank <= this.player.lastMonsterDefeated.rank) {
              actions.push({ actionType: "playCard", card, mode: "weapon" });
            }
          }
          actions.push({ actionType: "playCard", card, mode: "barehanded" });
        } else if (card.type === "potion") {
          actions.push({ actionType: "playCard", card });
        } else if (card.type === "weapon") {
          actions.push({ actionType: "playCard", card });
        }
      }
    }
    return actions;
  }

  simulateCardAction(card: DungeonCard, mode?: "barehanded" | "weapon"): number {
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

  dealRoom(): void {
    const cards: DungeonCard[] = this.currentRoom.cards.slice();
    while (cards.length < 4 && this.deck.length > 0) {
      cards.push(this.deck.shift()!);
    }
    this.currentRoom = new Room(cards);
    this.roomBeingEntered = false;
  }

  enterRoom(): void {
    this.canDeferRoom = true;
    this.lastActionWasDefer = false;
    this.player.potionTakenThisTurn = false;
    this.roomBeingEntered = true;
    this.lastAction = { actionType: "enterRoom" };
  }

  undoEnterRoom(): void {
    if (!this.roomBeingEntered) return;
    this.roomBeingEntered = false;
    this.canDeferRoom = true;
    this.lastActionWasDefer = false;
    this.player.potionTakenThisTurn = false;
    this.lastAction = { actionType: "enterRoom" };
  }

  avoidRoom(): void {
    if (!this.canDeferRoom || this.lastActionWasDefer || this.deck.length === 0) return;
    this.deck.push(...this.currentRoom.cards);
    this.currentRoom.cards = [];
    this.canDeferRoom = false;
    this.lastActionWasDefer = true;
    this.applyTurnRules();
    this.lastAction = { actionType: "skipRoom" };
  }

  undoAvoidRoom(): void {
    if (this.lastAction?.actionType !== "skipRoom") return;
    this.canDeferRoom = true;
    this.lastActionWasDefer = false;
    this.deck = [...this.currentRoom.cards, ...this.deck];
    this.currentRoom.cards = [...this.deck.splice(-4)];
    this.lastAction = { actionType: "skipRoom" };
  }

  handleCardAction(card: DungeonCard, mode?: "barehanded" | "weapon"): void {
    if (
      !this.roomBeingEntered ||
      !this.currentRoom.cards.some((c) => c.type === card.type && c.suit === card.suit && c.rank === card.rank)
    ) {
      throw new Error("Card not in current room");
    }
    if (card.type === "monster") {
      this.player.fightMonster(card as MonsterCard, mode ?? "barehanded");
      this.currentRoom.removeCard(card);
      this.discard.push(card);
      this.lastAction = { actionType: "playCard", card, mode };
    } else if (card.type === "weapon") {
      const weaponResult = this.player.takeWeapon(card as WeaponCard);
      if (weaponResult.previousWeapon) {
        this.discard.push(weaponResult.previousWeapon);
        this.discard.push(...weaponResult.previousMonsters);
      }
      this.currentRoom.removeCard(card);
      this.lastAction = {
        actionType: "playCard",
        card,
        previousWeapon: weaponResult.previousWeapon,
        previousMonsters: weaponResult.previousMonsters,
      };
    } else if (card.type === "potion") {
      this.player.takePotion(card as PotionCard);
      this.currentRoom.removeCard(card);
      this.discard.push(card);
      this.lastAction = { actionType: "playCard", card, mode };
    }
    this.applyTurnRules();
  }

  undoHandleCardAction(): void {
    if (this.lastAction?.actionType !== "playCard") {
      return;
    }
    const { card, mode } = this.lastAction;
    if (!card) return;
    if (card.type === "monster") {
      this.player.undoFightMonster(card as MonsterCard, mode ?? "barehanded");
      this.currentRoom.cards.push(card);
      if (mode === "barehanded") {
        this.discard = this.discard.filter((c) => c !== card);
      }
    } else if (card.type === "weapon") {
      this.player.undoTakeWeapon(this.lastAction.previousWeapon, this.lastAction.previousMonsters);
      this.currentRoom.cards.push(card);
    } else if (card.type === "potion") {
      this.player.undoTakePotion(card as PotionCard);
      this.currentRoom.cards.push(card);
      this.discard = this.discard.filter((c) => c !== card);
    }
  }

  undoLastAction(): void {
    if (!this.lastAction) return;
    if (this.lastAction.actionType === "enterRoom") {
      this.undoEnterRoom();
    } else if (this.lastAction.actionType === "skipRoom") {
      this.undoAvoidRoom();
    } else if (this.lastAction.actionType === "playCard") {
      this.undoHandleCardAction();
    }
  }

  applyTurnRules(): void {
    if (this.player.health <= 0) {
      this.gameOver = true;
      return;
    }
    if (this.deck.length === 0 && this.currentRoom.cards.length === 0) {
      this.victory = true;
      return;
    }
    if (this.currentRoom.cards.length <= 1 && this.deck.length > 0) {
      this.dealRoom();
    }
  }

  undoApplyTurnRules(): void {
    this.gameOver = false;
    this.victory = false;
    // if room have 4 cards, we need to undeal the last 3.
    if (this.currentRoom.cards.length > 4) {
      const cardsToRemove = this.currentRoom.cards.slice(0, this.currentRoom.cards.length - 4);
      this.deck.push(...cardsToRemove);
      this.currentRoom.cards = this.currentRoom.cards.slice(-4);
    }
  }

  calculateScore(): number {
    const monstersLeft = this.deck.filter((card) => card.type === "monster");
    const monstersValue = monstersLeft.reduce((sum, card) => sum + card.rank, 0);
    return Math.max(0, this.player.health) - monstersValue;
  }

  clone(): Game {
    const cloned = new Game();
    cloned.deck = this.deck.map((card) => {
      return card.clone();
    });
    cloned.discard = this.discard.map((card) => {
      return card.clone();
    });
    cloned.currentRoom = this.currentRoom.clone();
    cloned.player = this.player.clone();
    cloned.canDeferRoom = this.canDeferRoom;
    cloned.lastActionWasDefer = this.lastActionWasDefer;
    cloned.gameOver = this.gameOver;
    cloned.victory = this.victory;
    cloned.roomBeingEntered = this.roomBeingEntered;
    cloned.lastAction = this.lastAction ? { ...this.lastAction } : null;
    return cloned;
  }

  static fromJSON(obj: any): Game {
    const game = new Game();
    game.deck = obj.deck.map((card: any) => new DungeonCard(card.type, card.suit, card.rank));
    game.discard = obj.discard.map((card: any) => new DungeonCard(card.type, card.suit, card.rank));
    game.currentRoom = new Room(obj.currentRoom.cards.map((card: any) => new DungeonCard(card.type, card.suit, card.rank)));
    game.player = Player.fromJSON(obj.player);
    game.canDeferRoom = obj.canDeferRoom;
    game.lastActionWasDefer = obj.lastActionWasDefer;
    game.gameOver = obj.gameOver;
    game.victory = obj.victory;
    game.roomBeingEntered = obj.roomBeingEntered;
    return game;
  }
}
