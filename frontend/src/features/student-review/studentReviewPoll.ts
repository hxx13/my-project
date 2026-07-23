/** 学生审核页待审列表轮询间隔（物资待审 + 延迟免冻结） */
export const STUDENT_REVIEW_PENDING_POLL_MS = 15_000;

export const studentReviewPendingQueryOptions = {
  staleTime: 0,
  refetchInterval: STUDENT_REVIEW_PENDING_POLL_MS,
  refetchIntervalInBackground: true,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
};
