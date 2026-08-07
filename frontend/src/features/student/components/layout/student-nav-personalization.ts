/**
 * 学生端侧栏个性化 — 后端持久化（/api/me/mini-preferences）
 * localStorage 作为离线 fallback，后端数据优先。
 */

import {
  fetchMiniPreferences,
  saveMiniPreferences,
  defaultMiniPreferences,
  type MiniPreferences,
} from "@/api/domains/me.api";

/* ------------------------------------------------------------------ */
/*  localStorage keys (fallback)                                        */
/* ------------------------------------------------------------------ */

const STARS_KEY = "student-sidebar-stars";
const RECENT_KEY = "student-sidebar-recent";
const LOCK_KEY = "student-sidebar-lock";
const RECENT_MAX = 8;

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

let cachedPrefs: MiniPreferences | null = null;
let fetchPromise: Promise<MiniPreferences> | null = null;

async function getPrefs(): Promise<MiniPreferences> {
  if (cachedPrefs) return cachedPrefs;
  if (!fetchPromise) {
    fetchPromise = fetchMiniPreferences().then((p) => {
      cachedPrefs = p ?? defaultMiniPreferences();
      return cachedPrefs;
    }).catch(() => {
      cachedPrefs = defaultMiniPreferences();
      return cachedPrefs;
    });
  }
  return fetchPromise!;
}

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readLocalList(key: string): string[] {
  try {
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : [];
  } catch { return []; }
}

function writeLocalList(key: string, paths: string[]) {
  try { localStorage.setItem(key, JSON.stringify(paths)); } catch { /* noop */ }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch { /* noop */ }
}

async function persistServer() {
  try {
    const prefs = await getPrefs();
    const merged: MiniPreferences = {
      ...prefs,
      roomWatch: prefs.roomWatch ?? { selections: [] },
      studentNavRecent: readStudentNavRecent(),
      studentNavStars: readStudentNavStars(),
      studentNavLock: readStudentNavLock() ?? "",
    };
    await saveMiniPreferences(merged);
    cachedPrefs = merged;
  } catch { /* offline — keep local */ }
}

/** Invalidate cache so next read fetches from server */
function invalidateCache() {
  cachedPrefs = null;
  fetchPromise = null;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/** Hydrate from server → local; returns true if hydrated */
export async function hydrateStudentNavPersonalization(): Promise<boolean> {
  try {
    const prefs = await fetchMiniPreferences();
    if (!prefs) return false;

    const serverRecent = prefs.studentNavRecent ?? [];
    const serverStars = prefs.studentNavStars ?? [];
    const serverLock = prefs.studentNavLock ?? null;

    const localRecent = readLocalList(RECENT_KEY);
    const localStars = readLocalList(STARS_KEY);
    const localLock = readLocal(LOCK_KEY);

    /* Merge: server wins, local fallback */
    const recent = serverRecent.length ? serverRecent : localRecent;
    const stars = serverStars.length ? serverStars : localStars;
    const lock = serverLock ?? localLock;

    /* Write merged back to local */
    writeLocalList(RECENT_KEY, recent.slice(0, RECENT_MAX));
    writeLocalList(STARS_KEY, stars);
    writeLocal(LOCK_KEY, lock);

    cachedPrefs = prefs;
    return true;
  } catch {
    return false;
  }
}

export function readStudentNavRecent(): string[] {
  return readLocalList(RECENT_KEY);
}

export function readStudentNavStars(): string[] {
  return readLocalList(STARS_KEY);
}

export function readStudentNavLock(): string | null {
  return readLocal(LOCK_KEY);
}

export function appendStudentNavRecent(path: string): void {
  const prev = readStudentNavRecent().filter((p) => p !== path);
  const next = [path, ...prev].slice(0, RECENT_MAX);
  writeLocalList(RECENT_KEY, next);
  persistServer();
}

export function toggleStudentNavStar(path: string): boolean {
  const set = new Set(readStudentNavStars());
  const was = set.has(path);
  if (was) set.delete(path); else set.add(path);
  writeLocalList(STARS_KEY, [...set]);
  persistServer();
  return !was;
}

export function isStudentNavStarred(path: string): boolean {
  return readStudentNavStars().includes(path);
}

export function toggleStudentNavLock(path: string): boolean {
  const current = readStudentNavLock();
  if (current === path) {
    writeLocal(LOCK_KEY, null);
    persistServer();
    return false;
  }
  writeLocal(LOCK_KEY, path);
  persistServer();
  return true;
}

export function isStudentNavLocked(path: string): boolean {
  return readStudentNavLock() === path;
}

export function clearStudentNavLock(): void {
  writeLocal(LOCK_KEY, null);
  persistServer();
}
