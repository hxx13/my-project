// hooks/useReportFill.ts — fetch-or-create, 块级防抖保存, 周期同步
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchFormById } from '../api/reportForm.api';
import { parseLayoutJson } from '../components/FormGridRenderer';
import { sanitizeFieldValuesForSave, sanitizeFieldValuesForDisplay } from '../utils/reportFormFieldValue';
import { normalizeBlocks, BLOCKS_KEY, findBlock, mergeChangedFields } from '../utils/reportFormBlocks';
import {
  fetchMySubmission,
  saveMySubmission,
  submitMySubmission,
  addFormBlock,
  saveFormBlock,
  deleteFormBlock,
} from '../api/reportFill.api';
import type { FormBlock, ReportFormDefinition, ReportFormSubmission } from '../types';
import toast from 'react-hot-toast';

function readRepeatable(form: ReportFormDefinition | undefined): boolean {
  if (!form) return false;
  const raw = form.fillPolicyJson as unknown;
  const policy = typeof raw === 'string'
    ? (() => { try { return JSON.parse(raw); } catch { return {}; } })()
    : (raw as Record<string, unknown> | undefined);
  return !!(policy as Record<string, unknown> | undefined)?.repeatable;
}

export function useReportFill(formId: number, submissionId?: number) {
  const queryClient = useQueryClient();
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  /** 待保存的块：blockId → 该块最新 values（整块覆盖，不是增量） */
  const pendingRef = useRef<Record<string, Record<string, unknown>>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submissionRef = useRef<ReportFormSubmission | null>(null);
  const blocksRef = useRef<FormBlock[]>([]);

  const invalidateFillLists = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['report-fill-available'] });
    queryClient.invalidateQueries({ queryKey: ['report-fill-submissions', formId] });
    queryClient.invalidateQueries({ queryKey: ['report-fill-my-submissions', formId] });
    queryClient.invalidateQueries({ queryKey: ['report-fill-publisher-overview', formId] });
  }, [queryClient, formId]);

  const { data: form, isLoading: formLoading } = useQuery<ReportFormDefinition>({
    queryKey: ['report-fill-form', formId],
    queryFn: () => fetchFormById(formId),
    enabled: !!formId,
  });

  const { data: submission, isLoading: subLoading, refetch } = useQuery<ReportFormSubmission>({
    queryKey: ['report-fill-submission', formId, submissionId ?? 'default'],
    queryFn: () => fetchMySubmission(formId, submissionId),
    enabled: !!formId,
  });

  const repeatable = readRepeatable(form);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  useEffect(() => {
    if (!submission) return;
    submissionRef.current = submission;
    // 有未保存内容时不要把本地覆盖掉
    if (Object.keys(pendingRef.current).length > 0) return;
    const layout = form?.layoutJson ? parseLayoutJson(form.layoutJson) : null;
    const next = normalizeBlocks(submission.fieldValuesJson).map(b => ({
      ...b,
      values: sanitizeFieldValuesForDisplay(layout?.fields, b.values),
    }));
    setBlocks(next);
  }, [submission, form?.layoutJson]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (Object.keys(pendingRef.current).length === 0) refetch();
    }, 5000);
    return () => clearInterval(iv);
  }, [refetch]);

  const sanitize = useCallback((values: Record<string, unknown>) => {
    const layout = form?.layoutJson ? parseLayoutJson(form.layoutJson) : null;
    return sanitizeFieldValuesForSave(layout?.fields, values);
  }, [form?.layoutJson]);

  /** 非重复表单：整份保存（走旧接口，保持既有行为） */
  const saveWholeSubmission = useCallback(async (values: Record<string, unknown>) => {
    const sub = submissionRef.current;
    const saved = await saveMySubmission(formId, {
      submissionId: submissionId ?? sub?.id,
      fieldValuesJson: JSON.stringify(sanitize(values)),
      expectedVersion: sub?.version ?? 0,
    });
    submissionRef.current = saved;
    return saved;
  }, [formId, submissionId, sanitize]);

  const flushPending = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = { ...pendingRef.current };
    pendingRef.current = {};
    const ids = Object.keys(pending);
    if (ids.length === 0) return;

    const sid = submissionRef.current?.id ?? submissionId;
    if (!repeatable || !sid) {
      // 非重复表单：把第一块的 values 整份提交
      const merged = { ...blocksRef.current[0]?.values, ...pending[ids[0]] };
      await saveWholeSubmission(merged);
      invalidateFillLists();
      return;
    }

    try {
      for (const blockId of ids) {
        const local = blocksRef.current.find(b => b.id === blockId);
        const changedKeys = Object.keys(pending[blockId]);
        const payload = { ...local?.values, ...pending[blockId] };

        let saved;
        try {
          saved = await saveFormBlock(formId, sid, blockId, {
            values: sanitize(payload),
            expectedVersion: local?.version ?? 0,
          });
        } catch (e) {
          // 同表被他人改过 → 拉最新版本，只重放"我改过的字段"，再存一次（字段级 last-write-wins）
          const fresh = await fetchMySubmission(formId, sid);
          const freshBlock = findBlock(normalizeBlocks(fresh.fieldValuesJson), blockId);
          if (!freshBlock) throw e;
          saved = await saveFormBlock(formId, sid, blockId, {
            values: sanitize(mergeChangedFields(freshBlock.values, pending[blockId], changedKeys)),
            expectedVersion: freshBlock.version,
          });
        }

        // 服务端值打底（含 AUTO_USER 注入），再盖回保存期间用户新改的字段，避免 UI 闪回旧值
        const stillPending = pendingRef.current[blockId] ?? {};
        setBlocks(prev => prev.map(b => (b.id === blockId
          ? { ...b, version: saved.version, values: { ...saved.values, ...stillPending } }
          : b)));
      }
      invalidateFillLists();
    } catch (e) {
      // 失败回填待保存，避免丢输入
      for (const blockId of ids) {
        pendingRef.current[blockId] = { ...pending[blockId] };
      }
      throw e;
    }
  }, [formId, submissionId, repeatable, sanitize, saveWholeSubmission, invalidateFillLists]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      flushPending().catch((e: Error) => toast.error('自动保存失败: ' + e.message));
    }, 600);
  }, [flushPending]);

  const updateValue = useCallback((blockId: string, fieldKey: string, value: unknown) => {
    pendingRef.current[blockId] = { ...(pendingRef.current[blockId] ?? {}), [fieldKey]: value };
    setBlocks(prev => prev.map(b => (b.id === blockId
      ? { ...b, values: { ...b.values, [fieldKey]: value } }
      : b)));
    scheduleSave();
  }, [scheduleSave]);

  const addBlock = useCallback(async () => {
    const sid = submissionRef.current?.id ?? submissionId;
    if (!sid) return null;
    try {
      await flushPending();
      const created = await addFormBlock(formId, sid);
      setBlocks(prev => [...prev, { id: created.id, version: created.version, values: created.values }]);
      toast.success('已添加一张表格');
      return created;
    } catch (e) {
      toast.error('添加失败: ' + (e as Error).message);
      return null;
    }
  }, [formId, submissionId, flushPending]);

  const removeBlock = useCallback(async (blockId: string) => {
    const sid = submissionRef.current?.id ?? submissionId;
    if (!sid) return false;
    try {
      await flushPending();
      await deleteFormBlock(formId, sid, blockId);
      delete pendingRef.current[blockId];
      setBlocks(prev => prev.filter(b => b.id !== blockId));
      toast.success('已删除该表格');
      return true;
    } catch (e) {
      toast.error('删除失败: ' + (e as Error).message);
      return false;
    }
  }, [formId, submissionId, flushPending]);

  const submitMut = useMutation({
    mutationFn: async () => {
      await flushPending();
      const sid = submissionId ?? submissionRef.current?.id;
      return submitMySubmission(formId, sid);
    },
    onSuccess: () => {
      toast.success('已提交');
      refetch();
      invalidateFillLists();
    },
    onError: (e: Error) => toast.error('提交失败: ' + e.message),
  });

  const flushSave = useCallback(async (): Promise<void> => {
    await flushPending();
  }, [flushPending]);

  const flushSaveForExport = useCallback(async (): Promise<Record<string, unknown>> => {
    await flushPending();
    // 返回整块结构：Word 导出会把这份值当 override 传给后端，只给第一块的扁平值会丢掉第 2..N 张表
    return {
      [BLOCKS_KEY]: blocksRef.current.map(b => ({ id: b.id, version: b.version, values: b.values })),
    };
  }, [flushPending]);

  return {
    form,
    submission,
    blocks,
    repeatable,
    formLoading,
    subLoading,
    updateValue,
    addBlock,
    removeBlock,
    submitMut,
    flushSave,
    flushSaveForExport,
  };
}
