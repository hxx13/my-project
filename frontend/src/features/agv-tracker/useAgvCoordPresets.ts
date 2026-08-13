import { useState, useRef } from "react";
import { type QueryClient } from "@tanstack/react-query";
import { updateCoordConfig } from "@/api/domains/agv.api";
import { AGV_ROBOTS, getAgvLabel } from "@/features/agv-tracker/agvRobotConfig";

const ROBOTS = AGV_ROBOTS;

export const COORD_PRESET_KEY = "agvCoordPreset";
export const SCALE_KEY = "agvCoordScales";

export function getStoredScales(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SCALE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStoredScales(s: Record<string, number>) {
  localStorage.setItem(SCALE_KEY, JSON.stringify(s));
}

export function useAgvCoordPresets(
  coordConfigs: Record<string, any> | undefined,
  qc: QueryClient,
  pushUndo: (label: string, undo: () => void) => void,
) {
  const [coordPresetSaved, setCoordPresetSaved] = useState(
    !!localStorage.getItem(COORD_PRESET_KEY),
  );

  const handleSaveCoordPreset = () => {
    if (!coordConfigs) return;
    localStorage.setItem(COORD_PRESET_KEY, JSON.stringify(coordConfigs));
    setCoordPresetSaved(true);
  };

  const handleRestoreCoordPreset = async () => {
    const raw = localStorage.getItem(COORD_PRESET_KEY);
    if (!raw) return;
    try {
      const preset: Record<string, any> = JSON.parse(raw);
      for (const r of ROBOTS) {
        const p = preset[r.ip];
        if (p) {
          await updateCoordConfig(r.ip, p.rotationDeg, p.offsetX, p.offsetY);
        }
      }
      qc.invalidateQueries({ queryKey: ["agvCoordConfigs"] });
    } catch {
      /* ignore */
    }
  };

  const handleResetCoordZero = async () => {
    for (const r of ROBOTS) {
      await updateCoordConfig(r.ip, 0, 0, 0);
    }
    qc.invalidateQueries({ queryKey: ["agvCoordConfigs"] });
  };

  const lastCoordOffsetRef = useRef<Record<string, { ox: number; oy: number }>>({});

  const handleCoordFrameScale = async (
    ip: string,
    scale: number,
    offsetX: number,
    offsetY: number,
  ) => {
    const scales = getStoredScales();
    scales[ip] = scale;
    saveStoredScales(scales);
    qc.setQueryData(["agvCoordConfigs"], (old: any) => ({
      ...old,
      [ip]: { ...old?.[ip], offsetX, offsetY, scale },
    }));
    const frame = coordConfigs?.[ip];
    await updateCoordConfig(ip, frame?.rotationDeg, offsetX, offsetY);
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
    const storedScales = getStoredScales();
    const scale = (frame as any)?.scale ?? storedScales[ip] ?? 1;

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
    getStoredScales,
  };
}
