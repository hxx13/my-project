/**
 * 持久化「当前选中手术实例」；下次进入 overview / fill 自动恢复。
 */
import { useCallback, useEffect, useState } from "react";
import type { NhpSurgeryContext, NhpSurgeryKey } from "../utils/nhpSurgeryContext";
import { surgeryKeyOf } from "../utils/nhpSurgeryContext";

const STORAGE_KEY = "nhp.activeSurgeryKey";

function readStoredKey(): NhpSurgeryKey | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

function writeStoredKey(key: NhpSurgeryKey | null): void {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function useNhpActiveSurgery(surgeries: NhpSurgeryContext[]) {
  const [activeKey, setActiveKeyState] = useState<NhpSurgeryKey | null>(() => readStoredKey());

  const resolveActive = useCallback((): NhpSurgeryContext | null => {
    if (surgeries.length === 0) return null;
    const stored = activeKey ?? readStoredKey();
    const hit = stored ? surgeries.find((s) => s.key === stored) : undefined;
    return hit ?? surgeries[0];
  }, [activeKey, surgeries]);

  const active = resolveActive();

  useEffect(() => {
    if (surgeries.length === 0) return;
    const stored = readStoredKey();
    const valid = stored && surgeries.some((s) => s.key === stored);
    if (!valid) {
      const first = surgeries[0].key;
      setActiveKeyState(first);
      writeStoredKey(first);
    }
  }, [surgeries]);

  const setActiveKey = useCallback((key: NhpSurgeryKey) => {
    setActiveKeyState(key);
    writeStoredKey(key);
  }, []);

  const setActiveBySubjectId = useCallback((subjectId: number) => {
    setActiveKey(surgeryKeyOf(subjectId));
  }, [setActiveKey]);

  return { active, activeKey: active?.key ?? null, setActiveKey, setActiveBySubjectId };
}
