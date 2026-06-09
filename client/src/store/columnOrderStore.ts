import { create } from 'zustand';
import {
  DEFAULT_COLUMN_ORDERS,
  mergeColumnOrder,
  TableLevel,
} from '../utils/columnOrder';

const STORAGE_KEY = 'ads_manager_column_order_v1';

function loadOrders(): Record<TableLevel, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        campaign: [...DEFAULT_COLUMN_ORDERS.campaign],
        adset: [...DEFAULT_COLUMN_ORDERS.adset],
        ad: [...DEFAULT_COLUMN_ORDERS.ad],
      };
    }
    const parsed = JSON.parse(raw) as Partial<Record<TableLevel, string[]>>;
    return {
      campaign: mergeColumnOrder('campaign', parsed.campaign),
      adset: mergeColumnOrder('adset', parsed.adset),
      ad: mergeColumnOrder('ad', parsed.ad),
    };
  } catch {
    return {
      campaign: [...DEFAULT_COLUMN_ORDERS.campaign],
      adset: [...DEFAULT_COLUMN_ORDERS.adset],
      ad: [...DEFAULT_COLUMN_ORDERS.ad],
    };
  }
}

function persistOrders(orders: Record<TableLevel, string[]>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

interface ColumnOrderState {
  orders: Record<TableLevel, string[]>;
  setOrder: (level: TableLevel, order: string[]) => void;
  resetOrder: (level: TableLevel) => void;
  resetAll: () => void;
}

export const useColumnOrderStore = create<ColumnOrderState>((set) => ({
  orders: loadOrders(),

  setOrder: (level, order) =>
    set((state) => {
      const orders = { ...state.orders, [level]: mergeColumnOrder(level, order) };
      persistOrders(orders);
      return { orders };
    }),

  resetOrder: (level) =>
    set((state) => {
      const orders = { ...state.orders, [level]: [...DEFAULT_COLUMN_ORDERS[level]] };
      persistOrders(orders);
      return { orders };
    }),

  resetAll: () => {
    const orders = {
      campaign: [...DEFAULT_COLUMN_ORDERS.campaign],
      adset: [...DEFAULT_COLUMN_ORDERS.adset],
      ad: [...DEFAULT_COLUMN_ORDERS.ad],
    };
    persistOrders(orders);
    set({ orders });
  },
}));
