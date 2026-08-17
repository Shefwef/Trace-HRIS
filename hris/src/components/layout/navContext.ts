import { create } from 'zustand';

interface NavStore {
  mobileOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useMobileNav = create<NavStore>((set) => ({
  mobileOpen: false,
  open: () => set({ mobileOpen: true }),
  close: () => set({ mobileOpen: false }),
  toggle: () => set((s) => ({ mobileOpen: !s.mobileOpen })),
}));
