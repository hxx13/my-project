// hooks/useReportFill.ts — fetch-or-create, debounce auto-save, periodic sync
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchFormById } from '../api/reportForm.api';
import {
  fetchMySubmission,
  saveMySubmission,
  submitMySubmission,
} from '../api/reportFill.api';
import type { ReportFormDefinition, ReportFormSubmission } from '../types';
import toast from 'react-hot-toast';

export function useReportFill(formId: number) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const pendingRef = useRef<Record<string, unknown>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const submissionRef = useRef<ReportFormSubmission | null>(null);

  // Fetch form definition
  const { data: form, isLoading: formLoading } = useQuery<ReportFormDefinition>({
    queryKey: ['report-fill-form', formId],
    queryFn: () => fetchFormById(formId),
    enabled: !!formId,
  });

  // Fetch or create submission
  const { data: submission, isLoading: subLoading, refetch } = useQuery<ReportFormSubmission>({
    queryKey: ['report-fill-submission', formId],
    queryFn: () => fetchMySubmission(formId),
    enabled: !!formId,
  });

  // Sync submission ref
  useEffect(() => {
    if (submission) {
      submissionRef.current = submission;
      // Only set values if not currently editing (avoid overwriting local changes)
      const pendingKeys = Object.keys(pendingRef.current);
      if (pendingKeys.length === 0) {
        setValues(submission.fieldValuesJson || {});
      }
    }
  }, [submission]);

  // Periodic sync (every 5s)
  useEffect(() => {
    const iv = setInterval(() => {
      if (pendingRef.current && Object.keys(pendingRef.current).length === 0) {
        refetch();
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [refetch]);

  // Debounced save (600ms)
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const pending = { ...pendingRef.current };
      pendingRef.current = {};
      const keys = Object.keys(pending);
      if (keys.length === 0) return;

      const sub = submissionRef.current;
      const fieldValues = { ...values, ...pending };
      try {
        const saved = await saveMySubmission(formId, {
          fieldValuesJson: JSON.stringify(fieldValues),
          expectedVersion: sub?.version ?? 0,
        });
        submissionRef.current = saved;
      } catch (e) {
        // Restore pending changes on failure
        Object.assign(pendingRef.current, pending);
        toast.error('自动保存失败: ' + (e as Error).message);
      }
    }, 600);
  }, [formId, values]);

  // Update a field value
  const updateValue = useCallback((fieldKey: string, value: unknown) => {
    pendingRef.current[fieldKey] = value;
    setValues(prev => ({ ...prev, [fieldKey]: value }));
    scheduleSave();
  }, [scheduleSave]);

  // Submit
  const submitMut = useMutation({
    mutationFn: () => submitMySubmission(formId),
    onSuccess: () => {
      toast.success('已提交');
      refetch();
    },
    onError: (e: Error) => toast.error('提交失败: ' + e.message),
  });

  // Flush pending saves immediately
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const pending = { ...pendingRef.current };
    pendingRef.current = {};
    const keys = Object.keys(pending);
    if (keys.length === 0) return;
    const sub = submissionRef.current;
    const fieldValues = { ...values, ...pending };
    try {
      const saved = await saveMySubmission(formId, {
        fieldValuesJson: JSON.stringify(fieldValues),
        expectedVersion: sub?.version ?? 0,
      });
      submissionRef.current = saved;
    } catch (e) {
      Object.assign(pendingRef.current, pending);
    }
  }, [formId, values]);

  return {
    form,
    submission,
    values,
    formLoading,
    subLoading,
    updateValue,
    submitMut,
    flushSave,
  };
}
