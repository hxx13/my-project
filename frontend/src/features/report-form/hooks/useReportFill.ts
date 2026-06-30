// hooks/useReportFill.ts — fetch-or-create, debounce auto-save, periodic sync
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchFormById } from '../api/reportForm.api';
import { parseLayoutJson } from '../components/FormGridRenderer';
import { sanitizeFieldValuesForSave, sanitizeFieldValuesForDisplay } from '../utils/reportFormFieldValue';
import {
  fetchMySubmission,
  saveMySubmission,
  submitMySubmission,
} from '../api/reportFill.api';
import type { ReportFormDefinition, ReportFormSubmission } from '../types';
import toast from 'react-hot-toast';

export function useReportFill(formId: number, submissionId?: number) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const pendingRef = useRef<Record<string, unknown>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submissionRef = useRef<ReportFormSubmission | null>(null);
  const valuesRef = useRef<Record<string, unknown>>({});

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

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (submission) {
      submissionRef.current = submission;
      let parsed: Record<string, unknown> = {};
      const raw = submission.fieldValuesJson;
      if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch { parsed = {}; }
      } else if (raw && typeof raw === 'object') {
        parsed = raw as Record<string, unknown>;
      }
      const pendingKeys = Object.keys(pendingRef.current);
      if (pendingKeys.length === 0) {
        const layout = form?.layoutJson ? parseLayoutJson(form.layoutJson) : null;
        setValues(sanitizeFieldValuesForDisplay(layout?.fields, parsed));
      }
    }
  }, [submission, form?.layoutJson]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (pendingRef.current && Object.keys(pendingRef.current).length === 0) {
        refetch();
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [refetch]);

  const buildSavePayload = useCallback((fieldValues: Record<string, unknown>) => {
    const sub = submissionRef.current;
    const sid = submissionId ?? sub?.id;
    const layout = form?.layoutJson ? parseLayoutJson(form.layoutJson) : null;
    const sanitized = sanitizeFieldValuesForSave(layout?.fields, fieldValues);
    return {
      submissionId: sid,
      fieldValuesJson: JSON.stringify(sanitized),
      expectedVersion: sub?.version ?? 0,
    };
  }, [submissionId, form?.layoutJson]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const pending = { ...pendingRef.current };
      pendingRef.current = {};
      const keys = Object.keys(pending);
      if (keys.length === 0) return;

      const fieldValues = { ...values, ...pending };
      try {
        const saved = await saveMySubmission(formId, buildSavePayload(fieldValues));
        submissionRef.current = saved;
        invalidateFillLists();
      } catch (e) {
        Object.assign(pendingRef.current, pending);
        toast.error('自动保存失败: ' + (e as Error).message);
      }
    }, 600);
  }, [formId, values, buildSavePayload, invalidateFillLists]);

  const updateValue = useCallback((fieldKey: string, value: unknown) => {
    pendingRef.current[fieldKey] = value;
    setValues(prev => ({ ...prev, [fieldKey]: value }));
    scheduleSave();
  }, [scheduleSave]);

  const submitMut = useMutation({
    mutationFn: async () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const pending = { ...pendingRef.current };
      pendingRef.current = {};
      const sub = submissionRef.current;
      const fieldValues = { ...values, ...pending };
      if (Object.keys(pending).length > 0 || Object.keys(fieldValues).length > 0) {
        const saved = await saveMySubmission(formId, buildSavePayload(fieldValues));
        submissionRef.current = saved;
        setValues(fieldValues);
      }
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

  const flushSave = useCallback(async (): Promise<ReportFormSubmission | null> => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const pending = { ...pendingRef.current };
    pendingRef.current = {};
    const fieldValues = { ...valuesRef.current, ...pending };
    try {
      const saved = await saveMySubmission(formId, buildSavePayload(fieldValues));
      submissionRef.current = saved;
      setValues(fieldValues);
      invalidateFillLists();
      return saved;
    } catch (e) {
      Object.assign(pendingRef.current, pending);
      throw e;
    }
  }, [formId, buildSavePayload, invalidateFillLists]);

  const flushSaveForExport = useCallback(async (): Promise<Record<string, unknown>> => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const pending = { ...pendingRef.current };
    pendingRef.current = {};
    const fieldValues = { ...valuesRef.current, ...pending };
    const saved = await saveMySubmission(formId, buildSavePayload(fieldValues));
    submissionRef.current = saved;
    setValues(fieldValues);
    invalidateFillLists();
    return fieldValues;
  }, [formId, buildSavePayload, invalidateFillLists]);

  return {
    form,
    submission,
    values,
    formLoading,
    subLoading,
    updateValue,
    submitMut,
    flushSave,
    flushSaveForExport,
  };
}
