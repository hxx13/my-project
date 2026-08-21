import { useState, useRef, useEffect } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  updateCoordConfig,
  fetchCoordPreset,
  saveCoordPreset,
  restoreCoordPreset,
} from "@/api/domains/agv.api";
import { AGV_ROBOTS, getAgvLabel } from "@/features/agv-tracker/agvRobotConfig";

const ROBOTS = AGV_ROBOTS;

/** @deprecated 历史 localStorage 键；仅一次性迁移到服务端后清除，不再作为权威数据源 */
export const COORD_PRESET_KEY = "agvCoordPreset";
const COORD_PRESET_MIGRATED_KEY = "agvCoordPresetMigrated";
/** 历史遗留：scale 曾只存本机。现仅供一次性迁移读取，不再作为渲染数据源 */
export const SCALE_KEY = "agvCoordScales";
const SCALE_MIGRATED_KEY = "agvCoordScalesMigrated";

/** 归档快照：与 AgvCoordFrame 数值字段对齐；读本机遗留数据时再 normalize。 */
type CoordFrameSnap = {
  rotationDeg: number;
  offsetX: number;
  offsetY: number;
  scale: number;
};

type CoordPresetPayload = {
  savedAt: number;
  configs: Record<string, CoordFrameSnap>;
};

function normalizeCoordFrameSnap(
  f: Partial<CoordFrameSnap> | null | undefined,
): CoordFrameSnap {
  return {
    rotationDeg: f?.rotationDeg ?? 0,
    offsetX: f?.offsetX ?? 0,
    offsetY: f?.offsetY ?? 0,
    scale: f?.scale ?? 1,
  };
}

function normalizeCoordConfigs(
  configs: Record<string, Partial<CoordFrameSnap>>,
): Record<string, CoordFrameSnap> {
  const out: Record<string, CoordFrameSnap> = {};
  for (const [ip, frame] of Object.entries(configs)) {
    out[ip] = normalizeCoordFrameSnap(frame);
  }
  return out;
}

export function getStoredScales(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SCALE_KEY) || "{}");
  } catch {
    return {};
  }
}

/** 仅用于把本机遗留预设迁到服务端；迁移后不再读取 */
function readLegacyLocalPreset(): CoordPresetPayload | null {
  const raw = localStorage.getItem(COORD_PRESET_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.configs && typeof parsed.configs === "object") {
      return {
        savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
        configs: normalizeCoordConfigs(parsed.configs as Record<string, Partial<CoordFrameSnap>>),
      };
    }
    if (parsed && typeof parsed === "object") {
      return {
        savedAt: Date.now(),
        configs: normalizeCoordConfigs(parsed as Record<string, Partial<CoordFrameSnap>>),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function snapshotConfigs(coordConfigs: Record<string, any>): Record<string, CoordFrameSnap> {
  const out: Record<string, CoordFrameSnap> = {};
  for (const r of ROBOTS) {
    const f = coordConfigs[r.ip];
    if (!f) continue;
    out[r.ip] = normalizeCoordFrameSnap(f);
  }
  return out;
}

function applyConfigsToQuery(
  qc: QueryClient,
  configs: Record<string, CoordFrameSnap>,
) {
  qc.setQueryData(["agvCoordConfigs"], (old: any) => {
    const next = { ...(old ?? {}) };
    for (const r of ROBOTS) {
      const p = configs[r.ip];
      if (!p) continue;
      next[r.ip] = {
        ...next[r.ip],
        rotationDeg: p.rotationDeg ?? 0,
        offsetX: p.offsetX ?? 0,
        offsetY: p.offsetY ?? 0,
        scale: p.scale ?? 1,
      };
    }
    return next;
  });
}

export function useAgvCoordPresets(
  coordConfigs: Record<string, any> | undefined,
  qc: QueryClient,
  pushUndo: (label: string, undo: () => void) => void,
) {
  const [coordPresetSaved, setCoordPresetSaved] = useState(false);

  // ── 启动时从服务端读取是否已有预设；可选把本机遗留预设迁上去 ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let preset = await fetchCoordPreset();
        if (!preset.exists && !localStorage.getItem(COORD_PRESET_MIGRATED_KEY)) {
          const legacy = readLegacyLocalPreset();
          if (legacy && Object.keys(legacy.configs).length > 0) {
            try {
              preset = await saveCoordPreset(legacy.configs);
              localStorage.removeItem(COORD_PRESET_KEY);
              localStorage.setItem(COORD_PRESET_MIGRATED_KEY, "1");
            } catch {
              /* 迁移失败下次进入再试 */
            }
          } else {
            localStorage.setItem(COORD_PRESET_MIGRATED_KEY, "1");
          }
        }
        if (!cancelled) setCoordPresetSaved(!!preset.exists);
      } catch {
        if (!cancelled) setCoordPresetSaved(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 保存预设 = 把当前布局归档到服务端（与自动保存无关） */
  const handleSaveCoordPreset = async () => {
    if (!coordConfigs || Object.keys(coordConfigs).length === 0) {
      toast.error("坐标系尚未加载，请稍后再试");
      return;
    }
    const configs = snapshotConfigs(coordConfigs);
    if (Object.keys(configs).length === 0) {
      toast.error("当前没有可保存的坐标系数据");
      return;
    }
    try {
      await saveCoordPreset(configs);
      localStorage.removeItem(COORD_PRESET_KEY);
      setCoordPresetSaved(true);
      toast.success("已保存坐标系预设（可随时恢复）");
    } catch (e: any) {
      toast.error(e?.message ? `保存预设失败: ${e.message}` : "保存预设失败");
    }
  };

  /** 恢复预设 = 从服务端加载上次归档快照并写回实时配置 */
  const handleRestoreCoordPreset = async () => {
    try {
      const prev = coordConfigs ? snapshotConfigs(coordConfigs) : {};
      const preset = await restoreCoordPreset();
      if (!preset.exists || Object.keys(preset.configs).length === 0) {
        toast.error("暂无已保存的预设，请先点击「保存预设」");
        return;
      }
      const { configs } = preset;
      applyConfigsToQuery(qc, configs);
      setCoordPresetSaved(true);

      pushUndo("恢复坐标系预设", async () => {
        for (const r of ROBOTS) {
          const p = prev[r.ip];
          if (!p) continue;
          qc.setQueryData(["agvCoordConfigs"], (old: any) => ({
            ...old,
            [r.ip]: {
              ...old?.[r.ip],
              rotationDeg: p.rotationDeg,
              offsetX: p.offsetX,
              offsetY: p.offsetY,
              scale: p.scale,
            },
          }));
          await updateCoordConfig(r.ip, p.rotationDeg, p.offsetX, p.offsetY, p.scale);
        }
      });

      toast.success("已恢复上次保存的坐标系预设");
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("暂无已保存的预设")) {
        toast.error("暂无已保存的预设，请先点击「保存预设」");
        setCoordPresetSaved(false);
      } else {
        toast.error(msg ? `恢复预设失败: ${msg}` : "恢复预设失败");
      }
      qc.invalidateQueries({ queryKey: ["agvCoordConfigs"] });
    }
  };

  const handleResetCoordZero = async () => {
    for (const r of ROBOTS) {
      await updateCoordConfig(r.ip, 0, 0, 0, 1);
    }
    qc.invalidateQueries({ queryKey: ["agvCoordConfigs"] });
  };

  // ── 一次性迁移：本机历史 scale 回写服务端 ──
  // 库中 offset 是在本机 scale 下反解出来的（newOx = rx / scale - centerX），
  // 不回写则服务端 scale 停留在默认 1，连本机视图也会跟着偏移。
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || !coordConfigs) return;
    if (localStorage.getItem(SCALE_MIGRATED_KEY)) return;
    const local = getStoredScales();
    const pending = ROBOTS.filter((r) => {
      const localScale = local[r.ip];
      if (!localScale || localScale === 1) return false;
      // 仅在服务端仍是默认值时回写，避免覆盖别人已迁移的结果
      return ((coordConfigs[r.ip]?.scale as number | undefined) ?? 1) === 1;
    });
    migratedRef.current = true;
    if (pending.length === 0) {
      localStorage.setItem(SCALE_MIGRATED_KEY, "1");
      return;
    }
    void (async () => {
      try {
        for (const r of pending) {
          const f = coordConfigs[r.ip];
          await updateCoordConfig(r.ip, f?.rotationDeg, f?.offsetX, f?.offsetY, local[r.ip]);
        }
        localStorage.setItem(SCALE_MIGRATED_KEY, "1");
        qc.invalidateQueries({ queryKey: ["agvCoordConfigs"] });
      } catch {
        migratedRef.current = false; // 失败则下次进入页面重试
      }
    })();
  }, [coordConfigs, qc]);

  const lastCoordOffsetRef = useRef<Record<string, { ox: number; oy: number }>>({});

  const handleCoordFrameScale = async (
    ip: string,
    scale: number,
    offsetX: number,
    offsetY: number,
  ) => {
    const frame = coordConfigs?.[ip];
    qc.setQueryData(["agvCoordConfigs"], (old: any) => ({
      ...old,
      [ip]: { ...old?.[ip], offsetX, offsetY, scale },
    }));
    await updateCoordConfig(ip, frame?.rotationDeg, offsetX, offsetY, scale);
  };

  const handleCoordFrameMove = async (
    ip: string,
    offsetX: number,
    offsetY: number,
  ) => {
    const frame = coordConfigs?.[ip];
    const prev = lastCoordOffsetRef.current[ip];
    if (
      !prev ||
      Math.abs(prev.ox - offsetX) > 0.001 ||
      Math.abs(prev.oy - offsetY) > 0.001
    ) {
      const oldOx = frame?.offsetX ?? 0;
      const oldOy = frame?.offsetY ?? 0;
      pushUndo(
        `${getAgvLabel(ip)} 参考系移动`,
        async () => {
          qc.setQueryData(["agvCoordConfigs"], (old: any) => ({
            ...old,
            [ip]: { ...old?.[ip], offsetX: oldOx, offsetY: oldOy },
          }));
          await updateCoordConfig(ip, frame?.rotationDeg, oldOx, oldOy);
        },
      );
    }
    lastCoordOffsetRef.current[ip] = { ox: offsetX, oy: offsetY };
    qc.setQueryData(["agvCoordConfigs"], (old: any) => {
      if (!old) return old;
      return { ...old, [ip]: { ...old[ip], offsetX, offsetY } };
    });
    await updateCoordConfig(ip, frame?.rotationDeg, offsetX, offsetY);
  };

  /** 绕局部坐标系中心旋转 → 自动补偿 offset 使中心点世界位置不变 */
  const handleCoordFrameRotate = async (
    ip: string,
    newDeg: number,
    centerX: number,
    centerY: number,
  ) => {
    const frame = coordConfigs?.[ip];
    const oldDeg = frame?.rotationDeg ?? 0;
    const oldOx = frame?.offsetX ?? 0;
    const oldOy = frame?.offsetY ?? 0;
    const scale = (frame?.scale as number | undefined) ?? 1;

    const oldRad = (oldDeg * Math.PI) / 180;
    const newRad = (newDeg * Math.PI) / 180;

    // 当前中心的世界坐标
    const wx = (centerX + oldOx) * scale;
    const wy = (centerY + oldOy) * scale;
    const worldCx = wx * Math.cos(oldRad) - wy * Math.sin(oldRad);
    const worldCy = wx * Math.sin(oldRad) + wy * Math.cos(oldRad);

    // 新旋转下保持中心不变 → 反算 offset
    const cosNR = Math.cos(-newRad);
    const sinNR = Math.sin(-newRad);
    const rx = worldCx * cosNR - worldCy * sinNR;
    const ry = worldCx * sinNR + worldCy * cosNR;
    const newOx = rx / scale - centerX;
    const newOy = ry / scale - centerY;

    // 乐观更新 + 持久化
    qc.setQueryData(["agvCoordConfigs"], (old: any) => ({
      ...old,
      [ip]: { ...old?.[ip], rotationDeg: newDeg, offsetX: newOx, offsetY: newOy },
    }));
    pushUndo(
      `${ROBOTS.find(r => r.ip === ip)?.label ?? ip} 旋转`,
      async () => {
        qc.setQueryData(["agvCoordConfigs"], (old: any) => ({
          ...old,
          [ip]: { ...old?.[ip], rotationDeg: oldDeg, offsetX: oldOx, offsetY: oldOy },
        }),
        );
        await updateCoordConfig(ip, oldDeg, oldOx, oldOy);
      },
    );
    await updateCoordConfig(ip, newDeg, newOx, newOy);
  };

  return {
    coordPresetSaved,
    handleSaveCoordPreset,
    handleRestoreCoordPreset,
    handleResetCoordZero,
    handleCoordFrameScale,
    handleCoordFrameMove,
    handleCoordFrameRotate,
  };
}
