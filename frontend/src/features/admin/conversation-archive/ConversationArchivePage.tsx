import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Search,
  User,
  UserPlus,
  MessageSquare,
  Trash2,
  Bot,
  ArrowLeftRight,
  Loader2,
  Circle,
  Clock,
  Hash,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Play,
  Sparkles,
  X,
  Volume2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchArchiveUsers,
  fetchUserConversation,
  clearUserConversation,
  searchPersonnel,
  enrollUser,
  generateUserConversation,
  streamGenerateBatch,
  type ArchiveUser,
  type ConversationView,
  type PersonnelHit,
  type BatchStreamEvent,
  type BatchDoneEvent,
} from "@/api/domains/conversationArchive.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
import { useTtsAudio } from "@/hooks/useTtsAudio";
import { useSpeechPregen } from "@/hooks/useSpeechPregen";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { appConfirm } from "@/lib/appDialog";
/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function relativeTime(raw?: string): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return formatDateTimeAsiaShanghaiShort(raw);
}

function usageSourceLabel(source?: string): string {
  if (source === "click") return "载体点击";
  if (source === "auto") return "自动展示";
  return source ?? "—";
}

function roleLabel(role: string): string {
  switch (role) {
    case "system":
      return "系统";
    case "user":
      return "用户";
    case "assistant":
      return "助手";
    default:
      return role;
  }
}

function roleIcon(role: string) {
  if (role === "system") return <Hash className="h-3.5 w-3.5" />;
  if (role === "user") return <User className="h-3.5 w-3.5" />;
  return <Bot className="h-3.5 w-3.5" />;
}

const USERS_QUERY_KEY = ["conversationArchiveUsers"] as const;
const CONVERSATION_QUERY_KEY_PREFIX = "conversationArchiveConv" as const;

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function ConversationArchivePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);

  /* ---- add-person modal ---- */
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addHits, setAddHits] = useState<PersonnelHit[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  /* ---- batch generation ---- */
  const [batchRunning, setBatchRunning] = useState(false);
  const [ignoreUnused, setIgnoreUnused] = useState(false);

  /* ---- per-conversation generation ---- */
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  /* ---- auto-scroll ref ---- */
  const messageListEndRef = useRef<HTMLDivElement>(null);

  /* ---- data: user list ---- */
  const {
    data: users = [],
    isLoading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: fetchArchiveUsers,
  });

  /* ---- data: selected conversation ---- */
  const {
    data: conversation,
    isLoading: convLoading,
    error: convError,
  } = useQuery({
    queryKey: [CONVERSATION_QUERY_KEY_PREFIX, selectedUserId],
    queryFn: () =>
      selectedUserId ? fetchUserConversation(selectedUserId) : Promise.resolve(null),
    enabled: !!selectedUserId,
    placeholderData: (prev) => prev ?? undefined,
  });

  /* ---- 语音文件（服务端存盘）---- */
  const speechPregen = useSpeechPregen();
  const [pregenBusy, setPregenBusy] = useState(false);

  // 页面挂载时从服务端同步已生成列表（后端重启/浏览器重启后仍可恢复）
  useEffect(() => {
    speechPregen.syncFromServer();
  }, [speechPregen.syncFromServer]);

  // 会话加载后自动检查所有助手消息的音频状态
  // sessionStorage 持久化 readyIds，刷新页面不丢失
  // 顺序检查避免大量并发请求触发 ERR_INSUFFICIENT_RESOURCES
  // 已存在于 readyIds 的跳过（从 sessionStorage 恢复的）
  useEffect(() => {
    const msgs = conversation?.messages;
    if (!msgs?.length) return;
    const assistantIds = msgs
      .filter((m) => m.role === "assistant" && m.content)
      .map((m) => m.id);
    if (!assistantIds.length) return;
    // 跳过 sessionStorage 中已知的 ID，只检查新消息
    const unknownIds = assistantIds.filter((id) => !speechPregen.isReady(id));
    if (!unknownIds.length) return;
    let cancelled = false;
    (async () => {
      for (const id of unknownIds) {
        if (cancelled) break;
        await speechPregen.checkStatus(id);
      }
    })();
    return () => { cancelled = true; };
    // checkStatus 是 useCallback 稳定引用；isReady 随 readyIds 变化是预期行为
  }, [conversation?.messages, speechPregen.checkStatus]);

  const handlePregenOne = useCallback(async () => {
    if (!conversation?.messages) return;
    const lastMsg = conversation.messages
      .filter((m) => m.role === "assistant" && m.content)
      .at(-1);
    if (!lastMsg) {
      toast.error("没有可生成的助手消息");
      return;
    }
    setPregenBusy(true);
    const ok = await speechPregen.generate(lastMsg.id, lastMsg.content);
    setPregenBusy(false);
    toast[ok ? "success" : "error"](ok ? "语音生成完成！" : "生成失败，请重试");
  }, [conversation?.messages, speechPregen]);

  /* ---- auto-scroll to bottom on conversation load / message change ---- */
  useEffect(() => {
    messageListEndRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
  }, [conversation?.messages]);

  /* ---- derived: filtered list ---- */
  const filteredUsers = useMemo(() => {
    const list = Array.isArray(users) ? users : [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q)) ||
        (u.projectGroup && u.projectGroup.toLowerCase().includes(q))
    );
  }, [users, search]);

  /* ---- handlers ---- */
  const selectUser = useCallback((userId: string) => {
    setSelectedUserId(userId);
  }, []);

  const handleClear = useCallback(
    async (userId: string) => {
      if (!await appConfirm("确认清空该用户的对话记录？此操作不可恢复。")) return;
      setClearingId(userId);
      try {
        await clearUserConversation(userId);
        qc.setQueryData([CONVERSATION_QUERY_KEY_PREFIX, userId], null);
        qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
        toast.success("对话已清空");
      } catch (e: any) {
        toast.error(e?.message || "清空失败");
      } finally {
        setClearingId(null);
      }
    },
    [qc]
  );

  const handleEnroll = useCallback(async (userId: string) => {
    setEnrollingId(userId);
    try {
      const view = await enrollUser(userId);
      toast.success("已加入存档列表，对话将在用户刷卡后写入");
      setSelectedUserId(userId);
      qc.setQueryData([CONVERSATION_QUERY_KEY_PREFIX, userId], view);
      qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      setAddModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "添加失败");
    } finally { setEnrollingId(null); }
  }, [qc]);

  const handleAddSearch = useCallback(async (q: string) => {
    setAddSearch(q);
    if (!q.trim()) { setAddHits([]); return; }
    setAddSearching(true);
    try {
      const hits = await searchPersonnel(q.trim(), 20);
      setAddHits(hits);
    } catch { setAddHits([]); }
    finally { setAddSearching(false); }
  }, []);

  /* ---- per-conversation generate + auto speech ---- */
  const handleGenerate = useCallback(async (userId: string) => {
    setGeneratingId(userId);
    try {
      const view = await generateUserConversation(userId);
      qc.setQueryData([CONVERSATION_QUERY_KEY_PREFIX, userId], view);
      qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      toast.success("对话已生成，正在生成语音…");

      // 自动为最新一条助手消息生成语音
      const lastMsg = view?.messages
        ?.filter((m: any) => m.role === "assistant" && m.content)
        .at(-1) as any;
      if (lastMsg) {
        const ok = await speechPregen.generate(lastMsg.id, lastMsg.content);
        if (ok) toast.success("语音生成完成！");
      }
    } catch (e: any) {
      toast.error(e?.message || "生成失败");
    } finally { setGeneratingId(null); }
  }, [qc, speechPregen]);

  /* ---- 批量生成语音（最新未使用用户的对话）---- */
  const [batchSpeechBusy, setBatchSpeechBusy] = useState(false);
  const handleBatchSpeech = useCallback(async () => {
    setBatchSpeechBusy(true);
    const list = Array.isArray(users) ? users : [];
    const targets = list.filter((u) => u.hasConversation && !u.consumed);
    if (!targets.length) { toast("没有待生成语音的用户"); setBatchSpeechBusy(false); return; }

    let ok = 0;
    for (const u of targets) {
      try {
        const view = await fetchUserConversation(u.userId);
        const lastMsg = view?.messages
          ?.filter((m: any) => m.role === "assistant" && m.content)
          .at(-1) as any;
        if (lastMsg) {
          const success = await speechPregen.generate(lastMsg.id, lastMsg.content);
          if (success) ok++;
        }
      } catch { /* next */ }
    }
    toast.success(`语音生成完成: ${ok}/${targets.length}`);
    setBatchSpeechBusy(false);
  }, [users, speechPregen]);

  /* ---- batch generate (后台静默 SSE) ---- */
  const handleBatchGenerate = useCallback(async () => {
    setBatchRunning(true);
    const toastId = toast.loading(`批量生成中…（无视未使用：${ignoreUnused ? "是" : "否"}）`);
    try {
      await streamGenerateBatch([], ignoreUnused, (evt) => {
        if (evt.type === "done") {
          const d = evt as BatchDoneEvent;
          toast.dismiss(toastId);
          toast.success(`${d.success} 成功 / ${d.failed} 失败${d.skippedByFilter ? ` / ${d.skippedByFilter} 跳过` : ""}`);
        } else if (evt.type === "error") {
          toast.dismiss(toastId);
          toast.error(`批量生成出错: ${evt.message}`);
        }
      });
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error(e?.message || "批量生成失败");
    } finally {
      setBatchRunning(false);
      qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      if (selectedUserId) qc.invalidateQueries({ queryKey: [CONVERSATION_QUERY_KEY_PREFIX, selectedUserId] });
    }

    // 批量生成对话后自动为所有用户生成语音
    const updatedUsers = (qc.getQueryData(USERS_QUERY_KEY) as ArchiveUser[]) ?? users;
    const speechTargets = (Array.isArray(updatedUsers) ? updatedUsers : []).filter(
      (u) => u.hasConversation,
    );
    if (speechTargets.length) {
      toast.loading(`正在生成语音… 0/${speechTargets.length}`);
      let speechOk = 0;
      for (const u of speechTargets) {
        try {
          const view = await fetchUserConversation(u.userId);
          const lastMsg = view?.messages
            ?.filter((m: any) => m.role === "assistant" && m.content)
            .at(-1) as any;
          if (lastMsg) {
            const ok = await speechPregen.generate(lastMsg.id, lastMsg.content);
            if (ok) speechOk++;
          }
        } catch { /* next */ }
      }
      toast.dismiss();
      toast.success(`语音生成: ${speechOk}/${speechTargets.length}`);
      // 刷新当前选中用户的对话以显示高音质图标
      if (selectedUserId) qc.invalidateQueries({ queryKey: [CONVERSATION_QUERY_KEY_PREFIX, selectedUserId] });
    }
  }, [ignoreUnused, qc, selectedUserId, users, speechPregen]);

  /* ---- derived: selected user info ---- */
  const selectedUser = useMemo(
    () => (Array.isArray(users) ? users.find((u) => u.userId === selectedUserId) : null) ?? null,
    [users, selectedUserId]
  );

  /* ---- JSX ---- */
  return (
    <AdminPageShell>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-[var(--app-color-text-secondary)]">
            <input
              type="checkbox"
              checked={ignoreUnused}
              onChange={(e) => setIgnoreUnused(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--app-color-border-default)] text-[var(--app-color-accent)]"
            />
            无视未使用
          </label>
          <AdminButton type="button" tone="primary" size="sm" loading={batchRunning} onClick={handleBatchGenerate}>
            <Play className="h-3.5 w-3.5" />
            手动运行
          </AdminButton>
          <AdminButton type="button" tone="secondary" size="sm" loading={batchSpeechBusy} onClick={handleBatchSpeech}>
            <Volume2 className="h-3.5 w-3.5" />
            生成全部语音
          </AdminButton>
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-3 lg:flex-row">
        {/* ── Left: User List ── */}
        <aside
          className="flex shrink-0 flex-col rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm max-lg:h-[min(35vh,18rem)] lg:w-[320px] max-h-[calc(100dvh-var(--admin-chrome-offset)-48px)] min-h-[200px] overflow-y-auto"
        >
          {/* search + select-all */}
          <div className="shrink-0 space-y-2 border-b border-[var(--app-color-border-default)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索姓名/部门/课题组..."
                className={cn(
                  "h-9 w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)]",
                  "bg-[var(--app-color-surface-page)] pl-9 pr-3 text-sm",
                  "text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)]",
                  "outline-none transition-colors",
                  "focus:border-[var(--app-color-border-strong)] focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
                )}
              />
            </div>
            <div className="flex items-center justify-end">
              <AdminButton type="button" tone="ghost" size="sm" onClick={() => { setAddModalOpen(true); setAddSearch(""); setAddHits([]); }}>
                <UserPlus className="h-3.5 w-3.5" />
                添加人员
              </AdminButton>
            </div>
          </div>

          {/* user list */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-2">
            {usersLoading ? (
              <div className="space-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-[var(--app-radius-container)] px-3 py-2.5"
                  >
                    <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--app-color-surface-hover)]" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3.5 w-24 animate-pulse rounded bg-[var(--app-color-surface-hover)]" />
                      <div className="h-3 w-16 animate-pulse rounded bg-[var(--app-color-surface-hover)]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : usersError ? (
              <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm text-[var(--app-color-feedback-error)]">
                  {(usersError as Error)?.message || "加载失败"}
                </p>
                <AdminButton type="button" tone="secondary" size="sm" onClick={() => refetchUsers()}>
                  重试
                </AdminButton>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 p-6 text-center">
                <User className="h-8 w-8 text-[var(--app-color-text-tertiary)]" />
                <p className="text-sm text-[var(--app-color-text-tertiary)]">
                  {search.trim() ? "无匹配用户" : "暂无用户数据"}
                </p>
              </div>
            ) : (
              <div className="space-y-0.5 p-2">
                {filteredUsers.map((u) => (
                  <UserRow
                    key={u.userId}
                    user={u}
                    isSelected={u.userId === selectedUserId}
                    onClick={() => selectUser(u.userId)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* ── Right: Conversation View ── */}
        <main className="flex min-h-0 flex-1 flex-col rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm max-h-[calc(100dvh-var(--admin-chrome-offset)-48px)] min-h-[200px] overflow-y-auto">
          {!selectedUserId ? (
            /* empty state */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--app-color-surface-hover)]">
                <ArrowLeftRight className="h-8 w-8 text-[var(--app-color-text-tertiary)]" />
              </div>
              <p className="text-sm text-[var(--app-color-text-tertiary)]">
                选择左侧用户查看对话内容
              </p>
            </div>
          ) : convLoading ? (
            /* loading */
            <div className="flex-1 space-y-4 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3",
                    i % 2 === 0 ? "justify-start" : "justify-end"
                  )}
                >
                  <div
                    className={cn(
                      "h-16 animate-pulse rounded-[var(--app-radius-container)]",
                      i % 2 === 0 ? "w-3/5" : "w-2/5",
                      "bg-[var(--app-color-surface-hover)]"
                    )}
                  />
                </div>
              ))}
            </div>
          ) : convError ? (
            /* error */
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm text-[var(--app-color-feedback-error)]">
                {(convError as Error)?.message || "加载对话失败"}
              </p>
              <AdminButton
                type="button"
                tone="secondary"
                size="sm"
                onClick={() =>
                  qc.invalidateQueries({ queryKey: [CONVERSATION_QUERY_KEY_PREFIX, selectedUserId] })
                }
              >
                重试
              </AdminButton>
            </div>
          ) : !conversation ? (
            /* no conversation for this user */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--app-color-surface-hover)]">
                <MessageSquare className="h-8 w-8 text-[var(--app-color-text-tertiary)]" />
              </div>
              <p className="max-w-sm text-sm text-[var(--app-color-text-tertiary)]">
                {selectedUser?.name ?? "该用户"}暂无存档对话。内容在用户下次刷卡时由扫码助手实时写入。
              </p>
            </div>
          ) : (
            /* conversation content */
            <>
              {/* session metadata bar */}
              {conversation.session && (
                <div
                  className={cn(
                    "flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--app-color-border-default)]",
                    "px-6 py-2.5 text-xs text-[var(--app-color-text-secondary)]"
                  )}
                >
                  <ConsumedBadge
                    consumed={conversation.consumed ?? conversation.session.consumed}
                    compact={false}
                    usageWindowStartAt={conversation.usageWindowStartAt ?? conversation.session.usageWindowStartAt}
                  />
                  <span className="inline-flex items-center gap-1">
                    <Cpu className="h-3.5 w-3.5 text-[var(--app-color-text-tertiary)]" />
                    模型：{conversation.session.model}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-[var(--app-color-text-tertiary)]" />
                    生成时间：{formatDateTimeAsiaShanghaiShort(conversation.session.createTime)}
                  </span>
                  {(conversation.consumed ?? conversation.session.consumed) && (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[var(--app-color-feedback-warning)]" />
                        使用时间：
                        {formatDateTimeAsiaShanghaiShort(
                          conversation.consumedAt ?? conversation.session.consumedAt
                        )}
                      </span>
                      <span>
                        来源：{usageSourceLabel(
                          conversation.lastUsageSource ?? conversation.session.lastUsageSource
                        )}
                      </span>
                      {(conversation.usageWindowStartAt ?? conversation.session.usageWindowStartAt) && (
                        <span>
                          展示窗口：
                          {formatDateTimeAsiaShanghaiShort(
                            conversation.usageWindowStartAt ?? conversation.session.usageWindowStartAt
                          )}
                        </span>
                      )}
                    </>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Hash className="h-3.5 w-3.5 text-[var(--app-color-text-tertiary)]" />
                    Token：{conversation.session.tokenCountTotal?.toLocaleString() ?? 0}
                  </span>
                  <span>{conversation.messages.length} 条消息</span>
                </div>
              )}

              {/* messages scroll area */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-4">
                <div className="mx-auto max-w-3xl space-y-4">
                  {conversation.messages.map((msg) => (
                    <ChatBubble key={msg.id} message={msg} speechPregen={speechPregen} />
                  ))}
                  <div ref={messageListEndRef} />
                </div>
              </div>

              {/* bottom action bar */}
              <div
                className={cn(
                  "flex shrink-0 items-center gap-2 border-t border-[var(--app-color-border-default)]",
                  "px-6 py-3"
                )}
              >
                <AdminButton
                  type="button"
                  tone="primary"
                  size="sm"
                  loading={generatingId === selectedUserId}
                  onClick={() => handleGenerate(selectedUserId!)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  生成对话
                </AdminButton>
                <AdminButton
                  type="button"
                  tone="secondary"
                  size="sm"
                  loading={pregenBusy}
                  disabled={!conversation?.messages?.length}
                  onClick={handlePregenOne}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  生成语音 ({speechPregen.cacheSize || 0})
                </AdminButton>
                <div className="flex-1" />
                <AdminButton
                  type="button"
                  tone="destructive"
                  size="sm"
                  loading={clearingId === selectedUserId}
                  onClick={() => handleClear(selectedUserId!)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  清空对话
                </AdminButton>
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Add Person Modal ── */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加人员到对话列表</DialogTitle>
            <DialogDescription>
              将人员加入存档列表（仅注册元数据）。对话内容在用户刷卡时由 streamSpeak 写入，不支持批量人格预生成。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
              <input
                type="text"
                value={addSearch}
                onChange={(e) => handleAddSearch(e.target.value)}
                placeholder="搜索姓名或工号…"
                autoFocus
                className={cn(
                  "h-9 w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)]",
                  "bg-[var(--app-color-surface-page)] pl-9 pr-3 text-sm",
                  "text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)]",
                  "outline-none focus:border-[var(--app-color-border-strong)] focus:ring-2 focus:ring-[var(--app-color-accent)]/20"
                )}
              />
            </div>
            <div className="min-h-[120px] max-h-[320px] overflow-y-auto overscroll-y-contain">
              {addSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--app-color-text-tertiary)]" />
                </div>
              ) : !addSearch.trim() ? (
                <p className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">
                  输入姓名或工号开始搜索
                </p>
              ) : addHits.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">
                  无匹配人员
                </p>
              ) : (
                <div className="space-y-0.5">
                  {addHits.map((hit) => (
                    <div
                      key={hit.userId}
                      className="flex items-center gap-3 rounded-[var(--app-radius-element)] px-3 py-2 hover:bg-[var(--app-color-surface-hover)]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--app-color-surface-hover)] text-sm font-medium text-[var(--app-color-text-secondary)]">
                        {hit.name?.charAt(0) ?? <User className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--app-color-text-primary)]">
                          {hit.name}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--app-color-text-tertiary)]">
                          <span className="truncate">{hit.userId}</span>
                          {hit.department && <span className="truncate">{hit.department}</span>}
                        </div>
                      </div>
                      <AdminButton
                        type="button"
                        tone="primary"
                        size="sm"
                        loading={enrollingId === hit.userId}
                        onClick={() => handleEnroll(hit.userId)}
                      >
                        添加
                      </AdminButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </AdminPageShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function cooldownRemaining(windowStartAt?: string | null): { minutes: number; seconds: number; expired: boolean } {
  if (!windowStartAt) return { minutes: 0, seconds: 0, expired: true };
  const start = new Date(windowStartAt);
  if (isNaN(start.getTime())) return { minutes: 0, seconds: 0, expired: true };
  const expiresAt = start.getTime() + 10 * 60_000; // +10 min from lastUsedAt
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return { minutes: 0, seconds: 0, expired: true };
  return { minutes: Math.floor(remaining / 60_000), seconds: Math.floor((remaining % 60_000) / 1000), expired: false };
}

function ConsumedBadge({ consumed, compact, usageWindowStartAt }: { consumed?: boolean; compact: boolean; usageWindowStartAt?: string | null }) {
  // consumed=true 表示 lastUsedAt 在 10 分钟窗口内（"使用中"）
  const cooldown = consumed ? cooldownRemaining(usageWindowStartAt) : { minutes: 0, seconds: 0, expired: true };

  if (!consumed) {
    // 不在 10 分钟窗口内 → 检查是否有 lastUsedAt（已过期待更新 vs 完全未使用）
    const hasLastUsed = !!usageWindowStartAt;
    if (compact) return null;
    return (
      <span className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        hasLastUsed
          ? "bg-[var(--app-color-feedback-warning)]/12 text-[var(--app-color-feedback-warning)]"
          : "bg-[var(--app-color-feedback-success)]/12 text-[var(--app-color-feedback-success)]"
      )}>
        {hasLastUsed ? (
          <><AlertCircle className="h-3 w-3" />待更新</>
        ) : (
          <><Circle className="h-2 w-2 fill-current" />未使用</>
        )}
      </span>
    );
  }

  // 10 分钟窗口内 → "使用中"
  const cooldownLabel = ` · ${cooldown.minutes}m${cooldown.seconds}s 后更新`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium text-[var(--app-color-feedback-warning)]",
        compact
          ? "bg-[var(--app-color-feedback-warning)]/12 px-1.5 py-0.5 text-[10px]"
          : "bg-[var(--app-color-feedback-warning)]/12 px-2 py-0.5 text-[11px]"
      )}
      title={`${cooldown.minutes}m${cooldown.seconds}s 后调度器将自动生成新对话`}
    >
      {compact ? (
        <AlertCircle className="h-3 w-3" />
      ) : (
        <>
          <AlertCircle className="h-3 w-3" />
          使用中{cooldownLabel}
        </>
      )}
    </span>
  );
}

function UserRow({
  user,
  isSelected,
  onClick,
}: {
  user: ArchiveUser;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 rounded-[var(--app-radius-element)] text-left transition-colors",
        isSelected
          ? "bg-[var(--app-color-accent)]/10 ring-1 ring-[var(--app-color-accent)]/30"
          : "hover:bg-[var(--app-color-surface-hover)]"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 items-center gap-3 px-3 py-2.5 min-w-0"
      >
        {/* avatar placeholder */}
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium",
            isSelected
              ? "bg-[var(--app-color-accent)] text-[var(--app-color-text-on-accent,var(--app-color-text-inverse))]"
              : "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)]"
          )}
        >
          {user.name?.charAt(0) ?? <User className="h-4 w-4" />}
        </div>

        {/* info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm font-medium",
                isSelected
                  ? "text-[var(--app-color-accent)]"
                  : "text-[var(--app-color-text-primary)]"
              )}
            >
              {user.name}
            </span>
            {user.hasConversation && (
              <Circle className="h-2 w-2 shrink-0 fill-[var(--app-color-feedback-success)] text-[var(--app-color-feedback-success)]" />
            )}
            {user.consumed && (
              <ConsumedBadge consumed compact />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--app-color-text-tertiary)]">
            {user.department && <span className="truncate">{user.department}</span>}
            {user.projectGroup && (
              <span className="truncate text-[var(--app-color-text-tertiary)]/70">
                {user.projectGroup}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--app-color-text-tertiary)]/70">
            {user.lastScanTime && <span>{relativeTime(user.lastScanTime)}</span>}
            {user.messageCount > 0 && (
              <span>
                {user.messageCount} 条消息
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

function ChatBubble({
  message,
  speechPregen,
}: {
  message: { id: number; role: string; content: string; tokenCount: number; createTime: string };
  speechPregen: ReturnType<typeof useSpeechPregen>;
}) {
  const isSystem = message.role === "system";
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const msgId = String(message.id);
  const pregenReady = speechPregen.isReady(msgId);
  const isPlaying = speechPregen.playingId === msgId;
  const [browserSpeaking, setBrowserSpeaking] = useState(false);

  const handleSpeak = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // 正在播放 → 停止
      if (isPlaying) { speechPregen.stop(); return; }
      if (browserSpeaking) { speechSynthesis.cancel(); setBrowserSpeaking(false); return; }
      // 预生成命中 → CosyVoice
      if (pregenReady) { speechPregen.play(msgId); return; }
      // 回退浏览器 TTS
      if ("speechSynthesis" in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(message.content);
        u.lang = "zh-CN"; u.rate = 1.1;
        u.onend = () => setBrowserSpeaking(false);
        u.onerror = () => setBrowserSpeaking(false);
        setBrowserSpeaking(true);
        speechSynthesis.speak(u);
      }
    },
    [pregenReady, isPlaying, browserSpeaking, msgId, message.content, speechPregen],
  );

  const isSpeaking = isPlaying || browserSpeaking;

  return (
    <div
      className={cn(
        "flex gap-2.5",
        isUser && "justify-end"
      )}
    >
      {/* avatar column (non-user) */}
      {!isUser && (
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            isSystem
              ? "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)]"
              : "bg-[var(--app-color-accent)]/15 text-[var(--app-color-accent)]"
          )}
        >
          {roleIcon(message.role)}
        </div>
      )}

      {/* bubble */}
      <div
        className={cn(
          "max-w-[80%] min-w-0",
          isUser && "order-[-1]" // avatar goes after text for user
        )}
      >
        {/* role label */}
        <div
          className={cn(
            "mb-1 text-[11px] font-medium",
            isSystem && "text-[var(--app-color-text-tertiary)]",
            isUser && "text-right text-[var(--app-color-accent)]",
            isAssistant && "text-[var(--app-color-accent)]"
          )}
        >
          {roleLabel(message.role)}
          {isAssistant && message.content && (
            <>
              <span className="ml-1.5 font-normal text-[var(--app-color-text-tertiary)]">
                (deepseek-v4)
              </span>
              {/* 语音播报按钮 */}
              <button
                type="button"
                className={cn(
                  "ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  isSpeaking
                    ? "bg-[var(--app-color-accent)]/15 text-[var(--app-color-accent)]"
                    : pregenReady
                      ? "bg-[var(--app-color-feedback-success)]/12 text-[var(--app-color-feedback-success)] hover:bg-[var(--app-color-feedback-success)]/20"
                      : "bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-accent)]/10 hover:text-[var(--app-color-accent)]"
                )}
                onClick={handleSpeak}
                title={pregenReady ? "CosyVoice 3 预生成语音" : "浏览器语音朗读"}
              >
                <Volume2 className={cn("h-3 w-3", isSpeaking && "animate-pulse")} />
                <span>{isSpeaking ? "暂停" : pregenReady ? "高音质" : "朗读"}</span>
              </button>
            </>
          )}
        </div>

        {/* content */}
        <div
          className={cn(
            "rounded-[var(--app-radius-container)] px-3.5 py-2.5 text-sm leading-relaxed",
            isSystem &&
              "bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-secondary)] italic",
            isUser &&
              "bg-[var(--app-color-accent)]/12 text-[var(--app-color-text-primary)]",
            isAssistant &&
              "bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)]"
          )}
        >
          {message.content ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <span className="text-[var(--app-color-text-tertiary)] italic">(空消息)</span>
          )}
        </div>

        {/* meta: token count & time */}
        <div
          className={cn(
            "mt-1 flex items-center gap-2 text-[10px] text-[var(--app-color-text-tertiary)]/70",
            isUser && "justify-end"
          )}
        >
          {message.tokenCount > 0 && <span>{message.tokenCount} tokens</span>}
          <span>{formatDateTimeAsiaShanghaiShort(message.createTime)}</span>
        </div>
      </div>

      {/* avatar column (user only) */}
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--app-color-accent)]/15 text-[var(--app-color-accent)]">
          <User className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}
