import { useMemo, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAgvTags,
  useCreateAgvTag,
  useUpdateAgvTag,
  useDeleteAgvTag,
  useSetAgvTagHidden,
  createAgvTag,
  setAgvTagHidden,
  AGV_TAGS_KEY,
  type AgvTag,
  type AgvTagDraft,
  type AgvTagPayload,
} from "@/api/domains/agvTag.api";
import {
  DEFAULT_TAG_COLOR,
  getAllTagOptions,
  getAllTagColors,
  getVisibleTags,
} from "@/features/agv-tracker/tagConfig";
import { AGV_ROBOTS } from "@/features/agv-tracker/agvRobotConfig";

const ROBOTS = AGV_ROBOTS;

/** 迁移前的本机结构，仅供一次性迁移读取 */
interface LegacyCustomTag {
  name?: string;
  color?: string;
  scope?: "world" | "agv";
  agvIp?: string;
}
const LEGACY_TAGS_KEY = "agvCustomTags";
const LEGACY_HIDDEN_KEY = "agvHiddenTags";
const MIGRATED_KEY = "agvTagsMigrated";

const EMPTY: AgvTagPayload = { tags: [], hidden: {} };

export function useAgvTagManagement(tagControlIp: string) {
  const qc = useQueryClient();
  const { data } = useAgvTags();
  const payload = data ?? EMPTY;

  const createMut = useCreateAgvTag();
  const updateMut = useUpdateAgvTag();
  const deleteMut = useDeleteAgvTag();
  const hiddenMut = useSetAgvTagHidden();

  const tags = payload.tags;

  // 下游按 Set 消费；为每台车都建条目，免得调用方到处判空
  const hiddenTagsByIp = useMemo(() => {
    const result: Record<string, Set<string>> = {};
    for (const r of ROBOTS) result[r.ip] = new Set(payload.hidden[r.ip] ?? []);
    return result;
  }, [payload.hidden]);

  const allTagOptions = useMemo(() => getAllTagOptions(tags), [tags]);
  const allTagColors = useMemo(() => getAllTagColors(tags), [tags]);
  const creatableTags = useMemo(
    () => getVisibleTags(tagControlIp, tags),
    [tagControlIp, tags],
  );

  const toggleHiddenTag = (ip: string, tag: string) => {
    const nextHidden = !(hiddenTagsByIp[ip]?.has(tag) ?? false);
    // 乐观更新：显隐是高频点击，等一个往返会让筛选栏发木
    qc.setQueryData<AgvTagPayload>(AGV_TAGS_KEY, (old) => {
      if (!old) return old;
      const set = new Set(old.hidden[ip] ?? []);
      if (nextHidden) set.add(tag);
      else set.delete(tag);
      return { ...old, hidden: { ...old.hidden, [ip]: [...set] } };
    });
    hiddenMut.mutate({ robotIp: ip, tagName: tag, hidden: nextHidden });
  };

  const handleAddCustomTag = (
    name: string,
    color: string,
    scope: "world" | "agv",
    agvIp?: string,
  ) => {
    createMut.mutate({ name, color, scope, robotIp: scope === "agv" ? agvIp : undefined });
  };

  const handleUpdateTag = (id: number, draft: AgvTagDraft) => {
    updateMut.mutate({ id, draft });
  };

  const handleDeleteCustomTag = (id: number) => {
    deleteMut.mutate(id);
  };

  // ── 一次性迁移：本机标签与显隐回写服务端 ──
  // 标签定义此前只存在于建标签那台机器上，别人看到的区域会掉成默认色。
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || !data) return;
    if (localStorage.getItem(MIGRATED_KEY)) return;
    migratedRef.current = true;
    void (async () => {
      try {
        const known = new Set(data.tags.map((t) => t.name));
        const rawTags = localStorage.getItem(LEGACY_TAGS_KEY);
        const legacy: LegacyCustomTag[] = rawTags ? JSON.parse(rawTags) : [];
        for (const lt of legacy) {
          const name = (lt.name ?? "").trim();
          if (!name || known.has(name)) continue;
          const scope = lt.scope === "agv" ? "agv" : "world";
          if (scope === "agv" && !lt.agvIp) continue; // 结构损坏，跳过
          await createAgvTag({
            name,
            color: lt.color || DEFAULT_TAG_COLOR,
            scope,
            robotIp: scope === "agv" ? lt.agvIp : undefined,
          });
          known.add(name);
        }

        const rawHidden = localStorage.getItem(LEGACY_HIDDEN_KEY);
        const legacyHidden: Record<string, string[]> = rawHidden ? JSON.parse(rawHidden) : {};
        for (const [ip, names] of Object.entries(legacyHidden)) {
          for (const n of names ?? []) {
            if ((data.hidden[ip] ?? []).includes(n)) continue;
            await setAgvTagHidden(ip, n, true);
          }
        }

        localStorage.setItem(MIGRATED_KEY, "1");
        qc.invalidateQueries({ queryKey: AGV_TAGS_KEY });
      } catch {
        migratedRef.current = false; // 失败则下次进入页面重试
      }
    })();
  }, [data, qc]);

  return {
    hiddenTagsByIp,
    toggleHiddenTag,
    tags,
    handleAddCustomTag,
    handleUpdateTag,
    handleDeleteCustomTag,
    allTagOptions,
    allTagColors,
    creatableTags,
    tagMutationError:
      createMut.error?.message ??
      updateMut.error?.message ??
      deleteMut.error?.message ??
      null,
  };
}

export type { AgvTag };
