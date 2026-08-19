'use client';
import { useEffect } from 'react';
import { create } from 'zustand';
import type { Role } from '@prisma/client';

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  department: string;
  designation: string;
  employeeIdCode: string;
  avatarUrl: string | null;
}

interface SessionStore {
  user: SessionUser | null;
  set: (u: SessionUser) => void;
}

export const useSession = create<SessionStore>((set) => ({
  user: null,
  set: (u) => set({ user: u }),
}));

/** Called by AppShell to sync the server-derived user into client state. */
export function useCurrentUserSync(user: SessionUser) {
  const setUser = useSession((s) => s.set);
  useEffect(() => {
    setUser(user);
  }, [user, setUser]);
}

/** Utility for pure client components. */
export function useCurrentUser(): SessionUser | null {
  return useSession((s) => s.user);
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLORS = ['#805AD5', '#DD6B20', '#319795', '#3182CE', '#D69E2E', '#E53E3E', '#38A169'];
export function avatarColorFor(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
