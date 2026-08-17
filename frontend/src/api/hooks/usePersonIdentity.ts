import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  createIdentityTag,
  deleteIdentityTag,
  fetchIdentityTags,
  fetchPersonIdentity,
  setPersonIdentity,
  updateIdentityTag,
  type IdentityTag,
} from "@/api/domains/personIdentity.api";

export function useIdentityTags(enabled = true) {
  return useQuery({
    queryKey: ["personIdentity", "tags"] as const,
    queryFn: fetchIdentityTags,
    enabled,
  });
}

/** 拉取全量身份映射，转成 Map<userId, IdentityTag[]> 供表格按 row.id 查询 */
export function usePersonIdentityMap(enabled = true) {
  return useQuery({
    queryKey: ["personIdentity", "list"] as const,
    queryFn: async () => {
      const list = await fetchPersonIdentity();
      const map = new Map<string, IdentityTag[]>();
      for (const item of list) {
        map.set(item.userId, item.tags ?? []);
      }
      return map;
    },
    enabled,
  });
}

export function useSetPersonIdentity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      tagIds,
    }: {
      userId: string;
      tagIds: number[];
    }) => setPersonIdentity(userId, tagIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personIdentity", "list"] });
      toast.success("身份标识已保存");
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
}

export function useCreateIdentityTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createIdentityTag,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personIdentity", "tags"] });
      toast.success("身份标签已新增");
    },
    onError: (e: Error) => toast.error(e.message || "新增失败"),
  });
}

export function useUpdateIdentityTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: { label?: string; sortOrder?: number; active?: number };
    }) => updateIdentityTag(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personIdentity", "tags"] });
      toast.success("身份标签已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useDeleteIdentityTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteIdentityTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personIdentity", "tags"] });
      toast.success("身份标签已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}
