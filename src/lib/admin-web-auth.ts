"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "admin_web_token";
const USER_KEY = "admin_web_user";

export interface AdminWebUser {
  lineUserId: string;
  displayName: string;
  realName: string | null;
  effectiveRoles: string[];
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAdminUser(): AdminWebUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AdminWebUser) : null;
  } catch {
    return null;
  }
}

export function setAdminUser(user: AdminWebUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function adminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = getAdminToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function useAdminAuth() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [adminUser, setAdminUserState] = useState<AdminWebUser | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setAdminUserState(getAdminUser());
    setReady(true);
  }, [router]);

  function logout() {
    clearAdminToken();
    router.replace("/admin/login");
  }

  return { ready, logout, adminUser };
}
