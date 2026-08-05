import { useState, useCallback } from "react";
import { HelpCircle, MessageSquare, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useFaqGroups,
  useFeedbackTickets,
  useCreateFeedbackTicket,
} from "../hooks/use-student-feedback";
import {
  Tabs,
  FaqAccordion,
  FeedbackForm,
  StudentCard,
  Badge,
  StudentInput,
  EmptyState,
  ErrorRetry,
  Skeleton,
  StudentButton,
} from "../components/ui";
import { AdminPageShell } from "@/components/admin/AdminPageShell";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<string, "default" | "success" | "warning"> = {
  pending: "warning",
  replied: "success",
  closed: "default",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  replied: "已回复",
  closed: "已关闭",
};

/* ------------------------------------------------------------------ */
/*  Loading skeletons                                                    */
/* ------------------------------------------------------------------ */

function FaqSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, gi) => (
        <div key={gi}>
          <Skeleton className="h-5 w-24 mb-2" />
          <div className="divide-y divide-[var(--student-hairline)]">
            {Array.from({ length: 3 }).map((_, ii) => (
              <div
                key={ii}
                className="flex items-center justify-between py-3"
              >
                <Skeleton className="h-4 w-3/4" />
                <Skeleton variant="circular" className="size-4 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TicketsSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-2 border-b border-[var(--student-hairline)] last:border-b-0"
        >
          <Skeleton variant="rectangular" className="h-5 w-14 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-20 shrink-0" />
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function StudentFeedbackPage() {
  /* ---- Local state ---- */
  const [activeTab, setActiveTab] = useState("faq");
  const [search, setSearch] = useState("");
  const [ticketPage, setTicketPage] = useState(1);

  /* ---- Queries & mutation ---- */
  const {
    data: faqGroups,
    isLoading: faqLoading,
    isError: faqError,
    error: faqErr,
    refetch: refetchFaq,
  } = useFaqGroups();

  const {
    data: ticketData,
    isLoading: ticketsLoading,
    isError: ticketsError,
    error: ticketsErr,
    refetch: refetchTickets,
  } = useFeedbackTickets(ticketPage, PAGE_SIZE);

  const createMutation = useCreateFeedbackTicket();

  /* ---- Derived data ---- */
  const tickets = ticketData?.data ?? [];
  const total = ticketData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /* ---- Handlers ---- */
  const handleSubmit = useCallback(
    async (data: { subject: string; content: string; type: string }) => {
      await createMutation.mutateAsync(data);
      setTicketPage(1);
    },
    [createMutation.mutateAsync],
  );

  /* ---- Render: FAQ tab ---- */
  const renderFaqTab = () => {
    if (faqLoading) {
      return (
        <StudentCard>
          <FaqSkeleton />
        </StudentCard>
      );
    }

    if (faqError) {
      return (
        <ErrorRetry
          message={faqErr instanceof Error ? faqErr.message : "加载 FAQ 失败"}
          onRetry={() => refetchFaq()}
        />
      );
    }

    const groups = faqGroups ?? [];

    if (groups.length === 0) {
      return (
        <EmptyState
          icon={HelpCircle}
          title="暂无常见问题"
          description="当前没有可用的常见问题"
        />
      );
    }

    return (
      <>
        <StudentInput
          placeholder="搜索问题..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4"
        />
        <StudentCard>
          <FaqAccordion groups={groups} searchQuery={search} />
        </StudentCard>
      </>
    );
  };

  /* ---- Render: Tickets tab ---- */
  const renderTicketsTab = () => {
    return (
      <>
        {/* Feedback form */}
        <StudentCard>
          <h3 className="text-sm font-semibold mb-3">提交留言</h3>
          <FeedbackForm
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
          />
        </StudentCard>

        {/* Ticket list */}
        <StudentCard>
          <h3 className="text-sm font-semibold mb-3">我的留言记录</h3>

          {ticketsLoading ? (
            <TicketsSkeleton />
          ) : ticketsError ? (
            <ErrorRetry
              message={
                ticketsErr instanceof Error
                  ? ticketsErr.message
                  : "加载留言记录失败"
              }
              onRetry={() => refetchTickets()}
            />
          ) : tickets.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="暂无留言记录"
              description="你还没有提交过留言"
            />
          ) : (
            <>
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center gap-3 py-2 border-b border-[var(--student-hairline)] last:border-b-0"
                >
                  <Badge
                    variant={STATUS_VARIANT[ticket.status] ?? "default"}
                  >
                    {STATUS_LABEL[ticket.status] ?? ticket.status}
                  </Badge>
                  <span className="flex-1 text-sm truncate">
                    {ticket.subject}
                  </span>
                  <span className="text-xs text-[var(--student-mute)] shrink-0">
                    {ticket.createdAt}
                  </span>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-[var(--student-hairline)]">
                  <StudentButton
                    variant="ghost"
                    size="sm"
                    disabled={ticketPage <= 1}
                    onClick={() => setTicketPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    上一页
                  </StudentButton>
                  <span className="text-sm text-[var(--student-body)]">
                    {ticketPage} / {totalPages}
                  </span>
                  <StudentButton
                    variant="ghost"
                    size="sm"
                    disabled={ticketPage >= totalPages}
                    onClick={() =>
                      setTicketPage((p) => Math.min(totalPages, p + 1))
                    }
                  >
                    下一页
                    <ChevronRight className="size-4" />
                  </StudentButton>
                </div>
              )}
            </>
          )}
        </StudentCard>
      </>
    );
  };

  return (
    <AdminPageShell>
      <div className="min-h-full">
      {/* Tabs */}
      <Tabs
        variant="pills"
        tabs={[
          { id: "faq", label: "常见问题" },
          { id: "tickets", label: "我的留言" },
        ]}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* FAQ Tab */}
      {activeTab === "faq" && <div className="mt-4">{renderFaqTab()}</div>}

      {/* Tickets Tab */}
      {activeTab === "tickets" && (
        <div className="mt-4 flex flex-col gap-4">{renderTicketsTab()}</div>
      )}
      </div>
    </AdminPageShell>
  );
}
