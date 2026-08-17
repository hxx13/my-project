import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";
import {
  fetchAdminPersonnel,
  fetchSystemOnlyUsers,
  fetchUnifiedPersonnel,
  fetchPersonnelRooms,
  updateUserRole,
  updateUserStatus,
  resetUserPassword,
  resetUserOpenId,
  updateUserDisplayNickname,
  createSystemStaffUser,
  deleteSystemUser,
  viewUserPassword,
  resetPersonnelAccount,
  resetPersonnelPassword,
} from "@/api/domains/admin.api";
import type { UnifiedPersonnelFilter } from "@/api/domains/admin.api";
import { toast } from "react-hot-toast";

export function usePersonnelList(page = 1, size = 20, keyword = "") {
  return useQuery({
    queryKey: queryKeys.personnel.list({ page, size, keyword }),
    queryFn: () => fetchAdminPersonnel(page, size, keyword),
    placeholderData: (prev) => prev,
  });
}

export function useSystemUsersList(page = 1, size = 20, keyword = "") {
  return useQuery({
    queryKey: [...queryKeys.personnel.all, "systemOnly", page, size, keyword] as const,
    queryFn: () => fetchSystemOnlyUsers(page, size, keyword),
    placeholderData: (prev) => prev,
  });
}

export function useUnifiedPersonnel(
  page = 1,
  size = 20,
  filter: UnifiedPersonnelFilter = {}
) {
  return useQuery({
    queryKey: [...queryKeys.personnel.all, "unified", page, size, filter] as const,
    queryFn: () => fetchUnifiedPersonnel(page, size, filter),
    placeholderData: (prev) => prev,
  });
}

export function usePersonnelRooms() {
  return useQuery({
    queryKey: [...queryKeys.personnel.all, "rooms"] as const,
    queryFn: fetchPersonnelRooms,
    staleTime: 60_000,
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => updateUserRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
      toast.success("角色已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useUpdateUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => updateUserStatus(id, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
      toast.success("状态已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: resetUserPassword,
    onSuccess: () => toast.success("密码已重置"),
    onError: (e: Error) => toast.error(e.message || "重置失败"),
  });
}

export function useResetUserOpenId() {
  return useMutation({
    mutationFn: resetUserOpenId,
    onSuccess: () => toast.success("OpenID 已重置"),
    onError: (e: Error) => toast.error(e.message || "重置失败"),
  });
}

export function useUpdateUserNickname() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, displayNickname }: { id: string; displayNickname: string }) =>
      updateUserDisplayNickname(id, displayNickname),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
      toast.success("昵称已更新");
    },
    onError: (e: Error) => toast.error(e.message || "更新失败"),
  });
}

export function useCreateStaffUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSystemStaffUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
      toast.success("账号已创建");
    },
    onError: (e: Error) => toast.error(e.message || "创建失败"),
  });
}

export function useDeleteSystemUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSystemUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
      toast.success("账号已删除");
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });
}

export function useResetPersonnelAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, newUsername }: { userId: string; newUsername: string }) =>
      resetPersonnelAccount(userId, newUsername),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.personnel.all });
      toast.success(`账号已重置为 ${data.newUsername}`);
    },
    onError: (e: Error) => toast.error(e.message || "重置失败"),
  });
}

export function useResetPersonnelPassword() {
  return useMutation({
    mutationFn: (userId: string) => resetPersonnelPassword(userId),
    onSuccess: (data) => {
      toast.success(`密码已重置为: ${data.defaultPassword}`, { duration: 15000 });
    },
    onError: (e: Error) => toast.error(e.message || "重置失败"),
  });
}
