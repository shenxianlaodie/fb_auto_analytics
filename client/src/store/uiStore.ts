import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  dateRange: [string, string];
  toggleSidebar: () => void;
  setDateRange: (range: [string, string]) => void;
}

function getDefaultDateRange(): [string, string] {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]];
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  dateRange: getDefaultDateRange(),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setDateRange: (range: [string, string]) => set({ dateRange: range }),
}));
