import { create } from 'zustand';
import { todayDateRange } from '../utils/todayRange';

interface UIState {
  sidebarCollapsed: boolean;
  dateRange: [string, string];
  /** 指标细分：none=汇总，day=按单日展开 */
  timeBreakdown: 'none' | 'day';
  toggleSidebar: () => void;
  setDateRange: (range: [string, string]) => void;
  setTimeBreakdown: (v: 'none' | 'day') => void;
}

const defaultRange = todayDateRange();

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  dateRange: [defaultRange.dateStart, defaultRange.dateEnd],
  timeBreakdown: 'none',

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setDateRange: (range: [string, string]) => set({ dateRange: range }),

  setTimeBreakdown: (timeBreakdown) => set({ timeBreakdown }),
}));
