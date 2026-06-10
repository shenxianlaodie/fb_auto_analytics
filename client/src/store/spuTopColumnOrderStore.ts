import { create } from 'zustand';
import api from '../services/api';
import {
  DEFAULT_SPU_TOP_COLUMN_ORDER,
  mergeSpuTopColumnOrder,
  SpuTopColumnKey,
} from '../utils/spuTopColumnOrder';

interface SpuTopColumnOrderState {
  order: SpuTopColumnKey[];
  updatedAt: string | null;
  loaded: boolean;
  saving: boolean;
  fetchOrder: () => Promise<void>;
  saveOrder: (order: SpuTopColumnKey[]) => Promise<void>;
  resetOrder: () => Promise<void>;
}

export const useSpuTopColumnOrderStore = create<SpuTopColumnOrderState>((set, get) => ({
  order: [...DEFAULT_SPU_TOP_COLUMN_ORDER],
  updatedAt: null,
  loaded: false,
  saving: false,

  fetchOrder: async () => {
    try {
      const resp = await api.get('/analytics/spu-top/column-order');
      const columnOrder = mergeSpuTopColumnOrder(resp.data.columnOrder) as SpuTopColumnKey[];
      set({
        order: columnOrder,
        updatedAt: resp.data.updatedAt ?? null,
        loaded: true,
      });
    } catch {
      if (!get().loaded) {
        set({ order: [...DEFAULT_SPU_TOP_COLUMN_ORDER], loaded: true });
      }
    }
  },

  saveOrder: async (order) => {
    const merged = mergeSpuTopColumnOrder(order) as SpuTopColumnKey[];
    set({ saving: true });
    try {
      const resp = await api.put('/analytics/spu-top/column-order', { columnOrder: merged });
      set({
        order: mergeSpuTopColumnOrder(resp.data.columnOrder) as SpuTopColumnKey[],
        updatedAt: resp.data.updatedAt ?? null,
        saving: false,
      });
    } catch (err) {
      set({ saving: false });
      throw err;
    }
  },

  resetOrder: async () => {
    await get().saveOrder([...DEFAULT_SPU_TOP_COLUMN_ORDER]);
  },
}));
