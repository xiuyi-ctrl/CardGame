import type { GameState } from '../game/state/game';
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
