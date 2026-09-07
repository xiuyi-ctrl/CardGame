import type { GameState, Unlocks } from '../game/state/game';
import { DEFAULT_UNLOCKS } from '../game/state/game';
import { isValidGameState } from '../game/state/reducer';

export interface PetCardBridge {
  platform: string;
  saveGame: (json: string) => Promise<boolean>;
  loadGame: () => Promise<string | null>;
  quit: () => void;
}

declare global {
  interface Window {
    petCard?: PetCardBridge;
  }
}

const LS_KEY = 'petCardSave';

export async function persistSave(state: GameState): Promise<void> {
  const json = JSON.stringify(state);
  if (window.petCard) {
    try {
      await window.petCard.saveGame(json);
    } catch {
      /* ignore */
    }
  } else {
    try {
      localStorage.setItem(LS_KEY, json);
    } catch {
      /* ignore */
    }
  }
}

export async function loadSave(): Promise<GameState | null> {
  let json: string | null = null;
  if (window.petCard) {
    try {
      json = await window.petCard.loadGame();
    } catch {
      json = null;
    }
  } else {
    try {
      json = localStorage.getItem(LS_KEY);
    } catch {
      json = null;
    }
  }
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return isValidGameState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function quitGame(): void {
  if (window.petCard) window.petCard.quit();
}

const UNLOCKS_KEY = 'petCardUnlocks';

export function persistUnlocks(unlocks: Unlocks): void {
  try {
    localStorage.setItem(UNLOCKS_KEY, JSON.stringify(unlocks));
  } catch { /* ignore */ }
}

export function loadUnlocks(): Unlocks {
  try {
    const json = localStorage.getItem(UNLOCKS_KEY);
    if (json) {
      const parsed = JSON.parse(json) as Partial<Unlocks>;
      return {
        difficulties: parsed.difficulties ?? DEFAULT_UNLOCKS.difficulties,
        relics: parsed.relics ?? [],
        bestGrade: parsed.bestGrade,
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_UNLOCKS };
}

/** 检测通关后的解锁内容，返回新解锁项 */
export function detectUnlocks(
  currentUnlocks: Unlocks,
  grade: string,
  roster: { speciesId: string; passive?: string }[],
): Unlocks {
  const next = { ...currentUnlocks, difficulties: [...currentUnlocks.difficulties], relics: [...currentUnlocks.relics] };
  // 难度解锁
  if ((grade === 'A' || grade === 'S') && !next.difficulties.includes('hard')) next.difficulties.push('hard');
  if (grade === 'S' && !next.difficulties.includes('nightmare')) next.difficulties.push('nightmare');
  // 遗物解锁（评级阈值）
  const gradeRank: Record<string, number> = { S: 4, A: 3, B: 2, C: 1, D: 0 };
  const rank = gradeRank[grade] ?? 0;
  if (rank >= 2 && !next.relics.includes('traveler_charm')) next.relics.push('traveler_charm');
  if (rank >= 3 && !next.relics.includes('elite_badge')) next.relics.push('elite_badge');
  if (rank >= 4 && !next.relics.includes('legend_seal')) next.relics.push('legend_seal');
  // 勋章解锁（S 评级 + 队伍流派检测）
  if (rank >= 4) {
    const passiveCounts: Record<string, number> = {};
    for (const p of roster) {
      if (p.passive) passiveCounts[p.passive] = (passiveCounts[p.passive] ?? 0) + 1;
    }
    const scorchTypes = ['scorch', 'fireRage', 'emberDeath', 'flameAura', 'moltenArmor'];
    const tankTypes = ['guard', 'thorns', 'thornRoyal', 'rockShellBreak'];
    const poisonTypes = ['venom', 'venomPower', 'corruptSpread', 'corruptSac'];
    const countOf = (types: string[]) => types.reduce((s, t) => s + (passiveCounts[t] ?? 0), 0);
    if (countOf(scorchTypes) >= 3 && !next.relics.includes('flame_medal')) next.relics.push('flame_medal');
    if (countOf(tankTypes) >= 3 && !next.relics.includes('nature_medal')) next.relics.push('nature_medal');
    if (countOf(poisonTypes) >= 3 && !next.relics.includes('shadow_medal')) next.relics.push('shadow_medal');
  }
  // 最高评级
  if (rank > (gradeRank[next.bestGrade ?? 'D'] ?? 0)) next.bestGrade = grade;
  return next;
}
