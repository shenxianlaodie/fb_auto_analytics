import { create } from 'zustand';

export type Level = 'campaign' | 'adset' | 'ad';

interface AdsManagerState {
  activeTab: Level;
  selected: Record<Level, string[]>;
  setActiveTab: (tab: Level) => void;
  setSelected: (level: Level, ids: string[]) => void;
  clearSelected: (level?: Level) => void;
}

const emptySelected: Record<Level, string[]> = { campaign: [], adset: [], ad: [] };

export const useAdsManagerStore = create<AdsManagerState>((set) => ({
  activeTab: 'campaign',
  selected: { ...emptySelected },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setSelected: (level, ids) =>
    set((s) => ({ selected: { ...s.selected, [level]: ids } })),

  clearSelected: (level) =>
    set((s) => ({
      selected: level ? { ...s.selected, [level]: [] } : { ...emptySelected },
    })),
}));
