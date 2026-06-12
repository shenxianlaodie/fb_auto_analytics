import { create } from 'zustand';

export type Level = 'campaign' | 'adset' | 'ad';

export interface DrillContext {
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
}

interface AdsManagerState {
  activeTab: Level;
  selected: Record<Level, string[]>;
  drill: DrillContext;
  setActiveTab: (tab: Level) => void;
  setSelected: (level: Level, ids: string[]) => void;
  clearSelected: (level?: Level) => void;
  enterCampaign: (id: string, name: string) => void;
  enterAdset: (id: string, name: string) => void;
  exitToRoot: () => void;
  exitToCampaign: () => void;
  setDrill: (drill: Partial<DrillContext>) => void;
}

const emptySelected: Record<Level, string[]> = { campaign: [], adset: [], ad: [] };

const emptyDrill: DrillContext = {
  campaignId: null,
  campaignName: null,
  adsetId: null,
  adsetName: null,
};

export const useAdsManagerStore = create<AdsManagerState>((set) => ({
  activeTab: 'campaign',
  selected: { ...emptySelected },
  drill: { ...emptyDrill },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setSelected: (level, ids) =>
    set((s) => ({ selected: { ...s.selected, [level]: ids } })),

  clearSelected: (level) =>
    set((s) => ({
      selected: level ? { ...s.selected, [level]: [] } : { ...emptySelected },
    })),

  enterCampaign: (id, name) =>
    set({
      drill: {
        campaignId: id,
        campaignName: name,
        adsetId: null,
        adsetName: null,
      },
    }),

  enterAdset: (id, name) =>
    set((s) => ({
      drill: {
        ...s.drill,
        adsetId: id,
        adsetName: name,
      },
    })),

  exitToRoot: () => set({ drill: { ...emptyDrill } }),

  exitToCampaign: () =>
    set((s) => ({
      drill: {
        ...s.drill,
        adsetId: null,
        adsetName: null,
      },
    })),

  setDrill: (partial) =>
    set((s) => ({
      drill: { ...s.drill, ...partial },
    })),
}));

export function getDrillLevel(drill: DrillContext): 'root' | 'campaign' | 'adset' {
  if (drill.adsetId) return 'adset';
  if (drill.campaignId) return 'campaign';
  return 'root';
}
