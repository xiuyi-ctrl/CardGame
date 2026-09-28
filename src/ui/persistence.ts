import { DEFAULT_UNLOCKS, type GameState, type Unlocks } from '../game/state/game';
import { migrateGameState } from '../game/state/reducer';

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
export const CURRENT_SAVE_VERSION = 1;

const deletedSlots = new Set<number>();

function slotKey(slot: number): string {
  return `petCardSave_${slot}`;
}

/** 双模式存档：每个槽位同时保存主模式和熟练度远征 */
export interface DualSave {
  saveVersion: number;
  main?: GameState | null;
  proficiency?: GameState | null;
}

/** 检测 JSON 是否为旧格式（直接 GameState） */
function isLegacySave(obj: unknown): obj is GameState {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return typeof o.seed === 'number' && typeof o.screen === 'string' && Array.isArray(o.roster);
}

/** 解析并迁移存档；兼容旧版单模式 GameState 与无版本号的双模式存档。 */
export function parseDualSave(json: string): DualSave | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    // 新格式：已有 main/proficiency 字段
    if ('main' in record || 'proficiency' in record) {
      const rawVersion = record.saveVersion;
      if (rawVersion !== undefined && (!Number.isInteger(rawVersion) || (rawVersion as number) < 1 || (rawVersion as number) > CURRENT_SAVE_VERSION)) {
        return null;
      }
      return {
        saveVersion: CURRENT_SAVE_VERSION,
        main: migrateGameState(record.main),
        proficiency: migrateGameState(record.proficiency),
      };
    }
    // 旧格式：直接是 GameState
    if (isLegacySave(parsed)) {
      const migrated = migrateGameState(parsed);
      if (!migrated) return null;
      return migrated.runMode === 'proficiency'
        ? { saveVersion: CURRENT_SAVE_VERSION, proficiency: migrated, main: null }
        : { saveVersion: CURRENT_SAVE_VERSION, main: migrated, proficiency: null };
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
  const json = JSON.stringify({ ...ds, saveVersion: CURRENT_SAVE_VERSION });
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
  const ds: DualSave = { saveVersion: CURRENT_SAVE_VERSION, ...existing, [mode]: state };
  await writeDualSave(slot, ds);
}

/** 加载指定槽位的 DualSave */
export async function loadSave(slot: number): Promise<DualSave | null> {
  return readDualSave(slot);
}

/** 从 DualSave 中取指定模式的 GameState */
export function loadSlotMode(ds: DualSave | null, mode: 'main' | 'proficiency'): GameState | null {
  if (!ds) return null;
  return migrateGameState(ds[mode]);
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

/** 取得槽位已有成就；主模式优先，空槽返回全新的默认解锁。 */
export function getSlotUnlocks(slot?: Pick<SaveSlotInfo, 'main' | 'proficiency'>): Unlocks {
  const source = slot?.main?.unlocks ?? slot?.proficiency?.unlocks ?? DEFAULT_UNLOCKS;
  return {
    ...source,
    difficulties: [...source.difficulties],
    relics: [...source.relics],
  };
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
  if (next.bestGrade === undefined || rank > (gradeRank[next.bestGrade] ?? 0)) next.bestGrade = grade;
  return next;
}
