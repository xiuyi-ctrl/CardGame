import type { GameState, Unlocks } from '../game/state/game';
import { DEFAULT_UNLOCKS } from '../game/state/game';
import { isValidGameState } from '../game/state/reducer';

export interface PetCardBridge {
  platform: string;
  saveGame: (slot: number, json: string) => Promise<boolean>;
  loadGame: (slot: number) => Promise<string | null>;
  deleteSave: (slot: number) => Promise<boolean>;
  quit: () => void;
}

declare global {
  interface Window {
    petCard?: PetCardBridge;
  }
}

export const SAVE_SLOT_COUNT = 6;

const deletedSlots = new Set<number>();

function slotKey(slot: number): string {
  return `petCardSave_${slot}`;
}

/** 双模式存档：每个槽位同时保存主模式和熟练度远征 */
export interface DualSave {
  main?: GameState | null;
  proficiency?: GameState | null;
}

/** 检测 JSON 是否为旧格式（直接 GameState） */
function isLegacySave(obj: unknown): obj is GameState {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.seed === 'number' && typeof o.screen === 'string' && Array.isArray(o.roster);
}

/** 从 localStorage 原始 JSON 解析为 DualSave（含旧格式迁移） */
function parseDualSave(json: string): DualSave | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    // 新格式：已有 main/proficiency 字段
    if ('main' in (parsed as Record<string, unknown>) || 'proficiency' in (parsed as Record<string, unknown>)) {
      const ds = parsed as DualSave;
      return {
        main: isValidGameState(ds.main) ? ds.main : null,
        proficiency: isValidGameState(ds.proficiency) ? ds.proficiency : null,
      };
    }
    // 旧格式：直接是 GameState
    if (isLegacySave(parsed)) {
      const key = parsed.runMode === 'proficiency' ? 'proficiency' : 'main';
      return { [key]: parsed } as DualSave;
    }
    return null;
  } catch {
    return null;
  }
}

/** 读取槽位原始 DualSave（内部用） */
async function readDualSave(slot: number): Promise<DualSave | null> {
  if (slot < 1 || slot > SAVE_SLOT_COUNT) return null;
  let json: string | null = null;
  if (window.petCard) {
    try { json = await window.petCard.loadGame(slot); } catch { json = null; }
  } else {
    try { json = localStorage.getItem(slotKey(slot)); } catch { json = null; }
  }
  if (!json) return null;
  return parseDualSave(json);
}

/** 写入 DualSave 到槽位 */
async function writeDualSave(slot: number, ds: DualSave): Promise<void> {
  if (deletedSlots.has(slot)) return;
  const json = JSON.stringify(ds);
  if (window.petCard) {
    try { await window.petCard.saveGame(slot, json); } catch { /* ignore */ }
  } else {
    try { localStorage.setItem(slotKey(slot), json); } catch { /* ignore */ }
  }
}

/** 保存当前 GameState 到对应模式分支 */
export async function persistSave(state: GameState): Promise<void> {
  const slot = state.saveSlot;
  if (typeof slot !== 'number' || slot < 1 || slot > SAVE_SLOT_COUNT) return;
  if (deletedSlots.has(slot)) return;
  const mode = state.runMode === 'proficiency' ? 'proficiency' : 'main';
  const existing = await readDualSave(slot);
  const ds: DualSave = { ...existing, [mode]: state };
  await writeDualSave(slot, ds);
}

/** 加载指定槽位的 DualSave */
export async function loadSave(slot: number): Promise<DualSave | null> {
  return readDualSave(slot);
}

/** 从 DualSave 中取指定模式的 GameState */
export function loadSlotMode(ds: DualSave | null, mode: 'main' | 'proficiency'): GameState | null {
  if (!ds) return null;
  const s = ds[mode];
  return isValidGameState(s) ? s : null;
}

export async function deleteSave(slot: number): Promise<boolean> {
  if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;
  try {
    if (window.petCard) {
      await window.petCard.deleteSave(slot);
    } else {
      localStorage.removeItem(slotKey(slot));
    }
  } catch { /* best effort */ }
  deletedSlots.add(slot);
  return true;
}

/** 仅删除指定槽位的某个模式分支（main 或 proficiency），保留另一模式 */
export async function deleteSaveMode(slot: number, mode: 'main' | 'proficiency'): Promise<boolean> {
  if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;
  const existing = await readDualSave(slot);
  if (!existing) return true;
  const ds: DualSave = { ...existing, [mode]: null };
  // 两个分支都为空时等同于删除整个存档
  if (!ds.main && !ds.proficiency) {
    return deleteSave(slot);
  }
  await writeDualSave(slot, ds);
  return true;
}

export function clearDeletedSlot(slot: number): void {
  deletedSlots.delete(slot);
}

export interface SaveSlotInfo {
  slot: number;
  main: GameState | null;
  proficiency: GameState | null;
}

export async function listSaves(): Promise<SaveSlotInfo[]> {
  const results: SaveSlotInfo[] = [];
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    const ds = await readDualSave(i);
    results.push({
      slot: i,
      main: ds?.main ?? null,
      proficiency: ds?.proficiency ?? null,
    });
  }
  return results;
}

export function quitGame(): void {
  if (window.petCard) window.petCard.quit();
}

export function persistUnlocks(unlocks: Unlocks): void {
  try {
    localStorage.setItem('petCardUnlocks', JSON.stringify(unlocks));
  } catch { /* ignore */ }
}

export function loadUnlocks(): Unlocks {
  try {
    const json = localStorage.getItem('petCardUnlocks');
    if (json) {
      const parsed = JSON.parse(json) as Partial<Unlocks>;
      return {
        difficulties: parsed.difficulties ?? DEFAULT_UNLOCKS.difficulties,
        relics: parsed.relics ?? [],
        bestGrade: parsed.bestGrade,
        proficiencyUnlocked: parsed.proficiencyUnlocked ?? false,
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
  difficulty?: string,
): Unlocks {
  const next = { ...currentUnlocks, difficulties: [...currentUnlocks.difficulties], relics: [...currentUnlocks.relics] };
  const gradeRank: Record<string, number> = { S: 4, A: 3, B: 2, C: 1, D: 0 };
  const rank = gradeRank[grade] ?? 0;
  if (difficulty === 'normal' && rank >= 3 && !next.difficulties.includes('hard')) next.difficulties.push('hard');
  if (difficulty === 'hard' && rank >= 3 && !next.difficulties.includes('nightmare')) next.difficulties.push('nightmare');
  if (rank >= 2 && !next.relics.includes('traveler_charm')) next.relics.push('traveler_charm');
  if (rank >= 3 && !next.relics.includes('elite_badge')) next.relics.push('elite_badge');
  if (rank >= 4 && !next.relics.includes('legend_seal')) next.relics.push('legend_seal');
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
  if (rank > (gradeRank[next.bestGrade ?? 'D'] ?? 0)) next.bestGrade = grade;
  return next;
}
