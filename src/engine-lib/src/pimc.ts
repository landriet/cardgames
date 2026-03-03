import { DungeonCard, Game } from "./index";

function cardKey(card: DungeonCard): string {
  return `${card.type}-${card.suit}-${card.rank}`;
}

export function getUnseenCards(game: Game): DungeonCard[] {
  // Build set of all seen card keys
  const seen = new Set<string>();

  for (const card of game.currentRoom.cards) {
    seen.add(cardKey(card));
  }
  for (const card of game.discard) {
    seen.add(cardKey(card));
  }
  if (game.player.equippedWeapon) {
    seen.add(cardKey(game.player.equippedWeapon));
  }
  for (const card of game.player.monstersOnWeapon) {
    seen.add(cardKey(card));
  }

  // Full canonical deck minus seen cards
  // Use a multiset approach: count occurrences in full deck, subtract seen
  const fullDeck = Game.createDeck();

  // Count how many of each key are seen
  const seenCounts = new Map<string, number>();
  for (const card of [...game.currentRoom.cards, ...game.discard]) {
    const key = cardKey(card);
    seenCounts.set(key, (seenCounts.get(key) ?? 0) + 1);
  }
  if (game.player.equippedWeapon) {
    const key = cardKey(game.player.equippedWeapon);
    seenCounts.set(key, (seenCounts.get(key) ?? 0) + 1);
  }
  for (const card of game.player.monstersOnWeapon) {
    const key = cardKey(card);
    seenCounts.set(key, (seenCounts.get(key) ?? 0) + 1);
  }

  // Filter full deck
  const result: DungeonCard[] = [];
  const usedCounts = new Map<string, number>();
  for (const card of fullDeck) {
    const key = cardKey(card);
    const used = usedCounts.get(key) ?? 0;
    const seenCount = seenCounts.get(key) ?? 0;
    if (used < seenCount) {
      usedCounts.set(key, used + 1);
    } else {
      result.push(card);
    }
  }

  return result;
}

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
