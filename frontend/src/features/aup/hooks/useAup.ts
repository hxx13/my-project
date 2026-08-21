/**
 * IACUC AUP 模块 React Query hooks。
 *
 * query key 命名沿用 queryKeys.ts 的 as const 风格（此处因约束不修改全局 queryKeys.ts，
 * 故在模块内定义 aupQueryKeys）。
 *
 * 乐观锁约定：save / autosave 携带 expectedVersion，响应回 version；
 * 409（冲突）由 authHttp 拦截器转为 Error 抛出，供上层提示后重新拉取 detail 再保存。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  autosaveAup,
  createAup,
  createAupDict,
  createAupDictItem,
  createAupTemplate,
  deleteAup,
  deleteAupAttachment,
  deleteAupDict,
  deleteAupDictItem,
  downloadAupAttachment,
  fetchAupAttachments,
  fetchAupDetail,
  fetchAupDict,
  fetchAupDicts,
  fetchAupList,
  fetchAupMyRoles,
  fetchAupPrintData,
  fetchAupPickers,
  fetchAupProjectGroups,
  fetchAupSignatureContext,
  fetchAupSnapshot,
  fetchAupSnapshots,
  fetchAupTemplateById,
  fetchAupTemplates,
  fetchAupTemplateVersions,
  fetchAupTraces,
  fetchExperts,
  fetchPublishedTemplate,
  fetchReviewerConfig,
  fetchReviewItems,
  fetchReviewProgress,
  fetchReviewSessions,
  fetchReviewTodo,
  publishAupTemplate,
  renewAup,
  reorderAupDictItems,
  resolveTemplate,
  restoreAupDemo,
  rollbackAupSnapshot,
  saveAup,
  submitAup,
  submitExpertReview,
  submitFormatReview,
  submitPiReview,
  unlockAup,
  updateAupDict,
  updateAupDictItem,
  updateAupTemplate,
  updateReviewerConfig,
  uploadAupAttachment,
  type AupDictDetail,
  type AupDictListParams,
  type AupListParams,
  type CreateAupResult,
  type CreateDictBody,
  type CreateDictItemBody,
  type CreateTemplateBody,
  type FormatReviewBody,
  type PiReviewBody,
  type PickerType,
  type ReviewItemsParams,
  type ReviewItemsResult,
  type ReviewSessionsResult,
  type ReviewTodoParams,
  type SaveAupResult,
  type StageChangeResult,
  type UpdateDictItemBody,
  type UpdateTemplateBody,
  type TemplateVersionBriefVO,
  type TemplateDetailVO,
} from "../api/aup.api";
import type { AupDetailVO, AupSnapshot, AupSnapshotMeta } from "../schema/aup";
import type { ReviewerConfig, ReviewerConfigRequest, ReviewProgress, VoteRequest } from "../schema/review";

/** 模块级 query keys */
export const aupQueryKeys = {
  all: ["aup"] as const,
  list: (params?: AupListParams) => ["aup", "list", params ?? {}] as const,
  listInfinite: (params?: AupListParams) => ["aup", "list-infinite", params ?? {}] as const,
  projectGroups: () => ["aup", "projectGroups"] as const,
  detail: (id: string) => ["aup", "detail", id] as const,
  snapshots: (id: string) => ["aup", "snapshots", id] as const,
  snapshot: (id: string, snapshotId: number | string) => ["aup", "snapshot", id, snapshotId] as const,
  traces: (id: string) => ["aup", "traces", id] as const,
  printData: (id: string) => ["aup", "printData", id] as const,
  reviewTodo: (params?: ReviewTodoParams) => ["aup", "reviewTodo", params ?? {}] as const,
  reviewProgress: (id: string) => ["aup", "reviewProgress", id] as const,
  reviewItems: (id: string, params?: ReviewItemsParams) => ["aup", "reviewItems", id, params ?? {}] as const,
  reviewSessions: (id: string) => ["aup", "reviewSessions", id] as const,
  experts: () => ["aup", "experts"] as const,
  reviewerConfig: () => ["aup", "reviewerConfig"] as const,
  attachments: (id: string) => ["aup", "attachments", id] as const,
  templates: () => ["aup", "templates"] as const,
  template: (id: number | string) => ["aup", "template", id] as const,
  templateVersions: (id: number | string) => ["aup", "templateVersions", id] as const,
  publishedTemplate: (formKey?: string) => ["aup", "publishedTemplate", formKey] as const,
  dicts: (params?: AupDictListParams) => ["aup", "dicts", params ?? {}] as const,
  dict: (dictKey: string) => ["aup", "dict", dictKey] as const,
  signatureContext: () => ["aup", "signatureContext"] as const,
  myRoles: () => ["aup", "my-roles"] as const,
  pickers: (type: PickerType, params?: Record<string, unknown>) => ["aup", "pickers", type, params ?? {}] as const,
} as const;

/* =====================================================================
 * 列表 / 详情
 * ================================================================== */

export function useAupList(params: AupListParams = {}) {
  return useQuery({
    queryKey: aupQueryKeys.list(params),
    queryFn: () => fetchAupList(params),
  });
}

/**
 * 管理端列表无限滚动：复用 /aup/list 的 1-based 分页接口，
 * 每次滚动到底追加下一页。queryKey 去掉 page 字段，筛选变化时自动重置到第 1 页。
 */
export function useAupListInfinite(filters: Omit<AupListParams, "page"> = {}) {
  return useInfiniteQuery({
    queryKey: aupQueryKeys.listInfinite(filters),
    queryFn: ({ pageParam }) => fetchAupList({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + (p.items?.length ?? 0), 0);
      if (!lastPage.items?.length || loaded >= lastPage.total) return undefined;
      return allPages.length + 1;
    },
  });
}

/** 列表筛选用去重课题组名称 */
export function useAupProjectGroups() {
  return useQuery({
    queryKey: aupQueryKeys.projectGroups(),
    queryFn: () => fetchAupProjectGroups(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAupDetail(id?: string) {
  return useQuery({
    queryKey: aupQueryKeys.detail(id ?? ""),
    queryFn: () => fetchAupDetail(id!),
    enabled: !!id,
  });
}

export function useAupPrintData(id?: string) {
  return useQuery({
    queryKey: aupQueryKeys.printData(id ?? ""),
    queryFn: () => fetchAupPrintData(id!),
    enabled: !!id,
  });
}

export function useAupTraces(id?: string) {
  return useQuery({
    queryKey: aupQueryKeys.traces(id ?? ""),
    queryFn: () => fetchAupTraces(id!),
    enabled: !!id,
  });
}

/* =====================================================================
 * 草稿（乐观锁 + 防抖 autosave）
 * ================================================================== */

export type AutosaveState = "idle" | "saving" | "saved" | "error";

/** 解析草稿 JSON（字符串或对象）为 Record */
function parseDraftData(raw?: string | Record<string, unknown> | null): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw;
}

export function useAupDraft(id?: string) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [version, setVersion] = useState(0);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>("idle");
  const [isDirty, setIsDirty] = useState(false);

  const versionRef = useRef(0);
  const valuesRef = useRef<Record<string, unknown>>({});
  const pendingRef = useRef<Record<string, unknown>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const setDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setIsDirty(v);
  }, []);

  const detail = useQuery<AupDetailVO>({
    queryKey: aupQueryKeys.detail(id ?? ""),
    queryFn: () => fetchAupDetail(id!),
    enabled: !!id,
  });

  // 从 detail 水合初值 + 乐观锁版本
  useEffect(() => {
    if (!detail.data) return;
    const rec = detail.data.record;
    versionRef.current = rec.version ?? 0;
    setVersion(rec.version ?? 0);
    const parsed = parseDraftData(detail.data.draftData);
    valuesRef.current = parsed;
    setValues(parsed);
    setDirty(false);
  }, [detail.data, setDirty]);

  const doSave = useCallback(
    async (viaAutosave: boolean): Promise<SaveAupResult | null> => {
      if (!id) return null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const merged = { ...valuesRef.current, ...pendingRef.current };
      pendingRef.current = {};
      setAutosaveState("saving");
      const payload = { dataJson: JSON.stringify(merged), expectedVersion: versionRef.current };
      try {
        const res = viaAutosave ? await autosaveAup(id, payload) : await saveAup(id, payload);
        versionRef.current = res.version;
        setVersion(res.version);
        valuesRef.current = merged;
        setValues(merged);
        setAutosaveState("saved");
        setDirty(false);
        qc.invalidateQueries({ queryKey: aupQueryKeys.detail(id) });
        return res;
      } catch (e) {
        setAutosaveState("error");
        throw e;
      }
    },
    [id, qc]
  );

  const scheduleAutosave = useCallback(() => {
    if (!id) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void doSave(true).catch((e: Error) => {
        toast.error("自动保存失败：" + e.message);
      });
    }, 800);
  }, [id, doSave]);

  const flushSave = useCallback(() => doSave(false), [doSave]);

  const updateValue = useCallback(
    (fieldKey: string, value: unknown) => {
      pendingRef.current[fieldKey] = value;
      setValues((prev) => {
        const next = { ...prev, [fieldKey]: value };
        valuesRef.current = next;
        return next;
      });
      setDirty(true);
      scheduleAutosave();
    },
    [scheduleAutosave, setDirty]
  );

  const updateValues = useCallback(
    (patch: Record<string, unknown>) => {
      Object.assign(pendingRef.current, patch);
      setValues((prev) => {
        const next = { ...prev, ...patch };
        valuesRef.current = next;
        return next;
      });
      setDirty(true);
      scheduleAutosave();
    },
    [scheduleAutosave, setDirty]
  );

  const saveMutation = useMutation({
    mutationFn: () => flushSave(),
    onSuccess: () => toast.success("已保存"),
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const submitMutation = useMutation({
    mutationFn: async (): Promise<StageChangeResult> => {
      if (!id) throw new Error("缺少计划书 id");
      // 提交前先落盘未保存内容
      await flushSave();
      return submitAup(id);
    },
    onSuccess: () => {
      toast.success("已提交");
      if (id) qc.invalidateQueries({ queryKey: aupQueryKeys.detail(id) });
      qc.invalidateQueries({ queryKey: aupQueryKeys.all });
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });

  return {
    detail,
    values,
    version,
    autosaveState,
    isDirty,
    updateValue,
    updateValues,
    flushSave,
    saveMutation,
    submitMutation,
  };
}

export function useCreateAup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: { templateVersion?: string }): Promise<CreateAupResult> => createAup(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: aupQueryKeys.all }),
    onError: (e: Error) => toast.error(e.message || "创建草稿失败"),
  });
}

/* =====================================================================
 * 快照 / 回退
 * ================================================================== */

export function useAupSnapshots(id?: string) {
  return useQuery<AupSnapshotMeta[]>({
    queryKey: aupQueryKeys.snapshots(id ?? ""),
    queryFn: () => fetchAupSnapshots(id!),
    enabled: !!id,
  });
}

export function useAupSnapshot(id?: string, snapshotId?: number) {
  return useQuery<AupSnapshot>({
    queryKey: aupQueryKeys.snapshot(id ?? "", snapshotId ?? -1),
    queryFn: () => fetchAupSnapshot(id!, snapshotId!),
    enabled: !!id && !!snapshotId,
  });
}

export function useAupRollback(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (snapshotId: number): Promise<StageChangeResult> => {
      if (!id) throw new Error("缺少计划书 id");
      return rollbackAupSnapshot(id, snapshotId);
    },
    onSuccess: () => {
      if (id) qc.invalidateQueries({ queryKey: aupQueryKeys.detail(id) });
      qc.invalidateQueries({ queryKey: aupQueryKeys.all });
    },
    onError: (e: Error) => toast.error(e.message || "回退失败"),
  });
}

/** 恢复单条演示示例到内置种子态 */
export function useRestoreAupDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number): Promise<void> => restoreAupDemo(String(id)),
    onSuccess: () => {
      toast.success("演示示例已恢复");
      qc.invalidateQueries({ queryKey: aupQueryKeys.all });
    },
    onError: (e: Error) => toast.error(e.message || "恢复失败"),
  });
}

/** 删除草稿状态计划书 */
export function useDeleteAup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number): Promise<void> => deleteAup(String(id)),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: aupQueryKeys.all });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

/** 解锁锁定终态计划书（仅管理员） */
export function useUnlockAup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number): Promise<StageChangeResult> => unlockAup(String(id)),
    onSuccess: () => {
      toast.success("已解锁，计划书回到返修状态");
      qc.invalidateQueries({ queryKey: aupQueryKeys.all });
    },
    onError: (e: Error) => toast.error(e.message || "解锁失败"),
  });
}

/* =====================================================================
 * 审查
 * ================================================================== */

export function useReviewTodo(params: ReviewTodoParams) {
  return useQuery({
    queryKey: aupQueryKeys.reviewTodo(params),
    queryFn: () => fetchReviewTodo(params),
  });
}

export function useReviewProgress(id?: string) {
  return useQuery<ReviewProgress>({
    queryKey: aupQueryKeys.reviewProgress(id ?? ""),
    queryFn: () => fetchReviewProgress(id!),
    enabled: !!id,
  });
}

export function useReviewItems(id?: string, params: ReviewItemsParams = {}) {
  return useQuery<ReviewItemsResult>({
    queryKey: aupQueryKeys.reviewItems(id ?? "", params),
    queryFn: () => fetchReviewItems(id!, params),
    enabled: !!id,
  });
}

/** 评审总览：全轮次每次评审记录（含整体同意/拒评/回避等无逐条批注的评审人） */
export function useReviewSessions(id?: string) {
  return useQuery<ReviewSessionsResult>({
    queryKey: aupQueryKeys.reviewSessions(id ?? ""),
    queryFn: () => fetchReviewSessions(id!),
    enabled: !!id,
  });
}

function invalidateReview(id: string | undefined, qc: ReturnType<typeof useQueryClient>) {
  if (id) qc.invalidateQueries({ queryKey: aupQueryKeys.detail(id) });
  qc.invalidateQueries({ queryKey: aupQueryKeys.all });
}

export function useFormatReview(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: FormatReviewBody): Promise<StageChangeResult> => {
      if (!id) throw new Error("缺少计划书 id");
      return submitFormatReview(id, body);
    },
    onSuccess: () => invalidateReview(id, qc),
    onError: (e: Error) => toast.error(e.message || "格式审查失败"),
  });
}

export function usePiReview(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PiReviewBody): Promise<StageChangeResult> => {
      if (!id) throw new Error("缺少计划书 id");
      return submitPiReview(id, body);
    },
    onSuccess: () => invalidateReview(id, qc),
    onError: (e: Error) => toast.error(e.message || "组长审核失败"),
  });
}

export function useExpertReview(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VoteRequest): Promise<StageChangeResult> => {
      if (!id) throw new Error("缺少计划书 id");
      return submitExpertReview(id, body);
    },
    onSuccess: () => invalidateReview(id, qc),
    onError: (e: Error) => toast.error(e.message || "提交投票失败"),
  });
}

export function useExperts(enabled = true) {
  return useQuery({
    queryKey: aupQueryKeys.experts(),
    queryFn: fetchExperts,
    enabled,
  });
}

export function useReviewerConfig() {
  return useQuery<ReviewerConfig>({
    queryKey: aupQueryKeys.reviewerConfig(),
    queryFn: fetchReviewerConfig,
  });
}

export function useUpdateReviewerConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReviewerConfigRequest) => updateReviewerConfig(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aupQueryKeys.reviewerConfig() });
      qc.invalidateQueries({ queryKey: aupQueryKeys.experts() });
      toast.success("名册配置已保存");
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
}

/** 单个计划书的审查上下文（进度 + 逐字段意见 + 组长/格式/专家三处流转） */
export function useAupReview(id?: string) {
  const progressQuery = useReviewProgress(id);
  const itemsQuery = useReviewItems(id);
  const formatReview = useFormatReview(id);
  const expertReview = useExpertReview(id);
  const piReview = usePiReview(id);
  return { progressQuery, itemsQuery, formatReview, expertReview, piReview };
}

/* =====================================================================
 * 附件
 * ================================================================== */

export function useAupAttachments(id?: string) {
  const qc = useQueryClient();

  const listQuery = useQuery({
    queryKey: aupQueryKeys.attachments(id ?? ""),
    queryFn: () => fetchAupAttachments(id!),
    enabled: !!id,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      if (!id) throw new Error("缺少计划书 id");
      return uploadAupAttachment(id, file);
    },
    onSuccess: () => {
      if (id) qc.invalidateQueries({ queryKey: aupQueryKeys.attachments(id) });
    },
    onError: (e: Error) => toast.error(e.message || "上传失败"),
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => {
      if (!id) throw new Error("缺少计划书 id");
      return deleteAupAttachment(id, fileId);
    },
    onSuccess: () => {
      if (id) qc.invalidateQueries({ queryKey: aupQueryKeys.attachments(id) });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const download = useCallback((fileId: number) => {
    return downloadAupAttachment(fileId);
  }, []);

  return { listQuery, uploadMutation, deleteMutation, download };
}

/* =====================================================================
 * 模板
 * ================================================================== */

export function useAupTemplates() {
  return useQuery({
    queryKey: aupQueryKeys.templates(),
    queryFn: fetchAupTemplates,
  });
}

export function usePublishedTemplate(formKey?: string) {
  return useQuery({
    queryKey: aupQueryKeys.publishedTemplate(formKey),
    queryFn: () => fetchPublishedTemplate(formKey!),
    enabled: !!formKey,
    // 未发布返回 null 而非抛错，无需重试；真正失败（网络/5xx）才需要
    retry: false,
  });
}

export function useResolvedTemplate(formKey?: string, version?: string) {
  return useQuery({
    queryKey: ["aup", "resolvedTemplate", formKey, version] as const,
    queryFn: () => resolveTemplate(formKey!, version!),
    enabled: !!formKey && !!version,
  });
}

export function useAupTemplateById(id?: number) {
  return useQuery({
    queryKey: aupQueryKeys.template(id ?? -1),
    queryFn: () => fetchAupTemplateById(id!),
    enabled: !!id,
  });
}

export function useAupTemplateVersions(id?: number) {
  return useQuery({
    queryKey: aupQueryKeys.templateVersions(id ?? -1),
    queryFn: () => fetchAupTemplateVersions(id!),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTemplateBody): Promise<TemplateVersionBriefVO> => createAupTemplate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aupQueryKeys.templates() });
      toast.success("已创建草稿版本");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateTemplateBody }): Promise<TemplateDetailVO> =>
      updateAupTemplate(id, body),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: aupQueryKeys.template(id) });
      toast.success("已保存");
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
}

export function usePublishTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number): Promise<TemplateVersionBriefVO> => publishAupTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: aupQueryKeys.templates() });
      qc.invalidateQueries({ queryKey: aupQueryKeys.publishedTemplate() });
      toast.success("已发布");
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });
}

/** 模板管理上下文（列表 + 新建/保存/发布） */
export function useAupTemplate() {
  const templatesQuery = useAupTemplates();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const publishTemplate = usePublishTemplate();
  return { templatesQuery, createTemplate, updateTemplate, publishTemplate };
}

/* =====================================================================
 * 字典
 * ================================================================== */

export function useAupDicts(params: AupDictListParams = {}) {
  return useQuery({
    queryKey: aupQueryKeys.dicts(params),
    queryFn: () => fetchAupDicts(params),
  });
}

export function useAupDictDetail(dictKey?: string) {
  return useQuery<AupDictDetail>({
    queryKey: aupQueryKeys.dict(dictKey ?? ""),
    queryFn: () => fetchAupDict(dictKey!),
    enabled: !!dictKey,
  });
}

export function useCreateDict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDictBody) => createAupDict(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: aupQueryKeys.dicts() }),
    onError: (e: Error) => toast.error(e.message || "新建字典失败"),
  });
}

export function useUpdateDict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dictKey, name }: { dictKey: string; name: string }) => updateAupDict(dictKey, { name }),
    onSuccess: (_, { dictKey }) => {
      qc.invalidateQueries({ queryKey: aupQueryKeys.dicts() });
      qc.invalidateQueries({ queryKey: aupQueryKeys.dict(dictKey) });
    },
    onError: (e: Error) => toast.error(e.message || "改名失败"),
  });
}

export function useDeleteDict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dictKey: string) => deleteAupDict(dictKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: aupQueryKeys.dicts() }),
    onError: (e: Error) => toast.error(e.message || "删除字典失败"),
  });
}

export function useCreateDictItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dictKey, body }: { dictKey: string; body: CreateDictItemBody }) =>
      createAupDictItem(dictKey, body),
    onSuccess: (_, { dictKey }) => {
      qc.invalidateQueries({ queryKey: aupQueryKeys.dict(dictKey) });
      qc.invalidateQueries({ queryKey: aupQueryKeys.dicts() });
    },
    onError: (e: Error) => toast.error(e.message || "新增项失败"),
  });
}

export function useUpdateDictItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dictKey, itemId, body }: { dictKey: string; itemId: number; body: UpdateDictItemBody }) =>
      updateAupDictItem(dictKey, itemId, body),
    onSuccess: (_, { dictKey }) => qc.invalidateQueries({ queryKey: aupQueryKeys.dict(dictKey) }),
    onError: (e: Error) => toast.error(e.message || "修改项失败"),
  });
}

export function useDeleteDictItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dictKey, itemId }: { dictKey: string; itemId: number }) => deleteAupDictItem(dictKey, itemId),
    onSuccess: (_, { dictKey }) => {
      qc.invalidateQueries({ queryKey: aupQueryKeys.dict(dictKey) });
      qc.invalidateQueries({ queryKey: aupQueryKeys.dicts() });
    },
    onError: (e: Error) => toast.error(e.message || "删除项失败"),
  });
}

export function useReorderDictItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dictKey, itemIds }: { dictKey: string; itemIds: number[] }) =>
      reorderAupDictItems(dictKey, itemIds),
    onSuccess: (_, { dictKey }) => qc.invalidateQueries({ queryKey: aupQueryKeys.dict(dictKey) }),
    onError: (e: Error) => toast.error(e.message || "排序保存失败"),
  });
}

/** 字典管理上下文（列表 + 新建/改名/删除 + 项增删改排序） */
export function useAupDict() {
  const dictsQuery = useAupDicts();
  const createDict = useCreateDict();
  const updateDict = useUpdateDict();
  const deleteDict = useDeleteDict();
  const createDictItem = useCreateDictItem();
  const updateDictItem = useUpdateDictItem();
  const deleteDictItem = useDeleteDictItem();
  const reorderDictItems = useReorderDictItems();
  return {
    dictsQuery,
    createDict,
    updateDict,
    deleteDict,
    createDictItem,
    updateDictItem,
    deleteDictItem,
    reorderDictItems,
  };
}

/* =====================================================================
 * 其他（签名 / 选择器 / 通知）
 * ================================================================== */

export function useAupSignatureContext() {
  return useQuery({
    queryKey: aupQueryKeys.signatureContext(),
    queryFn: fetchAupSignatureContext,
  });
}

/** 当前登录用户的 AUP 角色（组长/秘书/专家），一次性拉取 */
export function useAupMyRoles() {
  return useQuery({
    queryKey: aupQueryKeys.myRoles(),
    queryFn: fetchAupMyRoles,
    staleTime: Infinity,
    retry: false,
  });
}

/** 续期（expired → 新建 draft 草稿） */
export function useRenewAup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number): Promise<CreateAupResult> => renewAup(String(id)),
    onSuccess: () => {
      toast.success("已发起续期，请到新草稿继续填写");
      qc.invalidateQueries({ queryKey: aupQueryKeys.all });
    },
    onError: (e: Error) => toast.error(e.message || "续期失败"),
  });
}

export function useAupPickers(type: PickerType, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: aupQueryKeys.pickers(type, params),
    queryFn: () => fetchAupPickers(type, params),
    enabled: !!type,
  });
}
