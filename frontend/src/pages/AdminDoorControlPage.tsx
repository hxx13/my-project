import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Check,
  ChevronDown,
  Folder,
  FolderInput,
  Layers,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  RefreshCw,
  Regex,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import {
  batchRenameDahuaChannelsChunked,
  createDahuaDeviceChannelRemarkCategory,
  deleteDahuaDeviceChannelRemarkCategory,
  deleteDoorChannelGroup,
  executeDoorControl,
  fetchDahuaDeviceChannelRemarkCategories,
  fetchDoorChannelGroups,
  fetchDoorControlChannels,
  patchDahuaDeviceChannelRemark,
  queryDoorControlStatus,
  renameDahuaChannel,
  saveDoorChannelGroup,
  updateDahuaDeviceChannelRemarkCategory,
  type DahuaDeviceChannelRemarkCategory,
  type DahuaDeviceChannelRow,
} from "@/api/twinApi";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { Portal } from "@/components/Portal";
import { DndScope } from "@/components/tree/DndScope";
import { FileFolderTree } from "@/features/file-templates/FileFolderTree";
import type { FileFolderNode } from "@/api/domains/fileFolders.api";
import DataSkeleton from "@/components/ui/DataSkeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { displayFloorAndName, normalizeChannelName, parseChannelName } from "@/utils/dahuaChannelName";

type Mode = "OPEN" | "CLOSE" | "STAY_OPEN" | "STAY_CLOSE" | "NORMAL";
type StatusFilter = "" | "STAY_OPEN" | "STAY_CLOSE" | "NORMAL" | "OFFLINE";

interface StatusInfo {
  status: number | null;
  workMode: number | null;
  onlineStatus: string;
  at: number;
}

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "", label: "全部" },
  { key: "STAY_OPEN", label: "常开" },
  { key: "STAY_CLOSE", label: "常闭" },
  { key: "NORMAL", label: "普通" },
  { key: "OFFLINE", label: "离线" },
];

const MODE_LABEL: Record<string, string> = {
  OPEN: "开门",
  CLOSE: "关门",
  STAY_OPEN: "常开",
  STAY_CLOSE: "常闭",
  NORMAL: "普通",
};

const STATUS_TEXT: Record<string, string> = {
  OPEN: "已开门",
  CLOSE: "已关门",
  STAY_OPEN: "常开",
  STAY_CLOSE: "常闭",
  NORMAL: "普通",
};

const MODE_ACTION_LABEL: Record<string, string> = {
  OPEN: "远程开门",
  CLOSE: "远程关门",
  STAY_OPEN: "设为常开",
  STAY_CLOSE: "设为常闭",
  NORMAL: "恢复普通",
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolveMode(status: number | null, workMode: number | null): string {
  if (workMode === 2) return "STAY_OPEN";
  if (workMode === 1) return "STAY_CLOSE";
  if (workMode === 0) return "NORMAL";
  if (status === 1) return "OPEN";
  if (status === 2) return "CLOSE";
  return "UNKNOWN";
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function buildDoorFolders(categories: DahuaDeviceChannelRemarkCategory[], channels: DahuaDeviceChannelRow[]) {
  const catById = new Map<number, DahuaDeviceChannelRemarkCategory>();
  categories.forEach((c) => catById.set(Number(c.id), c));
  const byParent = new Map<number, DahuaDeviceChannelRemarkCategory[]>();
  categories.forEach((c) => {
    const pid = c.parentId != null && catById.has(Number(c.parentId)) ? Number(c.parentId) : 0;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(c);
  });
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || Number(a.id) - Number(b.id));
  }
  const directCount = new Map<number, number>();
  channels.forEach((ch) => {
    if (ch.remarkCategoryId != null) {
      const id = Number(ch.remarkCategoryId);
      directCount.set(id, (directCount.get(id) || 0) + 1);
    }
  });
  const pathById = new Map<number, string>();
  const nodeById = new Map<number, FileFolderNode>();

  const build = (cat: DahuaDeviceChannelRemarkCategory, prefix: string): FileFolderNode => {
    const id = Number(cat.id);
    const path = prefix ? `${prefix} / ${cat.name}` : cat.name;
    const children = (byParent.get(id) || []).map((c) => build(c, path));
    const totalCount = (directCount.get(id) || 0) + children.reduce((s, c) => s + (c.totalCount ?? 0), 0);
    const node: FileFolderNode = {
      id,
      parentId: cat.parentId ?? null,
      name: cat.name,
      sortOrder: cat.sortOrder ?? 0,
      directCount: directCount.get(id) || 0,
      totalCount,
      children,
    };
    pathById.set(id, path);
    nodeById.set(id, node);
    return node;
  };
  const roots = (byParent.get(0) || []).map((c) => build(c, ""));
  return { roots, pathById, nodeById };
}

function collectIds(node: FileFolderNode | undefined): Set<number> {
  const out = new Set<number>();
  if (!node) return out;
  const walk = (n: FileFolderNode) => {
    out.add(n.id);
    (n.children || []).forEach(walk);
  };
  walk(node);
  return out;
}

function flattenFolders(nodes: FileFolderNode[], depth = 0, prefix = ""): Array<{ id: number; name: string; path: string; depth: number }> {
  const out: Array<{ id: number; name: string; path: string; depth: number }> = [];
  for (const n of nodes) {
    const path = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ id: n.id, name: n.name, path, depth });
    out.push(...flattenFolders(n.children || [], depth + 1, path));
  }
  return out;
}

export default function AdminDoorControlPage() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<DahuaDeviceChannelRemarkCategory[]>([]);
  const [channels, setChannels] = useState<DahuaDeviceChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [statusByCode, setStatusByCode] = useState<Record<string, StatusInfo>>({});
  const [busyCode, setBusyCode] = useState("");
  const [modeMenuCode, setModeMenuCode] = useState("");

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [treeKeyword, setTreeKeyword] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [selectedCode, setSelectedCode] = useState("");

  const [moveTarget, setMoveTarget] = useState<DahuaDeviceChannelRow | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string>("");

  /** 多选 + 编组（编组存后端，各端共用） */
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const groupsQuery = useQuery({
    queryKey: ["dahuaDoorChannelGroups"] as const,
    queryFn: fetchDoorChannelGroups,
  });
  const groups = groupsQuery.data ?? [];

  const [normalizeOpen, setNormalizeOpen] = useState(false);
  const [normalizeApplying, setNormalizeApplying] = useState(false);

  const statusSeq = useRef(0);
  const channelsRef = useRef<DahuaDeviceChannelRow[]>([]);
  channelsRef.current = channels;

  const { roots, pathById, nodeById } = useMemo(
    () => buildDoorFolders(categories, channels),
    [categories, channels]
  );
  const catById = useMemo(() => new Map(categories.map((c) => [Number(c.id), c])), [categories]);
  const folderOptions = useMemo(() => flattenFolders(roots), [roots]);
  const unassignedChannels = useMemo(
    () => channels.filter((c) => c.remarkCategoryId == null || !pathById.has(Number(c.remarkCategoryId))),
    [channels, pathById]
  );

  const normalizeCandidates = useMemo(
    () =>
      channels
        .map((c) => ({ row: c, oldName: c.channelName || "", newName: normalizeChannelName(c.channelName || "") }))
        .filter((c) => c.newName !== c.oldName),
    [channels]
  );

  const reloadCategories = useCallback(async () => {
    try {
      const cats = await fetchDahuaDeviceChannelRemarkCategories();
      setCategories(cats || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "读取文件夹失败");
    }
  }, []);

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      roots.forEach((r) => next.add(r.id));
      return next;
    });
  }, [roots]);

  const applyStatusRows = useCallback((rows: Array<Record<string, any>>) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    setStatusByCode((prev) => {
      const next = { ...prev };
      rows.forEach((r) => {
        const code = String(r.channelCode || "").trim();
        if (!code) return;
        next[code] = {
          status: num(r.status),
          workMode: num(r.workMode),
          onlineStatus: String(r.onlineStatus || "").toUpperCase(),
          at: Date.now(),
        };
      });
      return next;
    });
  }, []);

  const refreshStatuses = useCallback(async (list: DahuaDeviceChannelRow[]) => {
    const seq = ++statusSeq.current;
    const codes = list.map((c) => String(c.channelCode || "").trim()).filter(Boolean);
    if (codes.length === 0) return;
    setStatusLoading(true);
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < codes.length; i += 50) chunks.push(codes.slice(i, i + 50));
      await mapLimit(chunks, 4, async (chunk) => {
        if (seq !== statusSeq.current) return;
        try {
          const resp = await queryDoorControlStatus({ channelCodes: chunk });
          if (seq === statusSeq.current) applyStatusRows(resp.rows || []);
        } catch {
          // 单批失败保留旧状态
        }
      });
      if (seq === statusSeq.current) setLastUpdated(new Date().toLocaleTimeString());
    } finally {
      if (seq === statusSeq.current) setStatusLoading(false);
    }
  }, [applyStatusRows]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, rows] = await Promise.all([
        fetchDahuaDeviceChannelRemarkCategories(),
        (async () => {
          const all: DahuaDeviceChannelRow[] = [];
          for (let page = 1; page <= 10; page += 1) {
            const res = await fetchDoorControlChannels({ page, pageSize: 200 });
            const list = res.list || [];
            all.push(...list);
            if (list.length < 200) break;
          }
          return all;
        })(),
      ]);
      setCategories(cats || []);
      setChannels(rows);
      await refreshStatuses(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载门禁通道失败");
    } finally {
      setLoading(false);
    }
  }, [refreshStatuses]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshStatuses(channelsRef.current);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refreshStatuses]);

  const infoOf = (row: DahuaDeviceChannelRow) => {
    const code = String(row.channelCode || "").trim();
    const st = statusByCode[code];
    const offline = st?.onlineStatus === "OFF";
    const pending = !st;
    const mode = st ? resolveMode(st.status, st.workMode) : "";
    const text = offline ? "离线" : pending ? "同步中" : STATUS_TEXT[mode] || "普通";
    const icon = offline
      ? "/icc/door-offline.svg"
      : mode === "STAY_OPEN" || mode === "OPEN"
        ? "/icc/door-open.svg"
        : mode === "STAY_CLOSE" || mode === "CLOSE"
          ? "/icc/door-locked.svg"
          : "/icc/door-normal.svg";
    const chip = offline
      ? "border-slate-200 bg-slate-100 text-slate-500"
      : pending
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : mode === "STAY_OPEN"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : mode === "STAY_CLOSE"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-200 bg-slate-50 text-slate-600";
    return { code, st, offline, pending, mode, text, icon, chip };
  };

  const folderIds = useMemo(() => {
    if (selectedFolderId == null || selectedFolderId <= 0) return null;
    return collectIds(nodeById.get(selectedFolderId));
  }, [selectedFolderId, nodeById]);

  const baseList = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return channels.filter((row) => {
      const catId = row.remarkCategoryId != null ? Number(row.remarkCategoryId) : null;
      if (selectedFolderId === -1) {
        if (catId != null && pathById.has(catId)) return false;
      } else if (selectedFolderId != null && selectedFolderId > 0) {
        if (catId == null || !folderIds?.has(catId)) return false;
      }
      if (k) {
        const hay = `${row.channelName || ""} ${row.channelCode || ""}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }, [channels, keyword, selectedFolderId, folderIds, pathById]);

  const counts = useMemo(() => {
    const out = { all: baseList.length, STAY_OPEN: 0, STAY_CLOSE: 0, NORMAL: 0, OFFLINE: 0 };
    baseList.forEach((row) => {
      const { offline, mode } = infoOf(row);
      if (offline) out.OFFLINE += 1;
      else if (mode === "STAY_OPEN") out.STAY_OPEN += 1;
      else if (mode === "STAY_CLOSE") out.STAY_CLOSE += 1;
      else if (mode === "NORMAL") out.NORMAL += 1;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseList, statusByCode]);

  const visible = useMemo(() => {
    if (!statusFilter) return baseList;
    return baseList.filter((row) => {
      const { offline, mode } = infoOf(row);
      if (statusFilter === "OFFLINE") return offline;
      if (offline) return false;
      return mode === statusFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseList, statusFilter, statusByCode]);

  const selectedTitle =
    selectedFolderId === -1
      ? "未分类"
      : selectedFolderId != null && selectedFolderId > 0
        ? pathById.get(selectedFolderId) || "当前文件夹"
        : "全部通道";

  const fetchOneStatus = async (code: string): Promise<StatusInfo | null> => {
    try {
      const resp = await queryDoorControlStatus({ channelCode: code });
      const rows = resp.rows || [];
      const row = rows.find((r) => String(r.channelCode || "").trim() === code) || rows[0];
      if (!row) return null;
      return {
        status: num(row.status),
        workMode: num(row.workMode),
        onlineStatus: String(row.onlineStatus || "").toUpperCase(),
        at: Date.now(),
      };
    } catch {
      return null;
    }
  };

  const refreshOneWithRetry = async (code: string, mode: Mode) => {
    const expected = mode === "STAY_OPEN" ? 2 : mode === "STAY_CLOSE" ? 1 : mode === "NORMAL" ? 0 : undefined;
    const delays = expected === undefined ? [600] : [0, 500, 1200, 2400];
    for (const delay of delays) {
      if (delay) await sleep(delay);
      const info = await fetchOneStatus(code);
      if (!info) continue;
      setStatusByCode((prev) => ({ ...prev, [code]: info }));
      if (expected !== undefined && info.workMode === expected) break;
    }
    setLastUpdated(new Date().toLocaleTimeString());
  };

  const applyOptimistic = (code: string, mode: Mode) => {
    setStatusByCode((prev) => {
      const base = prev[code] || { status: 0, workMode: null, onlineStatus: "ON", at: Date.now() };
      if (mode === "STAY_OPEN") return { ...prev, [code]: { ...base, workMode: 2, at: Date.now() } };
      if (mode === "STAY_CLOSE") return { ...prev, [code]: { ...base, workMode: 1, at: Date.now() } };
      if (mode === "NORMAL") return { ...prev, [code]: { ...base, workMode: 0, at: Date.now() } };
      if (mode === "OPEN") return { ...prev, [code]: { ...base, status: 1, at: Date.now() } };
      return { ...prev, [code]: { ...base, status: 2, at: Date.now() } };
    });
  };

  const runAction = async (row: DahuaDeviceChannelRow, mode: Mode) => {
    setModeMenuCode("");
    const code = String(row.channelCode || "").trim();
    if (!code) return;
    const name = row.channelName || code;
    if (!(await appConfirm(`确认对「${name}」执行「${MODE_ACTION_LABEL[mode]}」？`))) return;
    setBusyCode(code);
    try {
      const result = await executeDoorControl({ mode, channelCodeList: [code] });
      const ok = !!(result && (result.success === true || result.success === "true"));
      const upstream = (result && (result.upstream as Record<string, any>)) || {};
      if (ok) {
        applyOptimistic(code, mode);
        toast.success(`${MODE_ACTION_LABEL[mode]}已下发`);
      } else {
        toast.error(String(upstream.errMsg || upstream.message || "操作失败"));
      }
      await refreshOneWithRetry(code, mode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
      await refreshOneWithRetry(code, mode);
    } finally {
      setBusyCode("");
    }
  };

  const toggleSelect = (code: string) => {
    if (!code) return;
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const saveGroup = async () => {
    if (selectedCodes.size === 0) return;
    const input = await appPrompt("编组名称（同名会覆盖）", "", { title: "保存为编组" });
    const name = (input || "").trim();
    if (!name) return;
    try {
      await saveDoorChannelGroup({ name, channelCodes: Array.from(selectedCodes) });
      await groupsQuery.refetch();
      toast.success(`已保存编组「${name}」（${selectedCodes.size} 门）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存编组失败");
    }
  };

  const deleteGroup = async (id: number, name: string) => {
    try {
      await deleteDoorChannelGroup(id);
      await groupsQuery.refetch();
      toast.success(`已删除编组「${name}」`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除编组失败");
    }
  };

  /** 批量下发：一次调用带回整组通道，成功后统一回读状态 */
  const runBatch = async (mode: Mode) => {
    const codes = Array.from(selectedCodes);
    if (codes.length === 0) return;
    if (!(await appConfirm(`确认对选中的 ${codes.length} 个门禁执行「${MODE_ACTION_LABEL[mode]}」？`))) return;
    setBusyCode("__batch__");
    try {
      const result = await executeDoorControl({ mode, channelCodeList: codes });
      const ok = !!(result && (result.success === true || result.success === "true"));
      const upstream = (result && (result.upstream as Record<string, any>)) || {};
      if (!ok) {
        toast.error(String(upstream.errMsg || upstream.message || "批量操作失败"));
      } else {
        codes.forEach((code) => applyOptimistic(code, mode));
        toast.success(`已对 ${codes.length} 个门禁下发「${MODE_ACTION_LABEL[mode]}」`);
      }
      await refreshStatuses(channels.filter((c) => codes.includes(String(c.channelCode || "").trim())));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量操作失败");
    } finally {
      setBusyCode("");
    }
  };

  const handleCreateRoot = async (name: string) => {
    try {
      await createDahuaDeviceChannelRemarkCategory({ name, sortOrder: 0, parentId: null });
      await reloadCategories();
      toast.success("已新建文件夹");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新建文件夹失败");
    }
  };

  const handleCreateChild = async (parentId: number, name: string) => {
    try {
      await createDahuaDeviceChannelRemarkCategory({ name, sortOrder: 0, parentId });
      setExpandedFolders((prev) => new Set(prev).add(parentId));
      await reloadCategories();
      toast.success("已新建子文件夹");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新建子文件夹失败");
    }
  };

  const handleRename = async (id: number, name: string) => {
    const cat = catById.get(id);
    if (!cat) return;
    try {
      await updateDahuaDeviceChannelRemarkCategory(id, {
        name,
        sortOrder: cat.sortOrder ?? 0,
        parentId: cat.parentId ?? null,
      });
      await reloadCategories();
      toast.success("已改名");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "改名失败");
    }
  };

  const handleMoveFolder = async (id: number, parentId: number) => {
    const cat = catById.get(id);
    if (!cat) return;
    try {
      await updateDahuaDeviceChannelRemarkCategory(id, {
        name: cat.name,
        sortOrder: cat.sortOrder ?? 0,
        parentId,
      });
      setExpandedFolders((prev) => new Set(prev).add(parentId));
      await reloadCategories();
      toast.success("文件夹已移动");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动文件夹失败");
    }
  };

  const handleDeleteFolder = async (id: number) => {
    try {
      await deleteDahuaDeviceChannelRemarkCategory(id);
      if (selectedFolderId === id) setSelectedFolderId(null);
      await reloadCategories();
      toast.success("文件夹已删除，内容已上移");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除文件夹失败");
    }
  };

  const openMoveChannel = (row: DahuaDeviceChannelRow) => {
    setMoveTarget(row);
    setMoveFolderId(row.remarkCategoryId != null ? String(row.remarkCategoryId) : "");
  };

  const confirmMoveChannel = async () => {
    if (!moveTarget) return;
    try {
      const targetId = moveFolderId === "" ? null : Number(moveFolderId);
      await patchDahuaDeviceChannelRemark(moveTarget.id, targetId);
      setChannels((prev) =>
        prev.map((c) => (c.id === moveTarget.id ? { ...c, remarkCategoryId: targetId ?? undefined } : c))
      );
      toast.success("门禁已移动");
      setMoveTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移动门禁失败");
    }
  };

  const renameChannelName = async (row: DahuaDeviceChannelRow) => {
    const code = String(row.channelCode || "").trim();
    if (!code) return;
    const full = row.channelName || "";
    const parsed = parseChannelName(full);
    const next = await appPrompt("修改门禁名称（楼层与编号保持不变）", parsed.name, { title: "修改名称" });
    if (next == null) return;
    const name = next.trim();
    if (!name) return;
    const fullName = [parsed.floor, name, parsed.code].filter(Boolean).join("-");
    if (fullName === full) return;
    if (fullName.length > 60) {
      toast.error("名称不能超过 60 个字符");
      return;
    }
    try {
      await renameDahuaChannel({ channelCode: code, channelName: fullName });
      setChannels((prev) => prev.map((c) => (c.id === row.id ? { ...c, channelName: fullName } : c)));
      toast.success("名称已更新");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "改名失败");
    }
  };

  const applyNormalize = async () => {
    if (normalizeCandidates.length === 0) return;
    setNormalizeApplying(true);
    try {
      const items = normalizeCandidates.map((c) => ({
        channelCode: String(c.row.channelCode || "").trim(),
        channelName: c.newName,
      }));
      const res = await batchRenameDahuaChannelsChunked(items, (done, total) =>
        toast.loading(`正在写入平台 ${done}/${total}`, { id: "normalize" })
      );
      const ok = res.successCount ?? items.length;
      toast.success(
        `已修正 ${ok} 个名称` + (res.failedCount ? `，失败 ${res.failedCount} 个` : ""),
        { id: "normalize" }
      );
      setNormalizeOpen(false);
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "修正名称失败");
    } finally {
      setNormalizeApplying(false);
    }
  };

  return (
    <AdminPageShell>
      <DndScope onDrop={() => {}}>
        <div className="flex gap-2" style={{ height: "calc(100vh - var(--admin-chrome-offset) - 8px)" }}>
          {!leftCollapsed && (
            <div className="flex w-64 shrink-0 flex-col gap-1.5">
              <AdminToolbarSearchField
                className="shrink-0"
                placeholder="搜索文件夹"
                value={treeKeyword}
                onChange={setTreeKeyword}
                onSubmit={() => {}}
              />
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => { setSelectedFolderId(null); setSelectedCode(""); }}
                  className={`flex-1 rounded px-1.5 py-1 text-[11px] ${
                    selectedFolderId == null
                      ? "bg-[var(--twin-primary-soft,#eef2ff)] font-semibold text-[var(--twin-primary)]"
                      : "border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  }`}
                >
                  全部 {channels.length}
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedFolderId(-1); setSelectedCode(""); }}
                  className={`flex-1 rounded px-1.5 py-1 text-[11px] ${
                    selectedFolderId === -1
                      ? "bg-[var(--twin-primary-soft,#eef2ff)] font-semibold text-[var(--twin-primary)]"
                      : "border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  }`}
                >
                  未分类 {unassignedChannels.length}
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1.5">
                {loading ? (
                  <DataSkeleton variant="table" rows={6} />
                ) : (
                  <FileFolderTree
                    tree={roots}
                    selectedId={selectedFolderId != null && selectedFolderId > 0 ? selectedFolderId : null}
                    expanded={expandedFolders}
                    keyword={treeKeyword}
                    onSelect={(id) => { setSelectedFolderId(id); setSelectedCode(""); }}
                    onToggle={(id) =>
                      setExpandedFolders((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    onCreateRoot={(name) => void handleCreateRoot(name)}
                    onCreateChild={(parentId, name) => void handleCreateChild(parentId, name)}
                    onRename={(id, name) => void handleRename(id, name)}
                    onMove={(id, parentId) => void handleMoveFolder(id, parentId)}
                    onDelete={(id) => void handleDeleteFolder(id)}
                    draggable={false}
                    droppable={false}
                    getIcon={() => <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                    deleteConfirmText={(n) =>
                      `确认删除文件夹「${n.name}」？其下子文件夹和门禁会移到上一级。`
                    }
                    renderMoveSelect={(p) => (
                      <select
                        className="h-9 w-full rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-sm"
                        defaultValue=""
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          if (!id) return;
                          const opt = folderOptions.find((f) => f.id === id);
                          if (opt) p.onChange(opt.path, id);
                        }}
                      >
                        <option value="">选择目标文件夹</option>
                        {folderOptions
                          .filter((f) => !p.excludeIds.has(f.id))
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {"　".repeat(Math.min(f.depth, 6))}{f.name}
                            </option>
                          ))}
                      </select>
                    )}
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="shrink-0 space-y-2 pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLeftCollapsed((v) => !v)}
                  className="rounded p-1 text-[var(--twin-mute)] hover:bg-[var(--twin-canvas)] hover:text-[var(--twin-ink)]"
                  title={leftCollapsed ? "展开文件夹" : "收起文件夹"}
                >
                  {leftCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[var(--twin-ink)]">门禁控制</div>
                  <div className="truncate text-[11px] text-[var(--twin-mute)]">
                    {selectedTitle} · {baseList.length} 门
                    {lastUpdated ? ` · 更新于 ${lastUpdated}` : ""}
                  </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <AdminToolbarSearchField
                    className="w-52"
                    placeholder="搜索门禁名称 / 编码"
                    value={keyword}
                    onChange={setKeyword}
                    onSubmit={() => {}}
                  />
                  <div className="flex items-center gap-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-0.5">
                    {STATUS_FILTERS.map((f) => {
                      const count = f.key ? counts[f.key] : counts.all;
                      return (
                        <button
                          key={f.key || "all"}
                          type="button"
                          onClick={() => setStatusFilter(f.key)}
                          className={`rounded px-2 py-1 text-[11px] font-semibold transition ${
                            statusFilter === f.key
                              ? "bg-[var(--twin-link-deep)] text-white shadow-sm"
                              : "text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
                          }`}
                        >
                          {f.label}
                          <span className="ml-1 text-[10px] opacity-80">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedCodes.size > 0 && (
                    <div className="flex items-center gap-0.5 rounded-twin-md border border-[var(--app-color-accent)] bg-[var(--twin-canvas)] px-1.5 py-0.5">
                      <span className="mr-1 text-[11px] font-semibold text-[var(--app-color-accent)]">
                        已选 {selectedCodes.size}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            disabled={busyCode === "__batch__"}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)] disabled:opacity-40"
                          >
                            批量操作
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {(["OPEN", "CLOSE", "STAY_OPEN", "STAY_CLOSE", "NORMAL"] as Mode[]).map((m) => (
                            <DropdownMenuItem key={m} onSelect={() => void runBatch(m)}>
                              {MODE_ACTION_LABEL[m]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <span className="mx-0.5 h-4 w-px bg-[var(--twin-hairline)]" />
                      <button
                        type="button"
                        onClick={() => void saveGroup()}
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
                      >
                        编组
                      </button>
                      <button
                        type="button"
                        title="清空选择"
                        aria-label="清空选择"
                        onClick={() => setSelectedCodes(new Set())}
                        className="rounded p-0.5 text-[var(--twin-mute)] transition hover:text-[var(--twin-ink)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {groups.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] px-2 text-[11px] font-semibold text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          编组 {groups.length}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-72 overflow-auto">
                        {groups.map((g) => (
                          <DropdownMenuItem
                            key={g.id}
                            onSelect={() => {
                              setSelectedCodes(new Set(g.channelCodes));
                              toast.success(`已载入编组「${g.name}」（${g.channelCodes.length} 门）`);
                            }}
                            className="flex items-center gap-2"
                          >
                            <span className="min-w-0 flex-1 truncate">{g.name}</span>
                            <span className="shrink-0 text-[10px] text-[var(--twin-mute)]">{g.channelCodes.length}</span>
                            <button
                              type="button"
                              title="删除编组"
                              aria-label="删除编组"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteGroup(g.id, g.name);
                              }}
                              className="shrink-0 rounded p-0.5 text-[var(--app-color-feedback-danger-ink)] hover:bg-[var(--app-color-feedback-danger-soft)]"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <AdminButton tone="ghost" onClick={() => void refreshStatuses(channels)} disabled={statusLoading}>
                    <RefreshCw className={`mr-1 h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`} />
                    刷新
                  </AdminButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title="更多"
                        aria-label="更多"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-twin-sm border border-[var(--twin-hairline)] text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setNormalizeOpen(true)}>
                        <Regex className="mr-2 h-3.5 w-3.5" />
                        修正名称
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AdminButton onClick={() => navigate("/console/admin/door-control/person-auth")}>
                    <UserCheck className="mr-1 h-3.5 w-3.5" />
                    人员授权
                  </AdminButton>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {loading ? (
                <DataSkeleton variant="card" rows={4} cols={3} />
              ) : visible.length === 0 ? (
                <div className="flex h-40 items-center justify-center rounded-twin-lg border border-dashed border-[var(--twin-hairline)] text-sm text-[var(--twin-mute)]">
                  当前文件夹下没有匹配的门禁
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                  {visible.map((row) => {
                    const { code, offline, pending, mode, text, icon, chip } = infoOf(row);
                    const busy = busyCode === code;
                    const path = row.remarkCategoryId != null ? pathById.get(Number(row.remarkCategoryId)) : "";
                    const modeText = !pending && !offline && mode ? STATUS_TEXT[mode] : "模式";
                    return (
                      <div
                        key={`${row.id}-${code}`}
                        className={`relative flex flex-col rounded-twin-lg border bg-[var(--twin-canvas)] p-2.5 transition hover:shadow-md ${
                          selectedCodes.has(code)
                            ? "border-[var(--app-color-accent)] ring-1 ring-[var(--app-color-accent)]"
                            : "border-[var(--twin-hairline)]"
                        } ${offline ? "opacity-80" : ""}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={selectedCodes.has(code)}
                            aria-label="选择该门禁"
                            title="选择该门禁"
                            onClick={() => toggleSelect(code)}
                            className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded border transition ${
                              selectedCodes.has(code)
                                ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-white"
                                : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-transparent hover:border-[var(--app-color-accent)]"
                            }`}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--twin-canvas-soft)]">
                            <img src={icon} alt="" className="h-7 w-7" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-bold text-[var(--twin-ink)]" title={row.channelName}>
                              {displayFloorAndName(row.channelName || "") || "未命名通道"}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-[var(--twin-mute)]">
                              <Folder className="h-3 w-3 shrink-0" />
                              <span className="truncate">{path || "未分类"}</span>
                              <span className="truncate font-mono opacity-70">{code}</span>
                            </div>
                          </div>
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${chip}`}>
                            {busy && <RefreshCw className="h-2.5 w-2.5 animate-spin" />}
                            {text}
                          </span>
                        </div>

                        <div className="mt-2 flex items-center gap-1.5">
                          {/* 一次性动作：一个分割按钮，左开右关，尺寸压到最小 */}
                          <div className="inline-flex h-7 overflow-hidden rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
                            <button
                              type="button"
                              disabled={offline || busy}
                              onClick={() => void runAction(row, "OPEN")}
                              className="px-2 text-[11px] font-semibold text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              开门
                            </button>
                            <button
                              type="button"
                              disabled={offline || busy}
                              onClick={() => void runAction(row, "CLOSE")}
                              className="border-l border-[var(--twin-hairline)] px-2 text-[11px] font-semibold text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              关门
                            </button>
                          </div>

                          {/* 模式：悬停展开小菜单 */}
                          <div
                            className="relative"
                            onMouseEnter={() => setModeMenuCode(code)}
                            onMouseLeave={() => setModeMenuCode("")}
                          >
                            <button
                              type="button"
                              disabled={offline || busy}
                              onClick={() => setModeMenuCode((v) => (v === code ? "" : code))}
                              className="inline-flex h-7 items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-[11px] font-semibold text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {modeText}
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            {modeMenuCode === code && !offline && !busy && (
                              <div className="absolute right-0 top-full z-30 mt-1 w-24 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1 shadow-lg">
                                {(["STAY_OPEN", "STAY_CLOSE", "NORMAL"] as Mode[]).map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => void runAction(row, m)}
                                    className="flex w-full items-center justify-between rounded px-2 py-1 text-[11px] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                                  >
                                    {MODE_LABEL[m]}
                                    {mode === m && <Check className="h-3 w-3 text-[var(--app-color-accent)]" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="ml-auto flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void renameChannelName(row)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-twin-sm border border-[var(--twin-hairline)] text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                              title="修改通道名称"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openMoveChannel(row)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-twin-sm border border-[var(--twin-hairline)] text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
                              title="移动到文件夹"
                            >
                              <FolderInput className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </DndScope>

      {moveTarget && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-xl">
              <div className="text-base font-bold text-[var(--twin-ink)]">移动门禁到文件夹</div>
              <div className="mt-1 truncate text-xs text-[var(--twin-mute)]">
                {moveTarget.channelName || moveTarget.channelCode}
              </div>
              <select
                className="mt-3 h-9 w-full rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 text-sm"
                value={moveFolderId}
                onChange={(e) => setMoveFolderId(e.target.value)}
              >
                <option value="">未分类</option>
                {folderOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {"　".repeat(Math.min(f.depth, 6))}{f.name}
                  </option>
                ))}
              </select>
              <div className="mt-4 flex justify-end gap-2">
                <AdminButton tone="ghost" onClick={() => setMoveTarget(null)}>取消</AdminButton>
                <AdminButton onClick={() => void confirmMoveChannel()}>确认移动</AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {normalizeOpen && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--twin-hairline)] p-3">
                <div>
                  <div className="text-base font-bold text-[var(--twin-ink)]">修正名称</div>
                  <div className="text-xs text-[var(--twin-mute)]">
                    把缺分隔符的名称补上 `-`，统一成「名称-楼层-编号」，共 {normalizeCandidates.length} 个（只加分隔符，不丢任何字节）
                  </div>
                </div>
                <AdminButton tone="ghost" onClick={() => setNormalizeOpen(false)}>关闭</AdminButton>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                {normalizeCandidates.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[var(--twin-mute)]">没有需要修正的名称</div>
                ) : (
                  <div className="space-y-0.5">
                    {normalizeCandidates.map((c) => (
                      <div
                        key={`${c.row.id}-${c.row.channelCode}`}
                        className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-[var(--twin-canvas-soft)]"
                      >
                        <span className="min-w-0 flex-1 truncate text-[var(--twin-mute)]">{c.oldName}</span>
                        <span className="shrink-0 text-[var(--twin-mute)]">→</span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-[var(--twin-ink)]">{c.newName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--twin-hairline)] p-3">
                <span className="mr-auto text-xs text-[var(--twin-mute)]">应用后批量下发到平台</span>
                <AdminButton tone="ghost" onClick={() => setNormalizeOpen(false)}>取消</AdminButton>
                <AdminButton onClick={() => void applyNormalize()} loading={normalizeApplying} disabled={normalizeCandidates.length === 0}>
                  应用修正
                </AdminButton>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </AdminPageShell>
  );
}
