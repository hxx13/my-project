import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Hls from "hls.js";
import {
  Hash,
  ExternalLink,
  FolderPlus,
  History,
  Loader2,
  Maximize,
  Minimize,
  MonitorPlay,
  MoreHorizontal,
  PanelLeftOpen,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminFormInput } from "@/components/admin/AdminFormPrimitives";
import { Tree } from "@/components/tree/Tree";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VideoCategoryTreeSelect, type VideoTreeOption } from "@/features/video-wall/VideoCategoryTreeSelect";
import PlaybackPanel from "@/features/video-wall/PlaybackPanel";
import {
  assignChannelCategory,
  createVideoCategory,
  deleteVideoCategory,
  fetchVideoCategories,
  fetchVideoChannels,
  rebuildVideoCategories,
  renameVideoCategory,
  setChannelLink,
  type VideoCategoryNode,
  type VideoChannel,
} from "@/api/domains/videoWall.api";
import { renameDahuaChannel, batchRenameDahuaChannelsChunked } from "@/api/twinApi";
import { displayFloorAndName, normalizeChannelName, parseChannelName } from "@/utils/dahuaChannelName";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import {
  fetchActivePreviews,
  previewHlsUrl,
  startVideoPreview,
  stopVideoPreview,
  type PreviewStreamType,
} from "@/api/domains/videoPreview.api";
import { authStorage } from "@/features/auth/authStorage";
import { cn } from "@/lib/utils";

const MAX_SLOTS = 4;
const UNASSIGNED_ID = -1;

type CatNode = VideoCategoryNode & { children: CatNode[] };

type SlotPhase = "idle" | "starting" | "playing" | "error";

type SlotState = {
  channel: VideoChannel | null;
  sessionId: string | null;
  hlsUrl: string | null;
  phase: SlotPhase;
  error?: string;
};

const emptySlot = (): SlotState => ({
  channel: null,
  sessionId: null,
  hlsUrl: null,
  phase: "idle",
});

/** 单画面固定主码流；四画面由「高清化」开关决定主/子码流 */
const streamTypeFor = (layout: 1 | 4, hd: boolean): PreviewStreamType =>
  layout === 1 || hd ? "main" : "sub";

/** 融合屏投屏输入 1_1～1_8，实际取大屏的 8 个输入槽位 */
const TV_WALL_OUTPUT_SOURCE: Record<string, string> = {
  "1000072$2$0$0": "1000072$1$0$32", // 1_1 -> 槽位02-01
  "1000072$2$0$1": "1000072$1$0$33", // 1_2 -> 槽位02-02
  "1000072$2$0$2": "1000072$1$0$34", // 1_3 -> 槽位02-03
  "1000072$2$0$3": "1000072$1$0$35", // 1_4 -> 槽位02-04
  "1000072$2$0$4": "1000072$1$0$96", // 1_5 -> 槽位04-01
  "1000072$2$0$5": "1000072$1$0$97", // 1_6 -> 槽位04-02
  "1000072$2$0$6": "1000072$1$0$98", // 1_7 -> 槽位04-03
  "1000072$2$0$7": "1000072$1$0$99", // 1_8 -> 槽位04-04
};

const sourceCodeOf = (channel: { channelCode: string }) =>
  TV_WALL_OUTPUT_SOURCE[channel.channelCode] ?? channel.channelCode;

/** 通过事件让 AdminLayout 收起/恢复后台侧栏 */
function setAdminSidebarCollapsed(collapsed: boolean) {
  window.dispatchEvent(new CustomEvent("twin:admin-sidebar-collapsed", { detail: collapsed }));
}

function PreviewPlayer({ hlsUrl }: { hlsUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setError(null);

    if (!Hls.isSupported()) {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
        void video.play().catch(() => {});
        return () => {
          video.removeAttribute("src");
          video.load();
        };
      }
      setError("当前浏览器不支持视频播放（MSE）");
      return;
    }

    const hls = new Hls({
      liveSyncDurationCount: 2,
      xhrSetup: (xhr) => {
        const token = authStorage.getToken();
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      },
      // hls.js 新版本走 fetch loader，只有 xhrSetup 不会带上登录头；
      // 播放列表和切片都在 /api/v1 下，必须逐请求补 Authorization。
      fetchSetup: (context, initParams) => {
        const headers = new Headers(initParams.headers);
        const token = authStorage.getToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return new Request(context.url, { ...initParams, headers });
      },
    });
    hls.loadSource(hlsUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void video.play().catch(() => {});
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      setError(data.details || "播放失败");
      hls.destroy();
    });

    return () => hls.destroy();
  }, [hlsUrl]);

  return (
    <>
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-full w-full bg-black object-contain"
      />
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center text-xs text-white/80">
          {error}
        </div>
      ) : null}
    </>
  );
}

export default function AdminLivePreviewPage() {
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [layout, setLayout] = useState<1 | 4>(1);
  const [hd, setHd] = useState(false);
  const [mode, setMode] = useState<"live" | "playback">("live");
  const [playbackChannel, setPlaybackChannel] = useState<VideoChannel | null>(null);
  const [slots, setSlots] = useState<SlotState[]>(() =>
    Array.from({ length: MAX_SLOTS }, emptySlot)
  );
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const focusModeRef = useRef(false);
  focusModeRef.current = focusMode;
  const sidebarWasCollapsedRef = useRef(false);
  const qc = useQueryClient();
  const [moveTarget, setMoveTarget] = useState<VideoChannel | null>(null);
  const [normalizeOpen, setNormalizeOpen] = useState(false);
  const [normalizeApplying, setNormalizeApplying] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  /** 每个格子一个操作序号：异步返回时若格子已被换掉，就丢弃这次结果 */
  const opRef = useRef<number[]>(Array(MAX_SLOTS).fill(0));

  const channelsQ = useQuery({
    queryKey: ["tvwall", "channels"],
    queryFn: fetchVideoChannels,
    staleTime: 60_000,
  });
  const catsQ = useQuery({
    queryKey: ["tvwall", "categories"],
    queryFn: fetchVideoCategories,
  });
  const activeQ = useQuery({
    queryKey: ["videoPreviewActive"],
    queryFn: fetchActivePreviews,
    refetchInterval: 20_000,
    retry: false,
  });

  const channels = useMemo(() => {
    const base = channelsQ.data ?? [];
    const template = base.find((c) => c.channelName === "1_1");
    if (!template) return base;
    // 缓存里只同步到 1_1～1_6；1_7/1_8 是同一台大屏的另外两个输入槽位
    const extra = ["1_7", "1_8"].map((name, i) => ({
      ...template,
      id: -1 - i,
      channelCode: `1000072$2$0$${6 + i}`,
      channelName: name,
    }));
    return [...base, ...extra.filter((e) => !base.some((c) => c.channelCode === e.channelCode))];
  }, [channelsQ.data]);

  const filteredChannels = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return channels;
    return channels.filter(
      (c) =>
        c.channelName.toLowerCase().includes(k) ||
        displayFloorAndName(c.channelName).toLowerCase().includes(k) ||
        c.channelCode.toLowerCase().includes(k)
    );
  }, [channels, keyword]);

  /** 扁平分类拼成树，按 sortOrder 排序 */
  const catTree = useMemo(() => {
    const byId = new Map<number, CatNode>();
    const roots: CatNode[] = [];
    for (const n of catsQ.data ?? []) byId.set(n.id, { ...n, children: [] });
    for (const n of catsQ.data ?? []) {
      const self = byId.get(n.id);
      if (!self) continue;
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      if (parent) parent.children.push(self);
      else roots.push(self);
    }
    const sortRec = (list: CatNode[]) => {
      list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id);
      list.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  }, [catsQ.data]);

  const moveOptions = useMemo<VideoTreeOption[]>(() => {
    const conv = (list: CatNode[]): VideoTreeOption[] =>
      list.map((n) => ({ id: n.id, name: n.name, children: conv(n.children) }));
    return conv(catTree);
  }, [catTree]);

  const { byNode, unassigned } = useMemo(() => {
    const nodeIds = new Set((catsQ.data ?? []).map((n) => n.id));
    const map = new Map<number, VideoChannel[]>();
    const rest: VideoChannel[] = [];
    for (const c of filteredChannels) {
      if (c.videoCategoryId != null && nodeIds.has(c.videoCategoryId)) {
        const arr = map.get(c.videoCategoryId);
        if (arr) arr.push(c);
        else map.set(c.videoCategoryId, [c]);
      } else {
        rest.push(c);
      }
    }
    return { byNode: map, unassigned: rest };
  }, [filteredChannels, catsQ.data]);

  const { shownTree, searchExpanded } = useMemo(() => {
    if (!keyword.trim()) {
      return { shownTree: catTree, searchExpanded: null as Set<number> | null };
    }
    const parentOf = new Map<number, number>();
    for (const n of catsQ.data ?? []) parentOf.set(n.id, n.parentId);
    const keep = new Set<number>();
    for (const [nodeId, list] of byNode) {
      if (!list.length) continue;
      keep.add(nodeId);
      let p = parentOf.get(nodeId);
      while (p) {
        keep.add(p);
        p = parentOf.get(p);
      }
    }
    const prune = (list: CatNode[]): CatNode[] =>
      list
        .filter((n) => keep.has(n.id))
        .map((n) => ({ ...n, children: prune(n.children) }));
    return { shownTree: prune(catTree), searchExpanded: keep };
  }, [catTree, byNode, keyword, catsQ.data]);

  const nodesForTree = useMemo<CatNode[]>(() => {
    if (!unassigned.length) return shownTree;
    return [
      ...shownTree,
      {
        id: UNASSIGNED_ID,
        parentId: 0,
        name: "未分类",
        sortOrder: 9999,
        channelCount: unassigned.length,
        children: [],
      },
    ];
  }, [shownTree, unassigned.length]);

  const expandedIds = keyword.trim() ? searchExpanded ?? new Set<number>() : expanded;

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const channelsUnder = (node: CatNode) =>
    node.id === UNASSIGNED_ID ? unassigned : byNode.get(node.id) ?? [];

  /** 每个文件夹的在线/总数，父文件夹含子文件夹累加；用未过滤的全量通道算 */
  const statsByNode = useMemo(() => {
    const nodeIds = new Set((catsQ.data ?? []).map((n) => n.id));
    const direct = new Map<number, { total: number; online: number }>();
    for (const c of channels) {
      if (c.videoCategoryId == null || !nodeIds.has(c.videoCategoryId)) continue;
      const e = direct.get(c.videoCategoryId) ?? { total: 0, online: 0 };
      e.total += 1;
      if (c.isOnline === 1) e.online += 1;
      direct.set(c.videoCategoryId, e);
    }
    const out = new Map<number, { total: number; online: number }>();
    const roll = (n: CatNode): { total: number; online: number } => {
      const own = direct.get(n.id) ?? { total: 0, online: 0 };
      let total = own.total;
      let online = own.online;
      for (const child of n.children) {
        const r = roll(child);
        total += r.total;
        online += r.online;
      }
      out.set(n.id, { total, online });
      return { total, online };
    };
    catTree.forEach(roll);
    return out;
  }, [channels, catsQ.data, catTree]);

  const statsOf = (node: CatNode) => {
    if (node.id !== UNASSIGNED_ID) return statsByNode.get(node.id);
    const list = channels.filter((c) => c.videoCategoryId == null);
    return { total: list.length, online: list.filter((c) => c.isOnline === 1).length };
  };

  const renderOnlineSuffix = (node: CatNode) => {
    const stats = statsOf(node);
    if (!stats || !stats.total) return null;
    const offline = stats.total - stats.online;
    return (
      <span
        className={cn(
          "shrink-0 pl-2 text-[10px] tabular-nums",
          offline > 0
            ? "font-medium text-[var(--app-color-feedback-danger-ink)]"
            : "text-[var(--app-color-text-tertiary)]"
        )}
      >
        {stats.online}/{stats.total}
        {offline > 0 ? ` · ${offline} 离线` : ""}
      </span>
    );
  };

  const invalidateChannelTree = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["tvwall", "channels"] });
    qc.invalidateQueries({ queryKey: ["tvwall", "categories"] });
  }, [qc]);

  const addFolderM = useMutation({
    mutationFn: ({ parentId, name }: { parentId: number | null; name: string }) =>
      createVideoCategory({ parentId, name }),
    onSuccess: (_d, v) => {
      toast.success("已新建文件夹");
      if (v.parentId != null) {
        setExpanded((prev) => new Set(prev).add(v.parentId as number));
      }
      invalidateChannelTree();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "新建失败"),
  });

  const renameFolderM = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameVideoCategory(id, name),
    onSuccess: () => {
      toast.success("已重命名");
      invalidateChannelTree();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "重命名失败"),
  });

  const deleteFolderM = useMutation({
    mutationFn: (id: number) => deleteVideoCategory(id),
    onSuccess: () => {
      toast.success("已删除文件夹");
      invalidateChannelTree();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  const assignM = useMutation({
    mutationFn: ({ id, categoryId }: { id: number; categoryId: number | null }) =>
      assignChannelCategory(id, categoryId),
    onSuccess: () => {
      toast.success("已移动");
      invalidateChannelTree();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "移动失败"),
  });

  const linkM = useMutation({
    mutationFn: ({ id, url }: { id: number; url: string }) => setChannelLink(id, url),
    onSuccess: () => {
      toast.success("跳转地址已保存");
      invalidateChannelTree();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  const askRenameFolder = async (node: CatNode) => {
    const name = await appPrompt("修改文件夹名称", node.name, { title: "重命名" });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) return;
    renameFolderM.mutate({ id: node.id, name: trimmed });
  };

  const askDeleteFolder = async (node: CatNode) => {
    if (!(await appConfirm(`确定删除文件夹「${node.name}」？里面的通道会回到「未分类」。`, { danger: true }))) return;
    deleteFolderM.mutate(node.id);
  };

  const askSetLink = async (channel: VideoChannel) => {
    const v = await appPrompt(
      "设备跳转地址（可只填 IP，如 172.22.160.2）",
      (channel.linkUrl ?? "").trim(),
      { title: "跳转地址" }
    );
    if (v == null) return;
    linkM.mutate({ id: channel.id, url: v.trim() });
  };

  const renameChannel = async (channel: VideoChannel) => {
    // 只改「名称」部分，楼层与编号保持原样，避免破坏取名规则
    const parsed = parseChannelName(channel.channelName);
    const next = await appPrompt("备注名称（楼层与编号保持不变）", parsed.name, { title: "修改名称" });
    if (next == null) return;
    const name = next.trim();
    if (!name) return;
    const fullName = [parsed.floor, name, parsed.code].filter(Boolean).join("-");
    if (fullName === channel.channelName) return;
    if (fullName.length > 60) {
      toast.error("通道名称不能超过 60 个字符");
      return;
    }
    try {
      await renameDahuaChannel({ channelCode: channel.channelCode, channelName: fullName });
      toast.success("通道名称已更新");
      setSlots((prev) =>
        prev.map((s) =>
          s.channel && s.channel.channelCode === channel.channelCode
            ? { ...s, channel: { ...s.channel, channelName: fullName } }
            : s
        )
      );
      invalidateChannelTree();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "改名失败");
    }
  };

  /** 关闭/离开页面时用 keepalive 请求停流；切后台或标签页不会触发，后台播放继续 */
  useEffect(() => {
    const stopAllOnHide = () => {
      const token = authStorage.getToken();
      for (const slot of slotsRef.current) {
        if (!slot.sessionId) continue;
        void fetch("/api/v1/dahua/preview/stop", {
          method: "POST",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sessionId: slot.sessionId }),
        });
      }
    };
    window.addEventListener("pagehide", stopAllOnHide);
    return () => window.removeEventListener("pagehide", stopAllOnHide);
  }, []);

  const enterFocusMode = useCallback(() => {
    try {
      sidebarWasCollapsedRef.current =
        localStorage.getItem("aro-admin-sidebar-collapsed") === "1";
    } catch {
      sidebarWasCollapsedRef.current = false;
    }
    setFocusMode(true);
    setListOpen(false);
    setAdminSidebarCollapsed(true);
  }, []);

  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    setListOpen(true);
    setAdminSidebarCollapsed(sidebarWasCollapsedRef.current);
  }, []);

  const toggleFocusMode = useCallback(() => {
    if (focusMode) exitFocusMode();
    else enterFocusMode();
  }, [enterFocusMode, exitFocusMode, focusMode]);

  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      exitFocusMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitFocusMode, focusMode]);

  useEffect(() => {
    return () => {
      if (focusModeRef.current) {
        setAdminSidebarCollapsed(sidebarWasCollapsedRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const slot of slotsRef.current) {
        if (slot.sessionId) void stopVideoPreview(slot.sessionId).catch(() => {});
      }
    };
  }, []);

  const clearSlot = useCallback((index: number) => {
    opRef.current[index] += 1;
    const current = slotsRef.current[index];
    if (current.sessionId) void stopVideoPreview(current.sessionId).catch(() => {});
    setSlots((prev) => prev.map((s, i) => (i === index ? emptySlot() : s)));
  }, []);

  const clearAll = useCallback(() => {
    for (let i = 0; i < MAX_SLOTS; i += 1) {
      opRef.current[i] += 1;
      const current = slotsRef.current[i];
      if (current.sessionId) void stopVideoPreview(current.sessionId).catch(() => {});
    }
    setSlots(Array.from({ length: MAX_SLOTS }, emptySlot));
  }, []);

  const togglePlaybackMode = useCallback(() => {
    if (mode === "live") {
      const current = slotsRef.current.find((slot) => slot.channel)?.channel ?? null;
      clearAll();
      setLayout(1);
      setMode("playback");
      setPlaybackChannel(current);
    } else {
      setMode("live");
      setPlaybackChannel(null);
    }
  }, [clearAll, mode]);


  const assign = useCallback(async (index: number, channel: VideoChannel, streamType: PreviewStreamType) => {
    if (mode === "playback") {
      setPlaybackChannel(channel);
      return;
    }
    const duplicate = slotsRef.current.some(
      (slot, i) => i !== index && slot.channel && sourceCodeOf(slot.channel) === sourceCodeOf(channel)
    );
    if (duplicate) {
      toast("该通道已在画面中");
      return;
    }
    const op = opRef.current[index] + 1;
    opRef.current[index] = op;

    const previous = slotsRef.current[index];
    if (previous.sessionId) void stopVideoPreview(previous.sessionId).catch(() => {});

    setSlots((prev) =>
      prev.map((s, i) =>
        i === index
          ? { channel, sessionId: null, hlsUrl: null, phase: "starting" }
          : s
      )
    );

    try {
      const session = await startVideoPreview(sourceCodeOf(channel), streamType);
      if (opRef.current[index] !== op) {
        void stopVideoPreview(session.sessionId).catch(() => {});
        return;
      }
      setSlots((prev) =>
        prev.map((s, i) =>
          i === index
            ? {
                channel,
                sessionId: session.sessionId,
                hlsUrl: previewHlsUrl(session.hlsUrl),
                phase: "playing",
              }
            : s
        )
      );
    } catch (err) {
      if (opRef.current[index] !== op) return;
      const message = err instanceof Error ? err.message : "取流失败";
      setSlots((prev) =>
        prev.map((s, i) =>
          i === index ? { channel, sessionId: null, hlsUrl: null, phase: "error", error: message } : s
        )
      );
    }
  }, [mode]);

  /** 切分画面：1 路固定主码流；4 路由「高清化」开关决定主/子码流，切换时按新码流重开 */
  const changeLayout = useCallback(
    (next: 1 | 4) => {
      if (next === layout) return;
      const streamType = streamTypeFor(next, hd);
      for (let i = next; i < MAX_SLOTS; i += 1) {
        opRef.current[i] += 1;
        const slot = slotsRef.current[i];
        if (slot.sessionId) void stopVideoPreview(slot.sessionId).catch(() => {});
      }
      setSlots((prev) => prev.map((s, i) => (i >= next ? emptySlot() : s)));
      for (let i = 0; i < next; i += 1) {
        const slot = slotsRef.current[i];
        if (slot.channel) void assign(i, slot.channel, streamType);
      }
      setLayout(next);
    },
    [assign, hd, layout]
  );

  /** 四画面高清化开关：只影响四画面，单画面本来就是主码流 */
  const toggleHd = useCallback(() => {
    const next = !hd;
    setHd(next);
    if (layout !== 4) return;
    const streamType: PreviewStreamType = next ? "main" : "sub";
    for (let i = 0; i < layout; i += 1) {
      const slot = slotsRef.current[i];
      if (slot.channel) void assign(i, slot.channel, streamType);
    }
  }, [assign, hd, layout]);

  const assignFirstEmpty = useCallback(
    (channel: VideoChannel) => {
      const index = slotsRef.current.findIndex((s, i) => i < layout && !s.channel);
      if (index < 0) {
        toast("画面已满，先移除一个");
        return;
      }
      void assign(index, channel, streamTypeFor(layout, hd));
    },
    [assign, hd, layout]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number) => {
      event.preventDefault();
      setOverIndex(null);
      const code = event.dataTransfer.getData("text/plain");
      const channel = channels.find((c) => c.channelCode === code);
      if (channel) void assign(index, channel, streamTypeFor(layout, hd));
    },
    [assign, channels, hd, layout]
  );

  const normalizeCandidates = useMemo(
    () =>
      channels
        .filter((c) => c.id > 0) // 占位槽位（id 为负）不是真实通道，不参与改名
        .map((c) => ({ row: c, oldName: c.channelName, newName: normalizeChannelName(c.channelName) }))
        .filter((c) => c.newName !== c.oldName),
    [channels]
  );

  const applyNormalize = async () => {
    if (normalizeCandidates.length === 0) return;
    setNormalizeApplying(true);
    try {
      const res = await batchRenameDahuaChannelsChunked(
        normalizeCandidates.map((c) => ({ channelCode: c.row.channelCode, channelName: c.newName })),
        (done, total) => toast.loading(`正在写入平台 ${done}/${total}`, { id: "normalize" })
      );
      const ok = res.successCount ?? normalizeCandidates.length;
      toast.success(
        `已修正 ${ok} 个名称` + (res.failedCount ? `，失败 ${res.failedCount} 个` : ""),
        { id: "normalize" }
      );
      setNormalizeOpen(false);
      await qc.invalidateQueries({ queryKey: ["tvwall", "channels"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "修正名称失败");
    } finally {
      setNormalizeApplying(false);
    }
  };

  const rebuildCategories = async () => {
    if (
      !(await appConfirm(
        "将按通道名重新分「楼层 → 相机组」，现有分类与手工调整会被覆盖，确定重建？",
        { title: "重建监控分类", danger: true }
      ))
    ) {
      return;
    }
    setRebuilding(true);
    try {
      const res = await rebuildVideoCategories();
      toast.success(`分类已重建：${res.nodes ?? 0} 个节点 / ${res.channels ?? 0} 路通道`);
      await qc.invalidateQueries({ queryKey: ["tvwall", "categories"] });
      await qc.invalidateQueries({ queryKey: ["tvwall", "channels"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重建分类失败");
    } finally {
      setRebuilding(false);
    }
  };

  const renderChannelRow = (channel: VideoChannel) => (
    <div
      key={channel.channelCode}
      className="flex items-center gap-1 rounded-twin-sm pr-0.5"
    >
      <button
        type="button"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/plain", channel.channelCode);
          event.dataTransfer.effectAllowed = "copy";
        }}
        onDoubleClick={() => assignFirstEmpty(channel)}
        onClick={() => {
          if (mode === "playback") setPlaybackChannel(channel);
        }}
        title={`${displayFloorAndName(channel.channelName)}（编号 ${channel.channelCode}）\n原名：${channel.channelName}`}
        className="flex min-w-0 flex-1 items-center gap-1.5 truncate rounded-twin-sm px-1 py-1 text-left text-[12px] text-[var(--app-color-text-primary)] transition hover:bg-[var(--app-color-surface-hover)]"
      >
        <span
          className={cn(
            "h-1.5 w-1.5 shrink-0 rounded-full",
            channel.isOnline === 1
              ? "bg-emerald-500"
              : "bg-[var(--app-color-text-tertiary)]"
          )}
          aria-label={channel.isOnline === 1 ? "在线" : "离线"}
        />
        <span className="min-w-0 flex-1 truncate">{displayFloorAndName(channel.channelName)}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="更多"
            className="shrink-0 rounded p-0.5 text-[var(--app-color-text-tertiary)] transition hover:text-[var(--app-color-text-primary)]"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-max min-w-[14rem]">
          <DropdownMenuItem onSelect={() => void renameChannel(channel)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            备注名称…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] font-normal text-[var(--app-color-text-tertiary)]">
            取名规则解析
          </DropdownMenuLabel>
          <div className="px-2 pb-1 text-[11px] text-[var(--app-color-text-secondary)]">
            {(() => {
              const p = parseChannelName(channel.channelName);
              return [
                p.floor && `楼层 ${p.floor}`,
                p.name && `名称 ${p.name}`,
                p.code && `编号 ${p.code}`,
              ]
                .filter(Boolean)
                .join(" · ") || "未识别到楼层/编号";
            })()}
          </div>
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard?.writeText(channel.channelCode);
              toast.success("已复制通道编号");
            }}
          >
            <Hash className="mr-2 h-3.5 w-3.5" />
            <span className="text-[var(--app-color-text-tertiary)]">通道编号</span>
            <span className="ml-2 font-mono text-[11px] text-[var(--app-color-text-primary)]">
              {channel.channelCode}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void askSetLink(channel)}>
            {channel.linkUrl ? (
              <a
                href={channel.linkUrl}
                target="_blank"
                rel="noreferrer"
                title={`打开设备页面：${channel.linkUrl}`}
                aria-label="打开设备页面"
                onClick={(event) => event.stopPropagation()}
                className="mr-2 inline-flex rounded p-0.5 text-[var(--app-color-accent)] transition hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-accent-hover)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
            )}
            {channel.linkUrl ? "修改跳转地址…" : "设置跳转地址…"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setMoveTarget(channel)}>
            <FolderPlus className="mr-2 h-3.5 w-3.5" />
            移动到文件夹…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <AdminPageShell>
      <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 gap-4">
        {(!focusMode || listOpen) && (
          <div className="w-72 shrink-0">
            <AdminFormCard fill className="h-full">
          <div className="relative mb-2 px-1 pt-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
            <AdminFormInput
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜通道名称"
              aria-label="搜索通道名称"
              className="py-1.5 pl-8 text-xs"
            />
          </div>
          <div className="mb-2 flex items-center gap-1 px-1 text-[11px]">
            <button
              type="button"
              onClick={() => setNormalizeOpen(true)}
              className="rounded border border-[var(--app-color-border-default)] px-1.5 py-0.5 text-[var(--app-color-text-secondary)] transition hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]"
            >
              修正名称
            </button>
            <button
              type="button"
              onClick={() => void rebuildCategories()}
              disabled={rebuilding}
              className="rounded border border-[var(--app-color-border-default)] px-1.5 py-0.5 text-[var(--app-color-text-secondary)] transition hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)] disabled:opacity-50"
            >
              {rebuilding ? "重建中…" : "重建分类"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-y-contain [scrollbar-gutter:stable]">
            {channelsQ.isLoading ? (
              <p className="p-2 text-xs text-[var(--app-color-text-tertiary)]">加载中…</p>
            ) : channels.length === 0 ? (
              <p className="p-2 text-xs text-[var(--app-color-text-tertiary)]">
                没有通道。可能还没刷新通道缓存（门禁/元数据页可触发刷新）。
              </p>
            ) : (
              <Tree<CatNode>
                nodes={nodesForTree}
                getId={(node) => node.id}
                getName={(node) => node.name}
                renderSuffix={renderOnlineSuffix}
                getChildren={(node) => node.children}
                expandable={(node) => node.children.length > 0 || channelsUnder(node).length > 0}
                selectedId={null}
                expanded={expandedIds}
                onSelect={(id) => {
                  if (expandedIds.has(id)) toggleExpand(id);
                }}
                onToggle={toggleExpand}
                renderMenu={(node, helpers) =>
                  node.id === UNASSIGNED_ID ? (
                    <DropdownMenuLabel>未分类</DropdownMenuLabel>
                  ) : (
                    <>
                      <DropdownMenuItem onSelect={helpers.startCreateChild}>
                        <FolderPlus className="mr-2 h-3.5 w-3.5" />
                        新建子文件夹
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void askRenameFolder(node)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />
                        重命名
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => void askDeleteFolder(node)}
                        className="text-[var(--app-color-feedback-error)]"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        删除文件夹
                      </DropdownMenuItem>
                    </>
                  )
                }
                renderExtras={(node, depth) => {
                  const list = channelsUnder(node);
                  if (!list.length) return null;
                  return (
                    <div className="space-y-0.5" style={{ paddingLeft: (depth + 1) * 8 }}>
                      {list.map(renderChannelRow)}
                    </div>
                  );
                }}
                createPlaceholder="文件夹名称"
                createRootLabel="新建文件夹"
                onCreate={(parentId, name) => addFolderM.mutate({ parentId, name })}
                emptyText="还没有文件夹"
                noMatchText="没有匹配的通道"
                revealOnExpand={false}
              />
            )}
          </div>
            </AdminFormCard>
          </div>
        )}

        <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm">
          <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--app-color-border-default)] px-3">
            <div className="flex items-center gap-2">
              {mode === "playback" ? (
                <>
                  <AdminButton size="sm" tone="primary" active onClick={togglePlaybackMode}>
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    退出回放
                  </AdminButton>
                  <span className="text-xs text-[var(--app-color-text-tertiary)]">
                    录像回放 · 单画面
                  </span>
                </>
              ) : (
                <>
                  <AdminButton size="sm" tone="secondary" onClick={togglePlaybackMode}>
                    <History className="mr-1.5 h-3.5 w-3.5" />
                    回放
                  </AdminButton>
                  <span className="mx-1 h-5 w-px bg-[var(--app-color-border-default)]" aria-hidden />
                  <span className="text-xs text-[var(--app-color-text-tertiary)]">画面布局</span>
                  <AdminButton
                    size="sm"
                    tone={layout === 1 ? "primary" : "secondary"}
                    active={layout === 1}
                    onClick={() => changeLayout(1)}
                  >
                    单画面
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    tone={layout === 4 ? "primary" : "secondary"}
                    active={layout === 4}
                    onClick={() => changeLayout(4)}
                  >
                    四画面
                  </AdminButton>
                  <span className="mx-1 h-5 w-px bg-[var(--app-color-border-default)]" aria-hidden />
                  <AdminButton
                    size="sm"
                    tone={hd ? "primary" : "secondary"}
                    active={hd}
                    onClick={toggleHd}
                    title="四画面使用主码流：更清晰，但服务器 CPU 更高；卡顿时关闭"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    高清化
                  </AdminButton>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--app-color-text-tertiary)]">
                共 {channels.length} 路
              </span>
              {mode !== "playback" && activeQ.data ? (
                <span
                  className={cn(
                    "text-xs",
                    activeQ.data.sessions.length >= activeQ.data.max
                      ? "font-medium text-[var(--app-color-feedback-danger-ink)]"
                      : "text-[var(--app-color-text-tertiary)]"
                  )}
                  title="服务端当前预览会话数 / 上限"
                >
                  占用 {activeQ.data.sessions.length}/{activeQ.data.max}
                </span>
              ) : null}
              {focusMode ? (
                <>
                  <AdminButton
                    size="sm"
                    tone="secondary"
                    onClick={() => setListOpen((open) => !open)}
                    title="展开/收起左侧通道列表"
                  >
                    <PanelLeftOpen className="mr-1.5 h-3.5 w-3.5" />
                    {listOpen ? "收起列表" : "通道列表"}
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    tone="primary"
                    onClick={toggleFocusMode}
                    title="恢复后台侧栏和通道列表"
                  >
                    <Minimize className="mr-1.5 h-3.5 w-3.5" />
                    退出全屏
                  </AdminButton>
                </>
              ) : (
                <AdminButton
                  size="sm"
                  tone="secondary"
                  onClick={toggleFocusMode}
                  title="收起后台侧栏和通道列表，放大画面；Esc 退出"
                >
                  <Maximize className="mr-1.5 h-3.5 w-3.5" />
                  全屏
                </AdminButton>
              )}
              {mode !== "playback" ? (
                <AdminButton size="sm" tone="secondary" onClick={clearAll}>
                  清空画面
                </AdminButton>
              ) : null}
            </div>
          </div>
          <div className="min-h-0 flex-1 p-2">
            {mode === "playback" ? (
              <PlaybackPanel channel={playbackChannel} />
            ) : (
            <div
              className={cn(
                "grid h-full gap-2",
                layout === 1 ? "grid-cols-1 grid-rows-1" : "grid-cols-2 grid-rows-2"
              )}
            >
              {slots.slice(0, layout).map((slot, index) => (
              <div
                key={index}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverIndex(index);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setOverIndex(index);
                }}
                onDragLeave={() => setOverIndex((current) => (current === index ? null : current))}
                onDrop={(event) => handleDrop(event, index)}
                className={cn(
                  "relative min-h-0 overflow-hidden rounded-xl border bg-black/90",
                  overIndex === index
                    ? "border-transparent ring-2 ring-[var(--app-color-accent)]"
                    : "border-[var(--app-color-border-default)]"
                )}
              >
                {slot.channel ? (
                  <>
                    {slot.hlsUrl ? (
                      <PreviewPlayer hlsUrl={slot.hlsUrl} />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-white/70">
                        {slot.phase === "starting" ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            正在取流…
                          </span>
                        ) : (
                          slot.error || "取流失败"
                        )}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 py-2">
                      <span
                        className="min-w-0 truncate text-xs font-medium text-white"
                        title={`${slot.channel.channelName}（编号 ${slot.channel.channelCode}）`}
                      >
                        {displayFloorAndName(slot.channel.channelName)}
                      </span>
                      <button
                        type="button"
                        onClick={() => clearSlot(index)}
                        className="pointer-events-auto rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                        aria-label="移除画面"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 border border-dashed border-white/10 text-white/50">
                    <MonitorPlay className="h-7 w-7" />
                    <span className="text-xs">拖拽通道到这里</span>
                  </div>
                )}
              </div>
              ))}
            </div>
            )}
          </div>
        </section>
      </div>

      <Dialog
        open={moveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>移动到文件夹</DialogTitle>
            <DialogDescription>
              把「{moveTarget?.channelName ?? ""}」移动到：
            </DialogDescription>
          </DialogHeader>
          <VideoCategoryTreeSelect
            nodes={moveOptions}
            value={moveTarget?.videoCategoryId ?? null}
            onSelect={(id) => {
              if (moveTarget) assignM.mutate({ id: moveTarget.id, categoryId: id });
              setMoveTarget(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={normalizeOpen} onOpenChange={(v) => !normalizeApplying && setNormalizeOpen(v)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>修正名称</DialogTitle>
            <DialogDescription>
              统一为「楼层-名称(房间号)-方位-编号」：括号转半角、补分隔符、楼层前移、房号归一。共 {normalizeCandidates.length} 路待修正。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[52vh] overflow-auto rounded border border-[var(--app-color-border-default)] p-1">
            {normalizeCandidates.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--app-color-text-tertiary)]">
                没有需要修正的名称
              </div>
            ) : (
              normalizeCandidates.map((c) => (
                <div
                  key={c.row.channelCode}
                  className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-[var(--app-color-surface-hover)]"
                >
                  <span className="min-w-0 flex-1 truncate text-[var(--app-color-text-tertiary)] line-through">
                    {c.oldName}
                  </span>
                  <span className="shrink-0 text-[var(--app-color-text-tertiary)]">→</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--app-color-text-primary)]">
                    {c.newName}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-[11px] text-[var(--app-color-text-tertiary)]">
              应用后批量写回平台，不可撤销
            </span>
            <AdminButton tone="ghost" onClick={() => setNormalizeOpen(false)}>取消</AdminButton>
            <AdminButton
              onClick={() => void applyNormalize()}
              loading={normalizeApplying}
              disabled={normalizeCandidates.length === 0}
            >
              应用修正
            </AdminButton>
          </div>
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}
