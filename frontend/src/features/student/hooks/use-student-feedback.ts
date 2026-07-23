import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchFaqGroups,
  fetchFeedbackTickets,
  createFeedbackTicket,
} from "../api/student.api";
import type {
  FaqGroup,
  FeedbackTicketData,
  CreateFeedbackTicketBody,
} from "../api/student.api";
import { getStudentSessionScope, studentQueryKey } from "../utils/studentQueryScope";

/**
 * 获取常见问题分组
 *
 * staleTime 设为 10 分钟，FAQ 内容变化频率很低。
 */
export function useFaqGroups() {
  const scope = getStudentSessionScope();
  return useQuery<FaqGroup[]>({
    queryKey: studentQueryKey("faq"),
    queryFn: fetchFaqGroups,
    enabled: scope !== "anonymous",
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}

/**
 * 获取反馈工单列表
 *
 * staleTime 设为 1 分钟。
 */
export function useFeedbackTickets(page: number = 1, size: number = 10) {
  const scope = getStudentSessionScope();
  return useQuery<{ data: FeedbackTicketData[]; total: number }>({
    queryKey: studentQueryKey("feedback", "tickets", { page, size }),
    queryFn: () => fetchFeedbackTickets(page, size),
    enabled: scope !== "anonymous",
    staleTime: 60 * 1000,
    retry: 1,
  });
}

/**
 * 创建反馈工单
 *
 * 成功后自动刷新工单列表缓存。
 */
export function useCreateFeedbackTicket() {
  const queryClient = useQueryClient();

  return useMutation<FeedbackTicketData, Error, CreateFeedbackTicketBody>({
    mutationFn: (data: CreateFeedbackTicketBody) => createFeedbackTicket(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student", "feedback", "tickets"] });
    },
  });
}
