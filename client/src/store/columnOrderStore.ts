import { create } from 'zustand';
import {
  DEFAULT_VISIBLE_COLUMNS,
  mergeVisibleColumns,
  TableLevel,
} from '../utils/columnOrder';

const STORAGE_KEY_V1 = 'ads_manager_column_order_v1';
const STORAGE_KEY_V2 = 'ads_manager_column_layout_v2';

export interface LevelLayout {
  order: string[];
  widths: Record<string, number>;
}

export type ColumnLayoutState = Record<TableLevel, LevelLayout>;

function emptyLayout(): ColumnLayoutState {
  return {
    campaign: { order: [...DEFAULT_VISIBLE_COLUMNS.campaign], widths: {} },
    adset: { order: [...DEFAULT_VISIBLE_COLUMNS.adset], widths: {} },
    ad: { order: [...DEFAULT_VISIBLE_COLUMNS.ad], widths: {} },
  };
}

function migrateFromV1(): ColumnLayoutState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<TableLevel, string[]>>;
    return {
      campaign: { order: mergeVisibleColumns('campaign', parsed.campaign), widths: {} },
      adset: { order: mergeVisibleColumns('adset', parsed.adset), widths: {} },
      ad: { order: mergeVisibleColumns('ad', parsed.ad), widths: {} },
    };
  } catch {
    return null;
  }
}

function loadLayout(): ColumnLayoutState {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<Record<TableLevel, LevelLayout>>;
      return {
        campaign: {
          order: mergeVisibleColumns('campaign', parsed.campaign?.order),
          widths: parsed.campaign?.widths ?? {},
        },
        adset: {
          order: mergeVisibleColumns('adset', parsed.adset?.order),
          widths: parsed.adset?.widths ?? {},
        },
        ad: {
          order: mergeVisibleColumns('ad', parsed.ad?.order),
          widths: parsed.ad?.widths ?? {},
        },
      };
    }
    return migrateFromV1() ?? emptyLayout();
  } catch {
    return emptyLayout();
  }
}

function persistLayout(layout: ColumnLayoutState): void {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(layout));
}

interface ColumnOrderStore {
  layout: ColumnLayoutState;
  /** @deprecated use layout[level].order */
  orders: Record<TableLevel, string[]>;
  setOrder: (level: TableLevel, order: string[]) => void;
  setColumnWidth: (level: TableLevel, key: string, width: number) => void;
  toggleColumn: (level: TableLevel, key: string, visible: boolean) => void;
  resetOrder: (level: TableLevel) => void;
  resetAll: () => void;
}

const initialLayout = loadLayout();

export const useColumnOrderStore = create<ColumnOrderStore>((set) => ({
  layout: initialLayout,
  orders: {
    campaign: initialLayout.campaign.order,
    adset: initialLayout.adset.order,
    ad: initialLayout.ad.order,
  },

  setOrder: (level, order) =>
    set((state) => {
      const merged = mergeVisibleColumns(level, order);
      const layout: ColumnLayoutState = {
        ...state.layout,
        [level]: { ...state.layout[level], order: merged },
      };
      persistLayout(layout);
      return {
        layout,
        orders: {
          campaign: layout.campaign.order,
          adset: layout.adset.order,
          ad: layout.ad.order,
        },
      };
    }),

  setColumnWidth: (level, key, width) =>
    set((state) => {
      const layout: ColumnLayoutState = {
        ...state.layout,
        [level]: {
          ...state.layout[level],
          widths: { ...state.layout[level].widths, [key]: Math.round(width) },
        },
      };
      persistLayout(layout);
      return { layout };
    }),

  toggleColumn: (level, key, visible) =>
    set((state) => {
      const current = state.layout[level].order;
      let next: string[];
      if (visible) {
        next = current.includes(key) ? current : [...current, key];
      } else {
        next = current.filter((k) => k !== key);
      }
      const merged = mergeVisibleColumns(level, next);
      const layout: ColumnLayoutState = {
        ...state.layout,
        [level]: { ...state.layout[level], order: merged },
      };
      persistLayout(layout);
      return {
        layout,
        orders: {
          campaign: layout.campaign.order,
          adset: layout.adset.order,
          ad: layout.ad.order,
        },
      };
    }),

  resetOrder: (level) =>
    set((state) => {
      const layout: ColumnLayoutState = {
        ...state.layout,
        [level]: { order: [...DEFAULT_VISIBLE_COLUMNS[level]], widths: {} },
      };
      persistLayout(layout);
      return {
        layout,
        orders: {
          campaign: layout.campaign.order,
          adset: layout.adset.order,
          ad: layout.ad.order,
        },
      };
    }),

  resetAll: () => {
    const layout = emptyLayout();
    persistLayout(layout);
    set({
      layout,
      orders: {
        campaign: layout.campaign.order,
        adset: layout.adset.order,
        ad: layout.ad.order,
      },
    });
  },
}));
