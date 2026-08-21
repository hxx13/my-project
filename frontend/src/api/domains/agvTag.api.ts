import { authHttp } from "@/api/core/authHttp";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──

/**
 * AGV 语义标签。区域通过 semanticTags 按 **名字** 引用标签，
 * 名字在服务端带唯一约束，改名/删除由服务端级联更新区域引用与显隐状态。
 */
export interface AgvTag {
  id: number;
  name: string;
  color: string;
  scope: "world" | "agv";
  /** scope=agv 时的归属车 IP */
  robotIp?: string | null;
  /** 内置标签：可改色，不可改名/删除 */
  builtin: boolean;
  sortOrder: number;
}

export type AgvTagDraft = Pick<AgvTag, "name" | "color" | "scope"> &
  Partial<Pick<AgvTag, "robotIp" | "sortOrder">>;

export interface AgvTagPayload {
  tags: AgvTag[];
  /** robotIp → 该车隐藏的标签名（全局共享） */
  hidden: Record<string, string[]>;
}

// ── Fetchers ──

export async function fetchAgvTags(): Promise<AgvTagPayload> {
  const res = await authHttp.get<{ data: AgvTagPayload }>("/v1/agv/tags");
  return res.data.data;
}

export async function createAgvTag(draft: AgvTagDraft): Promise<AgvTag> {
  const res = await authHttp.post<{ data: AgvTag }>("/v1/agv/tags", draft);
  return res.data.data;
}

export async function updateAgvTag(id: number, draft: AgvTagDraft): Promise<AgvTag> {
  const res = await authHttp.put<{ data: AgvTag }>(`/v1/agv/tags/${id}`, draft);
  return res.data.data;
}

export async function deleteAgvTag(id: number): Promise<void> {
  await authHttp.delete(`/v1/agv/tags/${id}`);
}

export async function setAgvTagHidden(
  robotIp: string,
  tagName: string,
  hidden: boolean,
): Promise<void> {
  const params = new URLSearchParams({ robotIp, tagName, hidden: String(hidden) });
  await authHttp.put(`/v1/agv/tags/hidden?${params.toString()}`);
}

// ── Hooks ──

export const AGV_TAGS_KEY = ["agvTags"];

export function useAgvTags() {
  return useQuery({ queryKey: AGV_TAGS_KEY, queryFn: fetchAgvTags, staleTime: 60_000 });
}

/**
 * 改名与删除会在服务端级联改写区域的 semanticTags，
 * 因此这两个 mutation 必须连 agvSpatialElements 一起失效，否则画布上的
 * 区域仍按旧标签名过滤/着色。
 */
function useTagMutation<TArgs>(
  fn: (args: TArgs) => Promise<unknown>,
  label: string,
  cascadesToZones: boolean,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AGV_TAGS_KEY });
      if (cascadesToZones) qc.invalidateQueries({ queryKey: ["agvSpatialElements"] });
    },
    onError: (e: Error) => { console.error(`${label}失败:`, e.message); },
  });
}

export function useCreateAgvTag() {
  return useTagMutation((draft: AgvTagDraft) => createAgvTag(draft), "新建标签", false);
}

export function useUpdateAgvTag() {
  return useTagMutation(
    (v: { id: number; draft: AgvTagDraft }) => updateAgvTag(v.id, v.draft),
    "更新标签",
    true,
  );
}

export function useDeleteAgvTag() {
  return useTagMutation((id: number) => deleteAgvTag(id), "删除标签", true);
}

export function useSetAgvTagHidden() {
  return useTagMutation(
    (v: { robotIp: string; tagName: string; hidden: boolean }) =>
      setAgvTagHidden(v.robotIp, v.tagName, v.hidden),
    "设置标签显隐",
    false,
  );
}
