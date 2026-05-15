import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDebugPersonnelList, searchPersonnel, recalculateRpgExp, syncPersonnelData } from "@/api/twinApi";
import {
  addContactBookmark,
  fetchBookmarkedPeerIds,
  fetchContactGroups,
  removeContactBookmark,
  setContactAssignment,
} from "@/api/domains/chat.api";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { AdminToolbar } from "@/components/admin/AdminToolbar";
import { DebugDangerousOpsMenu } from "@/components/admin/DebugDangerousOpsMenu";
import { QRCodeSVG } from "qrcode.react";
import { MoreVertical, RefreshCw } from "lucide-react";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import toast from "react-hot-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DebugPersonnelPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchDraft, setSearchDraft] = useState("");

  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const personnelSyncAbortRef = useRef<AbortController | null>(null);

  const role = authStorage.getRole() || "STUDENT";
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

  const handleSearch = async (keyword: string) => {
    if (!keyword.trim()) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await searchPersonnel(keyword.trim());
      setSearchResults(res || []);
    } catch (error) {
      console.error("人员搜索失败", error);
    }
  };

  const handleRecalculateExp = async () => {
    if (!window.confirm("⚠️ 这将重新遍历几十万条历史流水并重新计算所有人的 RPG 经验！确认执行？")) return;
    setIsRecalculating(true);
    try {
      await recalculateRpgExp();
      toast.success("全量经验值重算完毕");
      await refetch();
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

  const displayData = isSearching ? searchResults : data?.data || [];

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

  return (
    <div className="p-8 bg-slate-50/50 h-full flex flex-col box-border">
      <AdminToolbar className="mb-6 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
        <div className="min-w-0 max-w-[min(42vw,20rem)] shrink">
          <h1 className="flex items-center gap-2 truncate text-lg font-bold text-slate-800 sm:text-xl">
            人员调试
            <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600">
              aro_personnel
            </span>
          </h1>
          <p className="truncate text-[11px] text-slate-500 sm:text-xs">
            共 {data?.total || 0} 条；有官方进房权限优先，其余按 RPG 经验排序。
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
          <div className="flex shrink-0 flex-nowrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm sm:gap-2 sm:px-3">
            <button
              type="button"
              disabled={page === 1 || isSearching}
              onClick={() => setPage((p) => p - 1)}
              className="shrink-0 px-1 font-black text-blue-600 disabled:text-slate-300 sm:px-2"
            >
              ◀
            </button>
            <span className="shrink-0 whitespace-nowrap text-xs font-bold text-slate-700 sm:text-sm">
              {isSearching ? "— / —" : `第 ${page} / ${totalPages || 1} 页`}
            </span>
            <button
              type="button"
              disabled={page === totalPages || totalPages === 0 || isSearching}
              onClick={() => setPage((p) => p + 1)}
              className="shrink-0 px-1 font-black text-blue-600 disabled:text-slate-300 sm:px-2"
            >
              ▶
            </button>
          </div>
        </div>
      </AdminToolbar>

      {isLoading && !isSearching ? (
        <div className="flex flex-1 items-center justify-center gap-3 text-xl font-bold text-slate-500">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" /> 正在读取档案矩阵...
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-md pb-24">
          <table className="w-full min-w-max border-collapse text-left text-sm whitespace-nowrap">
            <thead className="sticky top-0 z-20 border-b-2 border-slate-300 bg-slate-100 font-bold text-slate-700 shadow-sm">
              <tr>
                <th className="w-16 p-4 text-center">头像</th>
                <th className="p-4">姓名 / ID</th>
                <th className="p-4">等级 (RPG)</th>
                <th className="p-4">身份角色</th>
                <th className="p-4">院系 / 课题组</th>
                <th className="p-4">联系方式</th>
                <th
                  className="w-20 whitespace-normal p-4 text-center"
                  title="库列 has_official_room_permission：1=有官方可进房间，0=无"
                >
                  官方可进
                </th>
                <th className="min-w-[12rem] max-w-[28rem] whitespace-normal p-4">可进房间（官方权限·已映射）</th>
                <th className="w-24 p-4 text-center">模拟二维码</th>
                {canStaffChatOps ? <th className="w-12 p-4 text-center">操作</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayData.map((person: any) => {
                const exp = person.total_exp || 0;
                const level = Math.floor(Math.sqrt(exp / 50.0)) + 1;
                const avatarSrc = resolvePersonnelAvatarUrl(person.head);
                const rawPerm = person.has_official_room_permission ?? person.hasOfficialRoomPermission;
                const hasOfficialPerm = rawPerm === 1 || rawPerm === true || rawPerm === "1";
                const uid = String(person.user_id ?? "").trim();
                const isSelf = myUserId != null && uid === myUserId;
                const bookmarked = uid.length > 0 && bookmarkSet.has(uid);

                return (
                  <tr key={person.user_id} className="transition-colors hover:bg-blue-50/50">
                    <td className="p-3 text-center">
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt="avatar"
                          className="mx-auto h-10 w-10 rounded-full border border-slate-200 object-cover shadow-sm"
                        />
                      ) : (
                        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-400">
                          暂无
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="text-base font-black text-slate-800">{person.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-slate-400">{person.user_id}</div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="rounded bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-1 text-xs font-black text-white shadow-sm">
                          Lv.{level}
                        </div>
                        <div className="font-mono text-xs font-bold text-slate-500">Exp: {exp.toFixed(1)}</div>
                      </div>
                    </td>
                    <td className="p-3 font-bold text-slate-600">{person.user_type_names || "-"}</td>
                    <td className="p-3">
                      <div className="max-w-[14rem] truncate text-sm font-bold text-slate-800" title={person.department_name || ""}>
                        {person.department_name || "—"}
                        {person.project_group_name ? (
                          <span className="font-normal text-slate-500"> · {person.project_group_name}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-slate-600">{person.mobile_phone || "-"}</td>
                    <td className="p-3 text-center align-middle">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-black ${
                          hasOfficialPerm ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {hasOfficialPerm ? "有" : "无"}
                      </span>
                    </td>
                    <td className="max-w-[28rem] whitespace-normal break-words p-3 align-top text-xs leading-snug text-slate-700">
                      {person.allowed_rooms_display_zh || person.allowedRoomsDisplayZh || "—"}
                    </td>
                    <td className="p-3 text-center">
                      <div className="inline-block rounded border border-slate-200 bg-white p-1 shadow-sm">
                        <QRCodeSVG value={person.user_id} size={48} />
                      </div>
                    </td>
                    {canStaffChatOps ? (
                      <td className="p-2 text-center align-middle">
                        {!isSelf && uid ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                aria-label="通讯录与分组"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[10rem]">
                              {!bookmarked ? (
                                <DropdownMenuItem
                                  onSelect={() => {
                                    void (async () => {
                                      try {
                                        await addContactBookmark(uid);
                                        await queryClient.invalidateQueries({ queryKey: ["contactBookmarks"] });
                                        toast.success("已加入本人通讯录");
                                      } catch (e) {
                                        toast.error(e instanceof Error ? e.message : "操作失败");
                                      }
                                    })();
                                  }}
                                >
                                  加入通讯录
                                </DropdownMenuItem>
                              ) : (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      void (async () => {
                                        try {
                                          await removeContactBookmark(uid);
                                          await queryClient.invalidateQueries({ queryKey: ["contactBookmarks"] });
                                          toast.success("已从通讯录移除");
                                        } catch (e) {
                                          toast.error(e instanceof Error ? e.message : "操作失败");
                                        }
                                      })();
                                    }}
                                    className="text-rose-600 focus:bg-rose-50"
                                  >
                                    从通讯录移除
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>归入分组</DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                                      <DropdownMenuItem
                                        onSelect={() => {
                                          void (async () => {
                                            try {
                                              await setContactAssignment(uid, null);
                                              await queryClient.invalidateQueries({ queryKey: ["contactBookmarks"] });
                                              toast.success("已设为未分组");
                                            } catch (e) {
                                              toast.error(e instanceof Error ? e.message : "保存失败");
                                            }
                                          })();
                                        }}
                                      >
                                        未分组
                                      </DropdownMenuItem>
                                      {contactGroups.map((g) => (
                                        <DropdownMenuItem
                                          key={g.id}
                                          onSelect={() => {
                                            void (async () => {
                                              try {
                                                await setContactAssignment(uid, g.id);
                                                await queryClient.invalidateQueries({ queryKey: ["contactBookmarks"] });
                                                toast.success(`已归入「${g.name}」`);
                                              } catch (e) {
                                                toast.error(e instanceof Error ? e.message : "保存失败");
                                              }
                                            })();
                                          }}
                                        >
                                          {g.name}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {isSearching && displayData.length === 0 ? (
            <div className="p-10 text-center font-bold text-slate-500">未在档案矩阵中找到人员记录...</div>
          ) : null}
        </div>
      )}
    </div>
  );
}
