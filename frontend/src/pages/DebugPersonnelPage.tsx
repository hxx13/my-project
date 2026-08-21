import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDebugPersonnelList,
  searchPersonnel,
  recalculateRpgExp,
  syncPersonnelData,
  type PersonnelRecord,
} from "@/api/twinApi";
import {
  addContactBookmark,
  fetchBookmarkedPeerIds,
  fetchContactGroups,
  removeContactBookmark,
  setContactAssignment,
} from "@/api/domains/chat.api";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { AdminToolbar } from "@/components/admin/AdminToolbar";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import { RefreshCw } from "lucide-react";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import toast from "react-hot-toast";
import { DebugPersonnelPersonCard } from "@/features/twin-debug/DebugPersonnelPersonCard";

import { appConfirm } from "@/lib/appDialog";
function toPersonRow(p: PersonnelRecord | Record<string, unknown>): Record<string, unknown> {
  return { ...p };
}

export default function DebugPersonnelPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Record<string, unknown>[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const SEARCH_PAGE_SIZE = 24;

  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const personnelSyncAbortRef = useRef<AbortController | null>(null);

  const role = authStorage.getRole() || "MEMBER";
  const myUserId = authStorage.getUserIdFromToken();
  const canStaffChatOps = hasMinRole(role, "STAFF");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["debugPersonnel", page, pageSize],
    queryFn: () => fetchDebugPersonnelList(page, pageSize),
  });

  const { data: bookmarkedIds = [] } = useQuery({
    queryKey: ["contactBookmarks"],
    queryFn: fetchBookmarkedPeerIds,
    enabled: canStaffChatOps && authStorage.hasToken(),
    staleTime: 20_000,
  });

  const { data: contactGroups = [] } = useQuery({
    queryKey: ["contactGroups"],
    queryFn: fetchContactGroups,
    enabled: canStaffChatOps && authStorage.hasToken(),
  });

  const bookmarkSet = useMemo(() => new Set((bookmarkedIds || []).map(String)), [bookmarkedIds]);

  const totalPages = data?.total ? Math.ceil(data.total / pageSize) : 0;
  const searchTotalPages = searchTotal > 0 ? Math.ceil(searchTotal / SEARCH_PAGE_SIZE) : 0;

  const handleSearch = async (keyword: string) => {
    if (!keyword.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      setSearchTotal(0);
      setSearchPage(1);
      return;
    }
    setIsSearching(true);
    setSearchPage(1);
    try {
      const res = await searchPersonnel(keyword.trim(), 1, SEARCH_PAGE_SIZE);
      setSearchResults(
        ((res.data || []) as Record<string, unknown>[]).map((row: Record<string, unknown>) => toPersonRow(row)),
      );
      setSearchTotal(res.total ?? 0);
    } catch (error) {
      console.error("人员搜索失败", error);
    }
  };

  const handleSearchPageChange = async (newPage: number) => {
    if (!searchDraft.trim()) return;
    setSearchPage(newPage);
    try {
      const res = await searchPersonnel(searchDraft.trim(), newPage, SEARCH_PAGE_SIZE);
      setSearchResults(
        ((res.data || []) as Record<string, unknown>[]).map((row: Record<string, unknown>) => toPersonRow(row)),
      );
      setSearchTotal(res.total ?? 0);
    } catch (error) {
      console.error("搜索翻页失败", error);
    }
  };

  const handleRecalculateExp = async () => {
    if (!await appConfirm("这将重新遍历历史流水并重新计算所有人的 RPG 经验！确认执行？")) return;
    setIsRecalculating(true);
    try {
      await recalculateRpgExp();
      toast.success("全量经验值重算完毕");
      await refetch();
      await queryClient.invalidateQueries({ queryKey: ["expSummary"] });
      await queryClient.invalidateQueries({ queryKey: ["expRecords"] });
    } catch {
      toast.error("重算失败，请检查后端状态");
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleSyncPersonnel = async () => {
    if (isSyncing) {
      personnelSyncAbortRef.current?.abort();
      personnelSyncAbortRef.current = null;
      setIsSyncing(false);
      return;
    }
    const ac = new AbortController();
    personnelSyncAbortRef.current = ac;
    setIsSyncing(true);
    try {
      await syncPersonnelData(ac.signal);
      toast.success("人员资料库同步完成");
      await refetch();
    } catch (error: unknown) {
      const err = error as { name?: string; code?: string };
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") {
        /* 用户暂停 */
      } else {
        console.error(error);
        toast.error("同步失败，请检查后端网络");
      }
    } finally {
      personnelSyncAbortRef.current = null;
      setIsSyncing(false);
    }
  };

  const displayData: Record<string, unknown>[] = isSearching
    ? searchResults
    : (data?.data ?? []).map(toPersonRow);

  const opsItems = [
    {
      key: "sync",
      label: isSyncing ? "暂停人员同步" : "全量同步人员",
      minRole: "SUPER_ADMIN" as const,
      disabled: false,
      onSelect: () => {
        void handleSyncPersonnel();
      },
    },
    {
      key: "rpg",
      label: isRecalculating ? "经验结算中…" : "重算 RPG 经验",
      minRole: "SUPER_ADMIN" as const,
      disabled: isRecalculating,
      onSelect: () => {
        void handleRecalculateExp();
      },
    },
  ];

  const chatHandlers = {
    onAddBookmark: (uid: string) => {
      void (async () => {
        try {
          await addContactBookmark(uid);
          await queryClient.invalidateQueries({ queryKey: ["contactBookmarks"] });
          toast.success("已加入本人通讯录");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "操作失败");
        }
      })();
    },
    onRemoveBookmark: (uid: string) => {
      void (async () => {
        try {
          await removeContactBookmark(uid);
          await queryClient.invalidateQueries({ queryKey: ["contactBookmarks"] });
          toast.success("已从通讯录移除");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "操作失败");
        }
      })();
    },
    onAssignGroup: (uid: string, groupId: string | null) => {
      void (async () => {
        try {
          await setContactAssignment(uid, groupId);
          await queryClient.invalidateQueries({ queryKey: ["contactBookmarks"] });
          toast.success(groupId == null ? "已设为未分组" : "已归入分组");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "保存失败");
        }
      })();
    },
  };

  return (
    <div
      data-twin-debug-personnel
      className="box-border flex h-full flex-col overflow-y-auto bg-[var(--app-color-surface-page)] p-6 md:p-8"
    >
      <AdminToolbar className="mb-4 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
        <div className="min-w-0 max-w-[min(42vw,20rem)] shrink">
          <h1 className="flex items-center gap-2 truncate text-lg font-bold text-[var(--app-color-text-primary)] sm:text-xl">
            人员数据库
            <span className="shrink-0 rounded-full bg-[var(--app-color-surface-hover)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--app-color-text-secondary)]">
              aro_personnel
            </span>
          </h1>
          <p className="truncate text-[11px] text-[var(--app-color-text-tertiary)] sm:text-xs">
            共 {data?.total || 0} 条 · 官方可进优先 / 经验降序 / 姓名
          </p>
        </div>
        <div className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2">
          <DebugDangerousOpsMenu items={opsItems} />
          <AdminToolbarSearchField
            className="w-[min(42vw,14rem)] shrink-0 sm:w-56"
            placeholder="搜姓名、ID、课题组…"
            value={searchDraft}
            onChange={(val) => {
              setSearchDraft(val);
              if (!val.trim()) {
                setIsSearching(false);
                setSearchResults([]);
              }
            }}
            onSubmit={() => void handleSearch(searchDraft)}
            disabled={isLoading}
          />
          <div className="flex shrink-0 flex-nowrap items-center gap-1 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 py-1 shadow-[var(--app-elevation-card)] sm:gap-2 sm:px-3">
            {isSearching ? (
              <>
                <button
                  type="button"
                  disabled={searchPage <= 1}
                  onClick={() => handleSearchPageChange(searchPage - 1)}
                  className="shrink-0 px-1 font-black text-[var(--app-color-accent)] disabled:text-[var(--app-color-text-tertiary)] sm:px-2"
                >
                  ◀
                </button>
                <span className="shrink-0 whitespace-nowrap text-xs font-bold text-[var(--app-color-text-secondary)] sm:text-sm">
                  第 {searchPage} / {searchTotalPages || 1} 页
                </span>
                <button
                  type="button"
                  disabled={searchPage >= searchTotalPages || searchTotalPages === 0}
                  onClick={() => handleSearchPageChange(searchPage + 1)}
                  className="shrink-0 px-1 font-black text-[var(--app-color-accent)] disabled:text-[var(--app-color-text-tertiary)] sm:px-2"
                >
                  ▶
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="shrink-0 px-1 font-black text-[var(--app-color-accent)] disabled:text-[var(--app-color-text-tertiary)] sm:px-2"
                >
                  ◀
                </button>
                <span className="shrink-0 whitespace-nowrap text-xs font-bold text-[var(--app-color-text-secondary)] sm:text-sm">
                  第 {page} / {totalPages || 1} 页
                </span>
                <button
                  type="button"
                  disabled={page === totalPages || totalPages === 0}
                  onClick={() => setPage((p) => p + 1)}
                  className="shrink-0 px-1 font-black text-[var(--app-color-accent)] disabled:text-[var(--app-color-text-tertiary)] sm:px-2"
                >
                  ▶
                </button>
              </>
            )}
          </div>
        </div>
      </AdminToolbar>

      {isLoading && !isSearching ? (
        <div className="flex flex-1 items-center justify-center gap-3 text-xl font-bold text-[var(--app-color-text-tertiary)]">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" /> 正在读取档案矩阵...
        </div>
      ) : (
        <div className="flex-1 overflow-auto pb-16">
          {isSearching && displayData.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-container)] p-12 text-center font-bold text-[var(--app-color-text-tertiary)]">
              未找到人员记录
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {displayData.map((person) => {
                const uid = String(person.user_id ?? "").trim();
                const isSelf = myUserId != null && uid === myUserId;
                const bookmarked = uid.length > 0 && bookmarkSet.has(uid);
                return (
                  <DebugPersonnelPersonCard
                    key={uid || String(person.name)}
                    person={person}
                    canStaffChatOps={canStaffChatOps}
                    isSelf={isSelf}
                    bookmarked={bookmarked}
                    contactGroups={contactGroups}
                    {...chatHandlers}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
