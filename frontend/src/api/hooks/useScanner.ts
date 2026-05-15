import { useMutation, useQuery } from "@tanstack/react-query";
import {
    analyzeScan,
    executeAccess,
    type ExecuteResult,
    fetchAllRoomCardStatus,
    fetchUserStatus,
    updateUserState,
} from "@/api/domains/scanner.api";
import type { AnalyzeResponse, ExecutePayload, RoomCardStatus, UserStatusResponse } from "@/api/types/scanner";

export const scannerQueryKeys = {
    userStatus: (userId: string) => ["userStatus", userId] as const,
    roomCardStatus: () => ["roomCardStatus"] as const,
};

export const useAnalyzeScanMutation = (options?: {
    onSuccess?: (data: AnalyzeResponse) => void;
    onError?: (error: Error) => void;
}) =>
    useMutation({
        mutationFn: analyzeScan,
        onSuccess: options?.onSuccess,
        onError: options?.onError,
    });

export const useExecuteAccessMutation = (options?: {
    onSuccess?: (data: ExecuteResult) => void;
    onError?: (error: Error) => void;
}) =>
    useMutation({
        mutationFn: (payload: ExecutePayload) => executeAccess(payload),
        onSuccess: options?.onSuccess,
        onError: options?.onError,
    });

export const useUpdateUserStateMutation = () => useMutation({
    mutationFn: ({ userId, valid }: { userId: string; valid: boolean }) =>
        updateUserState(userId, valid),
});

export const useUserStatusQuery = (userId?: string) =>
    useQuery({
        queryKey: scannerQueryKeys.userStatus(userId ?? ""),
        queryFn: () => fetchUserStatus(userId as string),
        enabled: Boolean(userId),
        staleTime: 5 * 60 * 1000,
        select: (data): UserStatusResponse => {
            const records = Array.isArray(data?.userDisciplinaryRecords) ? data.userDisciplinaryRecords : [];
            const allowedRooms = Array.isArray(data?.allowedRooms) ? data.allowedRooms : [];
            return {
                ...(data ?? { state: 0 }),
                state: Number(data?.state ?? 0),
                userDisciplinaryRecords: records,
                allowedRooms,
            };
        },
        initialData: {
            state: 0,
            userDisciplinaryRecords: [],
            allowedRooms: [],
        },
    });

export const useAllRoomCardStatusQuery = () =>
    useQuery({
        queryKey: scannerQueryKeys.roomCardStatus(),
        queryFn: fetchAllRoomCardStatus,
        select: (data): RoomCardStatus[] => (Array.isArray(data) ? data : []),
        initialData: [],
    });
