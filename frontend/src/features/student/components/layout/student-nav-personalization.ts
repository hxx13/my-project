/**
 * 学生端侧栏个性化 — 后端持久化（/api/me/mini-preferences）
 * localStorage 作为离线 fallback，后端数据优先。
 */

import {
  fetchMiniPreferences,
  saveMiniPreferences,
} from "@/api/domains/me.api";

/* ------------------------------------------------------------------ */
/*  localStorage keys (fallback)                                        */
/* ------------------------------------------------------------------ */

const STARS_KEY = "student-sidebar-stars";
const RECENT_KEY = "student-sidebar-recent";
const LOCK_KEY = "student-sidebar-lock";
const RECENT_MAX = 8;

/** 个性化变更事件：收藏/常用/锁定写入后广播，供侧栏、命令面板重新读取 */
export const STUDENT_NAV_PERSONALIZATION_EVENT = "aro-student-nav-personalization";

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */

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

function dispatchPersonalizationChanged() {
  try {
    window.dispatchEvent(new Event(STUDENT_NAV_PERSONALIZATION_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * 只提交学生端侧栏自己的字段。
 * 曾经是「读整包 → 改三个字段 → 回写整包」，而整包来自页面级的陈旧副本，
 * 学生端每次导航都会触发 —— 于是刚切好的亮/暗色会被这份旧包冲回原值。
 * 后端对未提交（null）的字段保留库内值，局部提交即可。
 */
async function persistServer() {
  try {
    await saveMiniPreferences({
      studentNavRecent: readStudentNavRecent(),
      studentNavStars: readStudentNavStars(),
      studentNavLock: readStudentNavLock() ?? "",
    });
  } catch { /* offline — keep local */ }
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

    dispatchPersonalizationChanged();
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
  dispatchPersonalizationChanged();
  persistServer();
}

export function toggleStudentNavStar(path: string): boolean {
  const set = new Set(readStudentNavStars());
  const was = set.has(path);
  if (was) set.delete(path); else set.add(path);
  writeLocalList(STARS_KEY, [...set]);
  dispatchPersonalizationChanged();
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
    dispatchPersonalizationChanged();
    persistServer();
    return false;
  }
  writeLocal(LOCK_KEY, path);
  dispatchPersonalizationChanged();
  persistServer();
  return true;
}

export function isStudentNavLocked(path: string): boolean {
  return readStudentNavLock() === path;
}

export function clearStudentNavLock(): void {
  writeLocal(LOCK_KEY, null);
  dispatchPersonalizationChanged();
  persistServer();
}
