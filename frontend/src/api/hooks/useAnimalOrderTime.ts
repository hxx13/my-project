import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  createHoliday,
  deleteHoliday,
  fetchHolidays,
  fetchTimePolicyAdmin,
  fetchTimePolicySummary,
  importHolidays,
  saveTimePolicyAdmin,
  syncHolidaysCdn,
  type AnimalOrderHoliday,
  type AnimalOrderTimePolicyAdmin,
} from "@/api/domains/animalOrderTime.api";
import { queryKeys } from "./queryKeys";

export function useAnimalOrderTimePolicy(categoryKey?: string) {
  return useQuery({
    queryKey: queryKeys.animalOrderTime.summary(categoryKey),
    queryFn: () => fetchTimePolicySummary({ categoryKey }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useAnimalOrderTimePolicyAdmin() {
  return useQuery({
    queryKey: queryKeys.animalOrderTime.admin,
    queryFn: fetchTimePolicyAdmin,
  });
}

export function useSaveAnimalOrderTimePolicyAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AnimalOrderTimePolicyAdmin) => saveTimePolicyAdmin(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.all });
      toast.success("时间策略已保存");
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
}

export function useAnimalOrderHolidays(year: number) {
  return useQuery({
    queryKey: queryKeys.animalOrderTime.holidays(year),
    queryFn: () => fetchHolidays(year),
    enabled: Number.isFinite(year) && year > 0,
  });
}

export function useCreateAnimalOrderHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AnimalOrderHoliday) => createHoliday(body),
    onSuccess: (_data, body) => {
      const year = new Date(body.holidayDate).getFullYear();
      if (Number.isFinite(year)) {
        qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.holidays(year) });
      }
      qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.all });
      toast.success("节假日已保存");
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });
}

export function useDeleteAnimalOrderHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, year }: { id: number; year: number }) => deleteHoliday(id),
    onSuccess: (_data, { year }) => {
      qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.holidays(year) });
      qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.all });
      toast.success("节假日已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useImportAnimalOrderHolidays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => importHolidays(file),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.holidays(result.year) });
      qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.all });
      toast.success(`已导入 ${result.upserted} 条节假日`);
    },
    onError: (e: Error) => toast.error(e.message || "导入失败"),
  });
}

export function useSyncAnimalOrderHolidaysCdn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year?: number) => syncHolidaysCdn(year),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.holidays(result.year) });
      qc.invalidateQueries({ queryKey: queryKeys.animalOrderTime.all });
      toast.success(`已同步 ${result.upserted} 条节假日`);
    },
    onError: (e: Error) => toast.error(e.message || "同步失败"),
  });
}
