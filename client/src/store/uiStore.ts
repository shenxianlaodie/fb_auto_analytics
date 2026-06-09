import { create } from 'zustand';
import { todayDateRange } from '../utils/todayRange';

interface UIState {
  sidebarCollapsed: boolean;
  dateRange: [string, string];
  toggleSidebar: () => void;
  setDateRange: (range: [string, string]) => void;
}

const defaultRange = todayDateRange();

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  dateRange: [defaultRange.dateStart, defaultRange.dateEnd],

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setDateRange: (range: [string, string]) => set({ dateRange: range }),
}));
