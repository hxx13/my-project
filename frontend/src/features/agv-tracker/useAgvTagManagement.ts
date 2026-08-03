import { useState, useEffect, useMemo } from "react";
import {
  loadCustomTags,
  saveCustomTags,
  getAllTagOptions,
  getAllTagColors,
  getVisibleTags,
  createCustomTag,
  type CustomTag,
} from "@/features/agv-tracker/tagConfig";

const ROBOTS = [
  { ip: "172.22.159.16", label: "AGV-1", color: "#3b82f6" },
  { ip: "172.22.159.18", label: "AGV-2", color: "#22c55e" },
  { ip: "172.22.159.20", label: "AGV-3", color: "#f59e0b" },
  { ip: "172.22.159.22", label: "AGV-4", color: "#8b5cf6" },
];

function loadHiddenTags(): Record<string, Set<string>> {
  try {
    const raw = localStorage.getItem("agvHiddenTags");
    if (raw) {
      const parsed = JSON.parse(raw);
      const result: Record<string, Set<string>> = {};
      for (const r of ROBOTS) result[r.ip] = new Set(parsed[r.ip] || []);
      return result;
    }
  } catch {
    /* ignore */
  }
  const init: Record<string, Set<string>> = {};
  for (const r of ROBOTS) init[r.ip] = new Set<string>();
  return init;
}

export function useAgvTagManagement(tagControlIp: string) {
  const [hiddenTagsByIp, setHiddenTagsByIp] = useState<Record<string, Set<string>>>(loadHiddenTags);

  useEffect(() => {
    const obj: Record<string, string[]> = {};
    for (const ip of Object.keys(hiddenTagsByIp)) obj[ip] = [...hiddenTagsByIp[ip]];
    localStorage.setItem("agvHiddenTags", JSON.stringify(obj));
  }, [hiddenTagsByIp]);

  const toggleHiddenTag = (ip: string, tag: string) => {
    setHiddenTagsByIp((prev) => {
      const next = { ...prev };
      const cur = new Set(prev[ip] ?? []);
      if (cur.has(tag)) cur.delete(tag);
      else cur.add(tag);
      next[ip] = cur;
      return next;
    });
  };

  // 自定义标签
  const [customTags, setCustomTags] = useState<CustomTag[]>(loadCustomTags);

  const allTagOptions = useMemo(() => getAllTagOptions(customTags), [customTags]);
  const allTagColors = useMemo(() => getAllTagColors(customTags), [customTags]);

  const handleAddCustomTag = (name: string, color: string, scope: "world" | "agv", agvIp?: string) => {
    const tag = createCustomTag(name, color, scope, agvIp);
    const next = [...customTags, tag];
    setCustomTags(next);
    saveCustomTags(next);
  };

  const handleDeleteCustomTag = (id: string) => {
    const next = customTags.filter((t) => t.id !== id);
    setCustomTags(next);
    saveCustomTags(next);
  };

  const creatableTags = useMemo(
    () => getVisibleTags(tagControlIp, customTags),
    [tagControlIp, customTags],
  );

  return {
    hiddenTagsByIp,
    setHiddenTagsByIp,
    toggleHiddenTag,
    customTags,
    handleAddCustomTag,
    handleDeleteCustomTag,
    allTagOptions,
    allTagColors,
    creatableTags,
  };
}
