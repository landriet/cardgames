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

export interface RuleConfig {
  startingHealth?: number;
  maxHealth?: number;
  potionsPerRoom?: number;
  canSkipRooms?: boolean;
  canSkipConsecutive?: boolean;
  weaponKillLimit?: boolean;
}

const DEFAULT_RULES: Required<RuleConfig> = {
  startingHealth: 20,
  maxHealth: 20,
  potionsPerRoom: 1,
  canSkipRooms: true,
  canSkipConsecutive: false,
  weaponKillLimit: true,
};

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
    player.potionsTakenThisTurn = obj.potionsTakenThisTurn ?? 0;
    return player;
  }

  health: number;
  maxHealth: number;
  equippedWeapon: WeaponCard | null = null;
  monstersOnWeapon: MonsterCard[] = [];
  lastMonsterDefeated: MonsterCard | null = null;
  potionTakenThisTurn: boolean = false;
  potionsTakenThisTurn: number = 0;

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
    cloned.potionsTakenThisTurn = this.potionsTakenThisTurn;
    return cloned;
  }

  takePotion(card: PotionCard, potionsPerRoom: number = 1): number {
    if (this.potionsTakenThisTurn >= potionsPerRoom) return 0;
    const prevHealth = this.health;
    this.health = Math.min(this.health + card.rank, this.maxHealth);
    this.potionsTakenThisTurn++;
    this.potionTakenThisTurn = this.potionsTakenThisTurn >= potionsPerRoom;
    return this.health - prevHealth;
  }

  undoTakePotion(actualHealAmount: number): void {
    if (this.potionsTakenThisTurn <= 0) return;
    this.health = Math.max(this.health - actualHealAmount, 0);
    this.potionsTakenThisTurn--;
    this.potionTakenThisTurn = this.potionsTakenThisTurn > 0;
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

  fightMonster(card: MonsterCard, mode: "barehanded" | "weapon", weaponKillLimit: boolean = true): void {
    if (mode === "barehanded") {
      this.health -= card.rank;
    } else if (this.equippedWeapon) {
      if (weaponKillLimit && this.lastMonsterDefeated && card.rank > this.lastMonsterDefeated.rank) return;
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
      const damage = Math.max(card.rank - this.equippedWeapon!.rank, 0);
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
  rules: Required<RuleConfig>;
  canDeferRoom: boolean = true;
  lastActionWasDefer: boolean = false;
  gameOver: boolean = false;
  victory: boolean = false;
  roomBeingEntered: boolean = false;
  cardsResolvedThisTurn: number = 0;
  lastResolvedCardType: CardType | null = null;
  lastResolvedPotionValue: number | null = null;
  lastAction: {
    actionType: string;
    card?: DungeonCard;
    mode?: "barehanded" | "weapon";
    previousWeapon?: WeaponCard;
    previousMonsters?: MonsterCard[];
    _previousLastAction?: Game["lastAction"];
    _savedCanDeferRoom?: boolean;
    _savedLastActionWasDefer?: boolean;
    _savedPotionTakenThisTurn?: boolean;
    _savedPotionsTakenThisTurn?: number;
    _savedRoom?: DungeonCard[];
    _savedDeckLength?: number;
    _dealtCards?: DungeonCard[];
    _dealHappened?: boolean;
    _savedGameOver?: boolean;
    _savedVictory?: boolean;
    _savedRoomBeingEntered?: boolean;
    _savedCardsResolvedThisTurn?: number;
    _savedLastResolvedCardType?: CardType | null;
    _savedLastResolvedPotionValue?: number | null;
    _savedActualHealAmount?: number;
  } | null = null;

  constructor(deck?: DungeonCard[], player?: Player, rules?: RuleConfig) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.deck = deck ?? Game.createDeck();
    this.player = player ?? new Player(this.rules.startingHealth, this.rules.maxHealth);
    this.applyTurnRules();
  }

  static createDeck(): DungeonCard[] {
    const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
    const deck: DungeonCard[] = [];
    for (const suit of suits) {
      for (let rank = 2; rank <= 14; rank++) {
        if ((suit === "hearts" || suit === "diamonds") && (rank === 11 || rank === 12 || rank === 13 || rank === 14)) continue;
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
    if (this.gameOver || this.victory || !this.currentRoom || !Array.isArray(this.currentRoom.cards)) {
      return [];
    }
    const actions: GameAction[] = [];
    if (!this.roomBeingEntered) {
      actions.push({ actionType: "enterRoom" });
      if (this.rules.canSkipRooms && this.canDeferRoom && this.currentRoom.cards.length > 0) {
        if (this.rules.canSkipConsecutive || !this.lastActionWasDefer) {
          actions.push({ actionType: "skipRoom" });
        }
      }
    } else {
      for (const card of this.currentRoom.cards) {
        if (card.type === "monster") {
          if (this.player.equippedWeapon) {
            if (!this.rules.weaponKillLimit || !this.player.lastMonsterDefeated || card.rank <= this.player.lastMonsterDefeated.rank) {
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
    const simPlayer = this.player.clone();
    if (card.type === "monster") {
      simPlayer.fightMonster(card as MonsterCard, mode ?? "barehanded", this.rules.weaponKillLimit);
    } else if (card.type === "weapon") {
      simPlayer.takeWeapon(card as WeaponCard);
    } else if (card.type === "potion") {
      simPlayer.takePotion(card as PotionCard, this.rules.potionsPerRoom);
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
    const prevLastAction = this.lastAction;
    const savedCanDeferRoom = this.canDeferRoom;
    const savedLastActionWasDefer = this.lastActionWasDefer;
    const savedPotionTakenThisTurn = this.player.potionTakenThisTurn;
    const savedPotionsTakenThisTurn = this.player.potionsTakenThisTurn;
    const savedCardsResolvedThisTurn = this.cardsResolvedThisTurn;
    this.canDeferRoom = true;
    this.lastActionWasDefer = false;
    this.player.potionTakenThisTurn = false;
    this.player.potionsTakenThisTurn = 0;
    this.roomBeingEntered = true;
    this.cardsResolvedThisTurn = 0;
    this.lastAction = {
      actionType: "enterRoom",
      _previousLastAction: prevLastAction,
      _savedCanDeferRoom: savedCanDeferRoom,
      _savedLastActionWasDefer: savedLastActionWasDefer,
      _savedPotionTakenThisTurn: savedPotionTakenThisTurn,
      _savedPotionsTakenThisTurn: savedPotionsTakenThisTurn,
      _savedCardsResolvedThisTurn: savedCardsResolvedThisTurn,
    };
  }

  undoEnterRoom(): void {
    if (!this.roomBeingEntered) return;
    const saved = this.lastAction;
    this.roomBeingEntered = false;
    this.canDeferRoom = saved?._savedCanDeferRoom ?? true;
    this.lastActionWasDefer = saved?._savedLastActionWasDefer ?? false;
    this.player.potionTakenThisTurn = saved?._savedPotionTakenThisTurn ?? false;
    this.player.potionsTakenThisTurn = saved?._savedPotionsTakenThisTurn ?? 0;
    this.cardsResolvedThisTurn = saved?._savedCardsResolvedThisTurn ?? 0;
    this.lastAction = saved?._previousLastAction ?? null;
  }

  avoidRoom(): void {
    if (!this.canDeferRoom || this.lastActionWasDefer || this.currentRoom.cards.length === 0) return;
    const prevLastAction = this.lastAction;
    const savedRoom = this.currentRoom.cards.slice();
    const savedDeckLength = this.deck.length;
    this.deck.push(...this.currentRoom.cards);
    this.currentRoom.cards = [];
    this.canDeferRoom = false;
    this.lastActionWasDefer = true;
    this.roomBeingEntered = false;
    this.applyTurnRules();
    this.lastAction = {
      actionType: "skipRoom",
      _previousLastAction: prevLastAction,
      _savedRoom: savedRoom,
      _savedDeckLength: savedDeckLength,
      _dealtCards: this.currentRoom.cards.slice(),
    };
  }

  undoAvoidRoom(): void {
    if (this.lastAction?.actionType !== "skipRoom") return;
    const saved = this.lastAction;
    // Reverse the deal: put dealt cards back at front of deck
    if (saved._dealtCards && saved._dealtCards.length > 0) {
      // The dealt cards came from the front of the deck after avoid.
      // Remove them from room and put back at the front of deck.
      this.currentRoom.cards = [];
      this.deck.unshift(...saved._dealtCards);
    }
    // Restore original room cards
    if (saved._savedRoom) {
      // The original room cards were pushed to deck bottom during avoid.
      // Remove them from deck bottom.
      this.deck.splice(saved._savedDeckLength!, saved._savedRoom.length);
      this.currentRoom = new Room(saved._savedRoom);
    }
    this.canDeferRoom = true;
    this.lastActionWasDefer = false;
    this.roomBeingEntered = false;
    this.gameOver = false;
    this.victory = false;
    this.lastAction = saved._previousLastAction ?? null;
  }

  handleCardAction(card: DungeonCard, mode?: "barehanded" | "weapon"): void {
    if (
      !this.roomBeingEntered ||
      !this.currentRoom.cards.some((c) => c.type === card.type && c.suit === card.suit && c.rank === card.rank)
    ) {
      throw new Error("Card not in current room");
    }
    const prevLastAction = this.lastAction;
    const savedGameOver = this.gameOver;
    const savedVictory = this.victory;
    const savedRoomBeingEntered = this.roomBeingEntered;
    const savedCardsResolvedThisTurn = this.cardsResolvedThisTurn;
    const savedLastResolvedCardType = this.lastResolvedCardType;
    const savedLastResolvedPotionValue = this.lastResolvedPotionValue;

    let previousWeapon: WeaponCard | undefined;
    let previousMonsters: MonsterCard[] | undefined;
    let actualHealAmount = 0;

    if (card.type === "monster") {
      if (mode === "weapon") {
        if (!this.player.equippedWeapon) {
          throw new Error("Cannot fight with weapon when no weapon is equipped");
        }
        if (this.rules.weaponKillLimit && this.player.lastMonsterDefeated && card.rank > this.player.lastMonsterDefeated.rank) {
          throw new Error("Illegal weapon action: monster exceeds weapon lock");
        }
      }
      this.player.fightMonster(card as MonsterCard, mode ?? "barehanded", this.rules.weaponKillLimit);
      this.currentRoom.removeCard(card);
      if (mode === "weapon") {
        // Monster remains stacked on weapon until the weapon is replaced.
      } else {
        this.discard.push(card);
      }
    } else if (card.type === "weapon") {
      const weaponResult = this.player.takeWeapon(card as WeaponCard);
      previousWeapon = weaponResult.previousWeapon;
      previousMonsters = weaponResult.previousMonsters;
      if (weaponResult.previousWeapon) {
        this.discard.push(weaponResult.previousWeapon);
        this.discard.push(...weaponResult.previousMonsters);
      }
      this.currentRoom.removeCard(card);
    } else if (card.type === "potion") {
      actualHealAmount = this.player.takePotion(card as PotionCard, this.rules.potionsPerRoom);
      this.currentRoom.removeCard(card);
      this.discard.push(card);
    }

    this.lastResolvedCardType = card.type;
    this.lastResolvedPotionValue = card.type === "potion" ? card.rank : null;
    this.cardsResolvedThisTurn++;
    if (this.cardsResolvedThisTurn >= 3 || this.currentRoom.cards.length === 0) {
      this.roomBeingEntered = false;
      this.cardsResolvedThisTurn = 0;
    }

    // Snapshot room card references before applyTurnRules (needed to reverse deal)
    const roomRefsBeforeDeal = new Set(this.currentRoom.cards);

    this.applyTurnRules();

    // Identify dealt cards by reference (cards in room now but not before the deal)
    const dealtCards = this.currentRoom.cards.filter((c) => !roomRefsBeforeDeal.has(c));
    const dealHappened = dealtCards.length > 0;

    this.lastAction = {
      actionType: "playCard",
      card,
      mode,
      previousWeapon,
      previousMonsters,
      _previousLastAction: prevLastAction,
      _savedGameOver: savedGameOver,
      _savedVictory: savedVictory,
      _savedRoomBeingEntered: savedRoomBeingEntered,
      _savedCardsResolvedThisTurn: savedCardsResolvedThisTurn,
      _savedLastResolvedCardType: savedLastResolvedCardType,
      _savedLastResolvedPotionValue: savedLastResolvedPotionValue,
      _dealHappened: dealHappened,
      _dealtCards: dealHappened ? dealtCards : undefined,
      _savedActualHealAmount: actualHealAmount,
    };
  }

  undoHandleCardAction(): void {
    if (this.lastAction?.actionType !== "playCard") {
      return;
    }
    const saved = this.lastAction;
    const { card, mode } = saved;
    if (!card) return;

    // Reverse deal first if one happened
    if (saved._dealHappened && saved._dealtCards) {
      const dealtSet = new Set(saved._dealtCards);
      // Remove dealt cards from room by reference and put them back at front of deck
      const remainingCards = this.currentRoom.cards.filter((c) => !dealtSet.has(c));
      this.deck.unshift(...saved._dealtCards);
      this.currentRoom = new Room(remainingCards);
    }

    // Restore gameOver/victory
    this.gameOver = saved._savedGameOver ?? false;
    this.victory = saved._savedVictory ?? false;
    this.roomBeingEntered = saved._savedRoomBeingEntered ?? false;
    this.cardsResolvedThisTurn = saved._savedCardsResolvedThisTurn ?? 0;
    this.lastResolvedCardType = saved._savedLastResolvedCardType ?? null;
    this.lastResolvedPotionValue = saved._savedLastResolvedPotionValue ?? null;

    // Undo the card action itself
    if (card.type === "monster") {
      this.player.undoFightMonster(card as MonsterCard, mode ?? "barehanded");
      this.currentRoom.cards.push(card);
      this.discard = this.discard.filter((c) => c !== card);
    } else if (card.type === "weapon") {
      if (saved.previousWeapon) {
        this.discard = this.discard.filter((c) => c !== saved.previousWeapon && !saved.previousMonsters?.includes(c));
      }
      this.player.undoTakeWeapon(saved.previousWeapon, saved.previousMonsters);
      this.currentRoom.cards.push(card);
    } else if (card.type === "potion") {
      this.player.undoTakePotion(saved._savedActualHealAmount ?? card.rank);
      this.currentRoom.cards.push(card);
      this.discard = this.discard.filter((c) => c !== card);
    }

    // Restore lastAction chain
    this.lastAction = saved._previousLastAction ?? null;
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
    if (!this.roomBeingEntered && this.currentRoom.cards.length <= 1 && this.deck.length > 0) {
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
    if (this.victory) {
      let score = this.player.health;
      if (this.player.health === 20 && this.lastResolvedCardType === "potion" && this.lastResolvedPotionValue !== null) {
        score += this.lastResolvedPotionValue;
      }
      return score;
    }
    return this.player.health - monstersValue;
  }

  clone(): Game {
    const cloned = Object.create(Game.prototype) as Game;
    cloned.rules = { ...this.rules };
    cloned.deck = this.deck.map((card) => card.clone());
    cloned.discard = this.discard.map((card) => card.clone());
    cloned.currentRoom = this.currentRoom.clone();
    cloned.player = this.player.clone();
    cloned.canDeferRoom = this.canDeferRoom;
    cloned.lastActionWasDefer = this.lastActionWasDefer;
    cloned.gameOver = this.gameOver;
    cloned.victory = this.victory;
    cloned.roomBeingEntered = this.roomBeingEntered;
    cloned.cardsResolvedThisTurn = this.cardsResolvedThisTurn;
    cloned.lastResolvedCardType = this.lastResolvedCardType;
    cloned.lastResolvedPotionValue = this.lastResolvedPotionValue;
    if (this.lastAction) {
      // Note: _previousLastAction chain is shared with the original game.
      // Only the most recent undo step is clone-isolated. Multi-step undo on
      // a clone may reference (but not mutate) the original's action history.
      cloned.lastAction = {
        ...this.lastAction,
        card: this.lastAction.card ? this.lastAction.card.clone() : undefined,
        previousWeapon: this.lastAction.previousWeapon ? this.lastAction.previousWeapon.clone() : undefined,
        previousMonsters: this.lastAction.previousMonsters ? this.lastAction.previousMonsters.map((m) => m.clone()) : undefined,
      };
    } else {
      cloned.lastAction = null;
    }
    return cloned;
  }

  static fromJSON(obj: any): Game {
    const game = new Game(undefined, undefined, obj.rules);
    game.deck = obj.deck.map((card: any) => new DungeonCard(card.type, card.suit, card.rank));
    game.discard = obj.discard.map((card: any) => new DungeonCard(card.type, card.suit, card.rank));
    game.currentRoom = new Room(obj.currentRoom.cards.map((card: any) => new DungeonCard(card.type, card.suit, card.rank)));
    game.player = Player.fromJSON(obj.player);
    game.canDeferRoom = obj.canDeferRoom;
    game.lastActionWasDefer = obj.lastActionWasDefer;
    game.gameOver = obj.gameOver;
    game.victory = obj.victory;
    game.roomBeingEntered = obj.roomBeingEntered;
    game.cardsResolvedThisTurn = obj.cardsResolvedThisTurn ?? 0;
    game.lastResolvedCardType = obj.lastResolvedCardType ?? null;
    game.lastResolvedPotionValue = obj.lastResolvedPotionValue ?? null;
    return game;
  }
}
