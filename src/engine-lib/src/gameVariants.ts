import variantData from "./game-variants.json";

export type VariantSuit = "hearts" | "diamonds" | "clubs" | "spades";
export type VariantCardType = "monster" | "weapon" | "potion";

export interface VariantCard {
  type: VariantCardType;
  suit: VariantSuit;
  rank: number;
}

export interface GameRuleSettings {
  startingHealth: number;
  maxHealth: number;
  potionsPerRoom: number;
  canSkipRooms: boolean;
  canSkipConsecutive: boolean;
  weaponKillLimit: boolean;
  weaponKillLimitStrict: boolean;
}

export type RuleConfig = Partial<GameRuleSettings>;

export interface GameVariant {
  id: string;
  name: string;
  cards: VariantCard[];
  addedCards: VariantCard[];
  removedCards: VariantCard[];
  rules: GameRuleSettings;
}

interface RawVariant {
  name: string;
  addedCards: VariantCard[];
  removedCards: VariantCard[];
  rules: RuleConfig;
}

interface RawVariantData {
  schemaVersion: number;
  defaultVariant: string;
  defaultRules: GameRuleSettings;
  baseDeck: VariantCard[];
  variants: Record<string, RawVariant>;
}

const registry = variantData as RawVariantData;
const RULE_NAMES: readonly (keyof GameRuleSettings)[] = [
  "startingHealth",
  "maxHealth",
  "potionsPerRoom",
  "canSkipRooms",
  "canSkipConsecutive",
  "weaponKillLimit",
  "weaponKillLimitStrict",
];

function cardIdentity(card: VariantCard): string {
  return `${card.suit}:${card.rank}`;
}

function assertValidCard(card: VariantCard, context: string): void {
  const validTypes: VariantCardType[] = ["monster", "weapon", "potion"];
  const validSuits: VariantSuit[] = ["hearts", "diamonds", "clubs", "spades"];
  if (
    !validTypes.includes(card.type) ||
    !validSuits.includes(card.suit) ||
    !Number.isInteger(card.rank) ||
    card.rank < 2 ||
    card.rank > 14
  ) {
    throw new Error(`Invalid card in game variant ${context}.`);
  }
}

export function mergeGameRules(baseRules: GameRuleSettings, overrides: RuleConfig = {}): GameRuleSettings {
  for (const ruleSet of [baseRules, overrides]) {
    const unsupportedRule = Object.keys(ruleSet).find((key) => !RULE_NAMES.includes(key as keyof GameRuleSettings));
    if (unsupportedRule) {
      throw new Error(`Unsupported game variant rule: ${unsupportedRule}.`);
    }
  }
  const missingRule = RULE_NAMES.find((key) => !(key in baseRules));
  if (missingRule) {
    throw new Error(`Missing game variant rule: ${missingRule}.`);
  }
  const rules = { ...baseRules, ...overrides };
  if (
    !Number.isInteger(rules.startingHealth) ||
    rules.startingHealth < 1 ||
    !Number.isInteger(rules.maxHealth) ||
    rules.maxHealth < rules.startingHealth
  ) {
    throw new Error("Game variant health rules must be integers with 1 <= startingHealth <= maxHealth.");
  }
  if (!Number.isInteger(rules.potionsPerRoom) || rules.potionsPerRoom < 0) {
    throw new Error("Game variant potionsPerRoom must be a non-negative integer.");
  }
  if (
    typeof rules.canSkipRooms !== "boolean" ||
    typeof rules.canSkipConsecutive !== "boolean" ||
    typeof rules.weaponKillLimit !== "boolean" ||
    typeof rules.weaponKillLimitStrict !== "boolean"
  ) {
    throw new Error("Game variant boolean rules must be true or false.");
  }
  return rules;
}

function buildVariant(id: string): GameVariant {
  const raw = registry.variants[id];
  if (!raw) {
    throw new Error(`Unknown game variant: ${id}. Available variants: ${Object.keys(registry.variants).join(", ")}.`);
  }

  const cards = registry.baseDeck.map((card) => ({ ...card }));
  const known = new Map(cards.map((card) => [cardIdentity(card), card]));
  for (const card of raw.removedCards) {
    assertValidCard(card, id);
    if (!known.has(cardIdentity(card))) {
      throw new Error(`Cannot remove missing card ${card.suit}:${card.rank} from game variant ${id}.`);
    }
    known.delete(cardIdentity(card));
  }
  const remainingCards = cards.filter((card) => known.has(cardIdentity(card)));
  for (const card of raw.addedCards) {
    assertValidCard(card, id);
    if (known.has(cardIdentity(card))) {
      throw new Error(`Cannot add duplicate card ${card.suit}:${card.rank} to game variant ${id}.`);
    }
    known.set(cardIdentity(card), card);
    remainingCards.push({ ...card });
  }

  const baseIdentities = new Set<string>();
  for (const card of registry.baseDeck) {
    assertValidCard(card, id);
    const identity = cardIdentity(card);
    if (baseIdentities.has(identity)) {
      throw new Error(`Duplicate base card ${card.suit}:${card.rank} in game variant registry.`);
    }
    baseIdentities.add(identity);
  }
  return {
    id,
    name: raw.name,
    cards: remainingCards,
    addedCards: raw.addedCards.map((card) => ({ ...card })),
    removedCards: raw.removedCards.map((card) => ({ ...card })),
    rules: mergeGameRules(registry.defaultRules, raw.rules),
  };
}

const gameVariants = new Map<string, GameVariant>();

for (const variantId of Object.keys(registry.variants)) {
  gameVariants.set(variantId, buildVariant(variantId));
}

if (registry.schemaVersion !== 1 || !gameVariants.has(registry.defaultVariant)) {
  throw new Error("Invalid shared game variant registry header.");
}

export const DEFAULT_GAME_VARIANT = registry.defaultVariant;
export const GAME_VARIANT_IDS = [...gameVariants.keys()];

export function getGameVariant(variantId: string = DEFAULT_GAME_VARIANT): GameVariant {
  const variant = gameVariants.get(variantId);
  if (!variant) {
    throw new Error(`Unknown game variant: ${variantId}. Available variants: ${GAME_VARIANT_IDS.join(", ")}.`);
  }
  return {
    ...variant,
    cards: variant.cards.map((card) => ({ ...card })),
    addedCards: variant.addedCards.map((card) => ({ ...card })),
    removedCards: variant.removedCards.map((card) => ({ ...card })),
    rules: { ...variant.rules },
  };
}

export function getGameRules(variantId: string = DEFAULT_GAME_VARIANT, overrides: RuleConfig = {}): GameRuleSettings {
  return mergeGameRules(getGameVariant(variantId).rules, overrides);
}
