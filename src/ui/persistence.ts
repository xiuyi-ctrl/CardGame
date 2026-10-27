import { DEFAULT_UNLOCKS, RELIC_ORDER, economicRelicUnlocks, growthRelicUnlocks, type GameState, type RunStats, type Unlocks } from '../game/state/game';
import { migrateGameState } from '../game/state/reducer';
import { isAndroid, readSaveFile, writeSaveFile, removeSaveFile, shareSaveFile, reportSaveError } from './platform';

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

const saveQueues = new Map<number, Promise<unknown>>();

function inSaveQueue<T>(slot: number, work: () => Promise<T>): Promise<T> {
  const result = (saveQueues.get(slot) ?? Promise.resolve()).then(work);
  const settled = result.catch(() => {});
  saveQueues.set(slot, settled);
  void settled.then(() => { if (saveQueues.get(slot) === settled) saveQueues.delete(slot); });
  return result;
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
  const json = await readSaveFile(slot);
  if (!json) return null;
  const parsed = parseDualSave(json);
  if (!parsed) throw new Error('存档损坏或版本不兼容');
  return parsed;
}

/** 写入 DualSave 到槽位 */
async function writeDualSave(slot: number, ds: DualSave): Promise<void> {
  if (deletedSlots.has(slot)) return;
  const json = JSON.stringify({ ...ds, saveVersion: CURRENT_SAVE_VERSION });
  await writeSaveFile(slot, json);
}

/** 保存当前 GameState 到对应模式分支 */
export async function persistSave(state: GameState): Promise<boolean> {
  if (state.testRun || state.screen.startsWith('test-')) return false;
  const slot = state.saveSlot;
  if (typeof slot !== 'number' || slot < 1 || slot > SAVE_SLOT_COUNT) return false;
  if (deletedSlots.has(slot)) return false;
  const mode = state.runMode === 'proficiency' ? 'proficiency' : 'main';
  try {
    await inSaveQueue(slot, async () => {
      if (deletedSlots.has(slot)) return;
      const existing = await readDualSave(slot);
      const ds: DualSave = { saveVersion: CURRENT_SAVE_VERSION, ...existing, [mode]: state };
      await writeDualSave(slot, ds);
    });
    return true;
  } catch { reportSaveError(); return false; }
}

/** 加载指定槽位的 DualSave */
export async function loadSave(slot: number): Promise<DualSave | null> {
  await saveQueues.get(slot);
  try { return await readDualSave(slot); } catch { reportSaveError(); return null; }
}

/** 从 DualSave 中取指定模式的 GameState */
export function loadSlotMode(ds: DualSave | null, mode: 'main' | 'proficiency'): GameState | null {
  if (!ds) return null;
  return migrateGameState(ds[mode]);
}

export async function deleteSave(slot: number): Promise<boolean> {
  if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;
  try {
    return await inSaveQueue(slot, async () => {
      await removeSaveFile(slot);
      deletedSlots.add(slot);
      return true;
    });
  } catch { reportSaveError(); return false; }
}

/** 仅删除指定槽位的某个模式分支（main 或 proficiency），保留另一模式 */
export async function deleteSaveMode(slot: number, mode: 'main' | 'proficiency'): Promise<boolean> {
  if (slot < 1 || slot > SAVE_SLOT_COUNT) return false;
  try {
    return await inSaveQueue(slot, async () => {
      const existing = await readDualSave(slot);
      if (!existing) return true;
      const ds: DualSave = { ...existing, [mode]: null };
      if (!ds.main && !ds.proficiency) {
        await removeSaveFile(slot);
        deletedSlots.add(slot);
      } else await writeDualSave(slot, ds);
      return true;
    });
  } catch { reportSaveError(); return false; }
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
    relics: [...source.relics].filter((id) => RELIC_ORDER.includes(id)),
  };
}

export async function listSaves(): Promise<SaveSlotInfo[]> {
  const results: SaveSlotInfo[] = [];
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    const ds = await loadSave(i);
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
  else if (isAndroid()) window.dispatchEvent(new Event('petcard-exit-request'));
}

export async function exportSave(slot: number): Promise<void> {
  const ds = await loadSave(slot);
  if (!ds || (!ds.main && !ds.proficiency)) throw new Error('所选槽位没有可备份的存档');
  await shareSaveFile(slot, JSON.stringify(ds));
}

export async function importSave(slot: number, json: string): Promise<void> {
  if (slot < 1 || slot > SAVE_SLOT_COUNT) throw new Error('请选择有效槽位');
  const ds = parseDualSave(json);
  if (!ds || (!ds.main && !ds.proficiency)) throw new Error('备份损坏、内容为空或版本不兼容');
  for (const state of [ds.main, ds.proficiency]) if (state) state.saveSlot = slot;
  await inSaveQueue(slot, async () => {
    clearDeletedSlot(slot);
    await writeDualSave(slot, ds);
  });
}

/** 检测通关后的难度、评级和遗物解锁内容。 */
export function detectUnlocks(
  currentUnlocks: Unlocks,
  grade: string,
  _roster: { speciesId: string; passive?: string }[],
  difficulty?: string,
  runStats?: Pick<RunStats, 'itemsUsed' | 'petsTamed'> & Partial<Pick<RunStats, 'shopGoldSpent' | 'finalTamedUids' | 'petsLost' | 'watchtowerVisits'>>,
  endingGold?: number,
): Unlocks {
  const next = {
    ...currentUnlocks,
    difficulties: [...currentUnlocks.difficulties],
    relics: [...currentUnlocks.relics].filter((id) => RELIC_ORDER.includes(id)),
  };
  const gradeRank: Record<string, number> = { S: 4, A: 3, B: 2, C: 1, D: 0 };
  const rank = gradeRank[grade] ?? 0;
  if (difficulty === 'normal' && rank >= 3 && !next.difficulties.includes('hard')) next.difficulties.push('hard');
  if (difficulty === 'hard' && rank >= 3 && !next.difficulties.includes('nightmare')) next.difficulties.push('nightmare');
  if (rank >= 2 && !next.relics.includes('traveler_charm')) next.relics.push('traveler_charm');
  if ((runStats?.itemsUsed ?? 0) >= 20 && !next.relics.includes('elite_badge')) next.relics.push('elite_badge');
  if ((runStats?.petsTamed ?? 0) >= 15 && !next.relics.includes('beast_master')) next.relics.push('beast_master');
  if (next.bestGrade === undefined || rank > (gradeRank[next.bestGrade] ?? 0)) next.bestGrade = grade;
  return growthRelicUnlocks(economicRelicUnlocks(next, endingGold ?? 0, runStats?.shopGoldSpent), runStats, _roster.length);
}
