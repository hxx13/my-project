import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayFloorAndName } from "@/utils/dahuaChannelName";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  FolderPlus,
  MonitorPlay,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Save,
  Search,
  Trash2,
  X,
  Zap,
  Eraser,
  Upload,
} from "lucide-react";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormInput } from "@/components/admin/AdminFormPrimitives";
import { Tree } from "@/components/tree/Tree";
import { PlainSelect } from "@/features/video-wall/PlainSelect";
import {
  VideoCategoryTreeSelect,
  type VideoTreeOption,
} from "@/features/video-wall/VideoCategoryTreeSelect";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { refreshDahuaDeviceChannels } from "@/api/twinApi";
import {
  fetchRemoteRouteStars,
  listRemoteScreens,
  navigateRemoteScreen,
  pairRemoteScreen,
  toggleRemoteRouteStar,
  type RemoteScreenView,
} from "@/api/domains/remoteScreen.api";
import { getCurrentScreenId } from "@/features/remote-screen/RemoteScreenAgent";
import { fetchAdminNavConfig } from "@/api/domains/adminNavConfig.api";
import { ADMIN_NAV_REGISTRY, collectRegistryGroupItems } from "@/features/admin/adminNavRegistry";
import { normalizeAdminPath, toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import { shouldHideAdminSidebarPath } from "@/features/admin/hiddenAdminNavPaths";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyTvWallTask,
  assignChannelCategory,
  createVideoCategory,
  deleteTvWallPreset,
  deleteVideoCategory,
  fetchCurrentTasks,
  fetchTvWallTasks,
  fetchTvWalls,
  fetchVideoCategories,
  fetchVideoChannels,
  fetchTvWallTask,
  fetchTvWallDetail,
  fetchTvWallTour,
  operateTvWallLayout,
  renameVideoCategory,
  renameTvWallPreset,
  saveTvWallPreset,
  saveTvWallTour,
  setChannelLink,
  type TaskScreen,
  type TvWallTaskItem,
  type VideoCategoryNode,
  type VideoChannel,
} from "@/api/domains/videoWall.api";

/** 带子节点的分类节点（通用 Tree 组件按 children 递归） */
type CatNode = VideoCategoryNode & { children: CatNode[] };

/** 「未分类」伪节点的 id —— 不是真实分类，只用来把没归类的通道挂在树上 */
const UNASSIGNED_ID = -1;

type Rect = { left: number; top: number; width: number; height: number };

/** 均分宫格 */
function gridRects(cols: number, rows: number): Rect[] {
  const out: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ left: (c * 100) / cols, top: (r * 100) / rows, width: 100 / cols, height: 100 / rows });
    }
  }
  return out;
}

const sameRects = (a: Rect[], b: Rect[]) =>
  a.length === b.length &&
  a.every(
    (r, i) =>
      Math.abs(r.left - b[i].left) < 0.05 &&
      Math.abs(r.top - b[i].top) < 0.05 &&
      Math.abs(r.width - b[i].width) < 0.05 &&
      Math.abs(r.height - b[i].height) < 0.05
  );

/** 两个矩形是不是同一个位置 */
const sameRect = (a: Rect, b: Rect) =>
  Math.abs(a.left - b.left) < 0.05 &&
  Math.abs(a.top - b.top) < 0.05 &&
  Math.abs(a.width - b.width) < 0.05 &&
  Math.abs(a.height - b.height) < 0.05;

/**
 * 常用切分。均分的走 gridRects；非均分的直接写死矩形。
 * 窗口矩形本来就是任意百分比，所以「上大下小」这类和自定义拖拽是同一种数据。
 */
const LAYOUTS: { key: string; label: string; rects: Rect[] }[] = [
  { key: "1", label: "1 格", rects: gridRects(1, 1) },
  { key: "4", label: "4 格（2×2）", rects: gridRects(2, 2) },
  {
    key: "5",
    label: "5 格（左 1 右 4）",
    rects: [
      { left: 0, top: 0, width: 50, height: 100 },
      { left: 50, top: 0, width: 25, height: 50 },
      { left: 75, top: 0, width: 25, height: 50 },
      { left: 50, top: 50, width: 25, height: 50 },
      { left: 75, top: 50, width: 25, height: 50 },
    ],
  },
  { key: "6", label: "6 格（3×2）", rects: gridRects(3, 2) },
  { key: "8", label: "8 格（4×2）", rects: gridRects(4, 2) },
  { key: "9", label: "9 格（3×3）", rects: gridRects(3, 3) },
  { key: "16", label: "16 格（4×4）", rects: gridRects(4, 4) },
  { key: "36", label: "36 格（6×6）", rects: gridRects(6, 6) },
  { key: "64", label: "64 格（8×8）", rects: gridRects(8, 8) },
  {
    key: "bigLeft",
    label: "左大右小（1+4）",
    rects: [
      { left: 0, top: 0, width: 60, height: 100 },
      { left: 60, top: 0, width: 20, height: 50 },
      { left: 80, top: 0, width: 20, height: 50 },
      { left: 60, top: 50, width: 20, height: 50 },
      { left: 80, top: 50, width: 20, height: 50 },
    ],
  },
  {
    key: "bigTop",
    label: "上大下小（1+4）",
    rects: [
      { left: 0, top: 0, width: 100, height: 60 },
      { left: 0, top: 60, width: 25, height: 40 },
      { left: 25, top: 60, width: 25, height: 40 },
      { left: 50, top: 60, width: 25, height: 40 },
      { left: 75, top: 60, width: 25, height: 40 },
    ],
  },
  {
    key: "bigBottom",
    label: "上小下大（4+1）",
    rects: [
      { left: 0, top: 0, width: 25, height: 40 },
      { left: 25, top: 0, width: 25, height: 40 },
      { left: 50, top: 0, width: 25, height: 40 },
      { left: 75, top: 0, width: 25, height: 40 },
      { left: 0, top: 40, width: 100, height: 60 },
    ],
  },
];

/** 打开时默认一块屏一个窗口；要不要更多格由用户选 */
const DEFAULT_LAYOUT = LAYOUTS.find((l) => l.key === "1")!;

/** 画布指纹：矩形 + 每格放的通道。用来跟「载入预设时的样子」比，判断有没有改过 */
const signatureOf = (rects: Record<string, Rect[]>, slots: Record<string, VideoChannel>) =>
  JSON.stringify({
    r: Object.entries(rects),
    s: Object.entries(slots)
      .map(([k, c]) => [k, c.channelCode])
      .sort(),
  });
/** 「自定义」不是一种矩形，而是「进入自由拖拽」——选中后把手常显 */
const CUSTOM_LABEL = "自定义（拖边框调整）";
const LAYOUT_OPTIONS = [...LAYOUTS.map((l) => l.label), CUSTOM_LABEL];

/** 参观卡片的区分色：**整张卡片实色**，按顺序循环；白字在 600 档上对比够 */
const TOUR_COLORS = ["#d97706", "#0284c7", "#059669", "#7c3aed", "#e11d48", "#0d9488", "#4f46e5", "#65a30d"];

/**
 * 可以远程切换的页面 —— **直接取后台导航注册表的名称与路径**（就是 nav-manager 里展示的那份），
 * 不再手写一份列表：导航改名/调整后这里自动跟着变。
 */
const REMOTE_ROUTES: { label: string; value: string }[] = (() => {
  const seen = new Set<string>();
  const out: { label: string; value: string }[] = [];
  for (const g of ADMIN_NAV_REGISTRY) {
    for (const it of collectRegistryGroupItems(g)) {
      if (!it?.path || shouldHideAdminSidebarPath(it.path)) continue;
      const value = toAdminRoutePath(it.path);
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ label: it.label, value });
    }
  }
  return out;
})();

export default function AdminVideoWallPage() {
  const qc = useQueryClient();

  const [tvWallId, setTvWallId] = useState<string>("");
  /** 每块屏各自的窗口矩形列表（key = screenId）。「整墙一起推」，所以正常都是一致的；自定义切分就靠它 */
  const [rectsByScreen, setRectsByScreen] = useState<Record<string, Rect[]>>({});
  /** 已放置的窗口：key = `${screenId}:${index}` */
  const [slots, setSlots] = useState<Record<string, VideoChannel>>({});
  /** 当前挑中的通道（点格子即可放入） */
  const [picked, setPicked] = useState<VideoChannel | null>(null);
  const [keyword, setKeyword] = useState("");
  /** 展开的文件夹（默认全收起；搜索时由 Tree 自动展开命中链） */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [presetName, setPresetName] = useState("");
  const [presetId, setPresetId] = useState("");
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  /** 实时模式：画布一有变动就直接推到大屏，不用再点「立即上墙」 */
  const [live, setLive] = useState(false);
  /** 参观模式：选预设＝直接上墙并同步预览（适合展厅演示），选预设不会把这个开关关掉 */
  const [tour, setTour] = useState(false);
  /** 参观顺序弹窗：点「参观模式」即弹出，关掉后可用按钮右侧的小箭头再打开 */
  const [tourOpen, setTourOpen] = useState(false);
  /** 参观弹窗里当前切到的那个预设，用于高亮 */
  const [tourActiveId, setTourActiveId] = useState("");
  /** 参观弹窗的两个页签：参观顺序 / 网页控制 */
  const [tourTab, setTourTab] = useState<"presets" | "screens">("presets");
  /** 网页控制里选中的那台；null = 显示屏幕列表 */
  const [tourScreenId, setTourScreenId] = useState<string | null>(null);
  /** 网页控制里的页面搜索词 */
  const [routeQuery, setRouteQuery] = useState("");
  /** 配对码输入；pairedCode = 当前选中那台的码（同账号列表进来时为空） */
  const [pairCode, setPairCode] = useState("");
  const [pairedCode, setPairedCode] = useState("");
  const [pairedScreen, setPairedScreen] = useState<RemoteScreenView | null>(null);
  /** 收藏的页面（**远程切换专用**，与侧栏收藏分开；按路由记，与控制哪台无关） */
  const [starPaths, setStarPaths] = useState<string[]>([]);
  /** 正在「移动到文件夹」的那路通道；null = 弹窗关着 */
  const [moveTarget, setMoveTarget] = useState<VideoChannel | null>(null);
  /** 左树里当前「定位到」的那一路通道：持续选中态（不是闪一下），换一个才变 */
  const [selectedChannel, setSelectedChannel] = useState("");
  /** 「自定义切分」态：把手不再只悬停才显形，一直在，便于找 */
  const [customMode, setCustomMode] = useState(false);
  /** 当前选中的那块电视：顶部工具栏的切分作用在它身上 */
  const [selectedScreen, setSelectedScreen] = useState<string | null>(null);
  /** 载入预设/保存那一刻的画布指纹；跟当前比就能知道有没有改过 */
  const baselineRef = useRef("");
  /** 「复制预设到别的电视」弹窗 */
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState("");
  const [copyName, setCopyName] = useState("");
  /** 被复制的那个**预设**（不是当前画布） */
  const [copySource, setCopySource] = useState<{ taskId: string; name: string } | null>(null);

  const wallsQ = useQuery({ queryKey: ["tvwall", "list"], queryFn: fetchTvWalls });
  /** 墙的物理屏：双屏墙要按屏画，不能当成一整块 */
  const wallQ = useQuery({
    queryKey: ["tvwall", "detail", tvWallId],
    queryFn: () => fetchTvWallDetail(tvWallId),
    enabled: !!tvWallId,
  });
  const wallScreens = useMemo(() => wallQ.data?.screens ?? [], [wallQ.data]);
  const rectsOf = (screenId: string) => rectsByScreen[screenId] ?? DEFAULT_LAYOUT.rects;
  /** 当前矩形匹配哪个预设；都不匹配就是「自定义切分」 */
  const layoutOf = (screenId: string) => LAYOUTS.find((l) => sameRects(l.rects, rectsOf(screenId)));
  const labelOf = (screenId: string) => layoutOf(screenId)?.label ?? "自定义切分";
  /** 工具栏切分作用在「选中的那块电视」；没点过就默认第一块 */
  const activeScreenId =
    selectedScreen && wallScreens.some((s) => s.screenId === selectedScreen)
      ? selectedScreen
      : wallScreens[0]?.screenId ?? "";
  const activeScreenIdx = wallScreens.findIndex((s) => s.screenId === activeScreenId);
  const activeScreenLabel =
    wallScreens.length <= 1
      ? "屏幕"
      : `${wallScreens[activeScreenIdx]?.left < 50 ? "左" : "右"}屏${wallScreens.length > 2 ? ` ${activeScreenIdx + 1}` : ""}`;

  /** 只改一块电视的切分 */
  const setLayoutOne = (screenId: string, label: string) => {
    const l = LAYOUTS.find((x) => x.label === label);
    if (!l) {
      // 选「自定义」：保留当前矩形，把手常显，提示去拖边框
      setCustomMode(true);
      toast.success("拖动窗口边缘即可调整分界");
      return;
    }
    setCustomMode(false);
    setRectsByScreen((prev) => ({ ...prev, [screenId]: l.rects.map((r) => ({ ...r })) }));
  };

  const canvasSignature = useMemo(() => signatureOf(rectsByScreen, slots), [rectsByScreen, slots]);
  /** 载着预设、且画布跟载入时不一样 —— 该提示保存了 */
  const dirty = !!presetId && baselineRef.current !== "" && baselineRef.current !== canvasSignature;

  const channelsQ = useQuery({ queryKey: ["tvwall", "channels"], queryFn: fetchVideoChannels });
  /** 监控分类树（独立于门禁通道的备注分类） */
  const catsQ = useQuery({ queryKey: ["tvwall", "categories"], queryFn: fetchVideoCategories });
  const currentQ = useQuery({ queryKey: ["tvwall", "current"], queryFn: fetchCurrentTasks });
  const tasksQ = useQuery({
    queryKey: ["tvwall", "tasks", tvWallId],
    queryFn: () => fetchTvWallTasks(tvWallId),
    enabled: !!tvWallId,
  });
  /** 参观顺序（预设 id 有序）：两端共用同一份 */
  const tourQ = useQuery({
    queryKey: ["tvwall", "tour", tvWallId],
    queryFn: () => fetchTvWallTour(tvWallId),
    enabled: !!tvWallId,
  });

  // 默认选中第一面墙
  useEffect(() => {
    if (!tvWallId && wallsQ.data?.length) setTvWallId(wallsQ.data[0].tvWallId);
  }, [wallsQ.data, tvWallId]);

  const channels = useMemo(() => {
    const list = channelsQ.data ?? [];
    const kw = keyword.trim().toLowerCase();
    if (!kw) return list;
    return list.filter((c) => {
      const name = (c.channelName ?? "").toLowerCase();
      return name.includes(kw) || displayFloorAndName(c.channelName ?? "").toLowerCase().includes(kw);
    });
  }, [channelsQ.data, keyword]);

  /** 扁平节点拼成树（Tree 组件按 children 递归），按 sortOrder 排 */
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

  /** 直挂各节点的通道；节点已被删掉的通道落进「未分类」 */
  const { byNode, unassigned } = useMemo(() => {
    const nodeIds = new Set((catsQ.data ?? []).map((n) => n.id));
    const m = new Map<number, VideoChannel[]>();
    const un: VideoChannel[] = [];
    for (const c of channels) {
      if (c.videoCategoryId != null && nodeIds.has(c.videoCategoryId)) {
        const arr = m.get(c.videoCategoryId);
        if (arr) arr.push(c);
        else m.set(c.videoCategoryId, [c]);
      } else {
        un.push(c);
      }
    }
    return { byNode: m, unassigned: un };
  }, [channels, catsQ.data]);

  const invalidateChannelTree = () => {
    qc.invalidateQueries({ queryKey: ["tvwall", "channels"] });
    qc.invalidateQueries({ queryKey: ["tvwall", "categories"] });
  };

  const assignM = useMutation({
    mutationFn: ({ id, categoryId }: { id: number; categoryId: number | null }) =>
      assignChannelCategory(id, categoryId),
    onSuccess: () => {
      toast.success("已归类");
      invalidateChannelTree();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "归类失败"),
  });

  /** 手动拉取通道：定时任务之外，设备新加了相机/槽位时不用等下一轮 */
  const pullChannelsM = useMutation({
    mutationFn: () => refreshDahuaDeviceChannels(),
    onSuccess: () => {
      toast.success("已触发拉取，新通道稍后自动出现");
      // 拉取在后台跑：隔几秒刷一次，让新通道/新分组自己冒出来
      for (const ms of [3000, 8000, 15000]) {
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["tvwall", "channels"] });
          qc.invalidateQueries({ queryKey: ["tvwall", "categories"] });
        }, ms);
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "拉取失败"),
  });

  const linkM = useMutation({
    mutationFn: ({ id, url }: { id: number; url: string }) => setChannelLink(id, url),
    onSuccess: () => {
      toast.success("跳转地址已保存");
      qc.invalidateQueries({ queryKey: ["tvwall", "channels"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

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

  const renameM = useMutation({
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

  /** 改名走通用输入弹窗，不占行内空间 */
  const askRename = async (node: CatNode) => {
    const name = await appPrompt("修改文件夹名称", node.name, { title: "重命名" });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name) return;
    renameM.mutate({ id: node.id, name: trimmed });
  };

  const askDeleteFolder = async (node: CatNode) => {
    if (!(await appConfirm(`确定删除文件夹「${node.name}」？里面的通道会回到「未分类」。`, { danger: true }))) return;
    deleteFolderM.mutate(node.id);
  };

  /** 只填 IP 也行，后端会补 http://；留空 = 清除 */
  const askSetLink = async (c: VideoChannel) => {
    const v = await appPrompt("设备跳转地址（可只填 IP，如 172.22.160.2）", (c.linkUrl ?? "").trim(), {
      title: "跳转地址",
    });
    if (v == null) return;
    linkM.mutate({ id: c.id, url: v.trim() });
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * 选中预设 → 只把它还原到画布上**预览**，不碰大屏。
   * 真正切换仍是两步：套用该预设（原样下发）或 立即上墙（按画布内容下发）。
   */
  const previewPreset = async (wallId: string, taskId: string) => {
    if (!wallId || !taskId) return;
    try {
      const t = await fetchTvWallTask(wallId, taskId);
      const nextRects: Record<string, Rect[]> = {};
      const nextSlots: Record<string, VideoChannel> = {};
      for (const sc of t.screens ?? []) {
        const sid = String(sc.screenId);
        const wins = sc.windows ?? [];
        const n = sc.splitNum ?? 0;
        // **一律用窗口自带的矩形**：客户端的 SubTv id 不是宫格位置
        // （实测「一半单画面+清洗间」splitNum=5，大窗的 id 却是 2），
        // 按 splitNum 套固定布局会把位置全摆错。没有窗口时才退回默认布局。
        const std = (LAYOUTS.find((l) => l.key === String(n)) ?? DEFAULT_LAYOUT).rects;
        const cells = (
          wins.length
            ? wins.map((w, i) =>
                // 后端没带矩形时（老版本）退回标准宫格，别把窗口画成 0 尺寸看不见
                (w.width ?? 0) > 0 && (w.height ?? 0) > 0
                  ? { left: w.left ?? 0, top: w.top ?? 0, width: w.width!, height: w.height! }
                  : std[i] ?? { left: 0, top: 0, width: 100, height: 100 }
              )
            : std.map((r) => ({ ...r }))
        ).map((r, i) => ({
          rect: r,
          code: wins[i]?.channelCode ?? "",
          name: wins[i]?.channelName ?? "",
        }));
        // 平台上的预设会留一个和别格**完全重合**的空窗口（自闭合的 SubTv）：
        // 它画在上层又没有画面，只会把点击吃掉（实测双击大格报「还没有画面」）。
        // 重合的空窗口不渲染，剩下的重新连号。
        const kept = cells.filter((c, i) =>
          c.code ? true : !cells.some((o, j) => j !== i && !!o.code && sameRect(o.rect, c.rect))
        );
        nextRects[sid] = kept.map((c) => c.rect);
        kept.forEach((c, i) => {
          if (!c.code) return;
          const known = (channelsQ.data ?? []).find((x) => x.channelCode === c.code);
          nextSlots[`${sid}:${i}`] =
            known ?? { id: -1, channelCode: c.code, channelName: c.name || c.code };
        });
      }
      setRectsByScreen(nextRects);
      setSlots(nextSlots);
      // 记下这一刻的画布，作为「有没有改过」的基线
      baselineRef.current = signatureOf(nextRects, nextSlots);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "预设读取失败");
    }
  };

  const presetPreviewName = useMemo(
    () => (tasksQ.data ?? []).find((t) => String(t.taskId) === presetId)?.taskName ?? "",
    [tasksQ.data, presetId]
  );

  const wallName = useMemo(
    () => (wallsQ.data ?? []).find((w) => w.tvWallId === tvWallId)?.tvWallName ?? "",
    [wallsQ.data, tvWallId]
  );

  /** 整墙的按屏下发内容：每块物理屏一条 */
  const screensSpec: TaskScreen[] = useMemo(
    () =>
      wallScreens.map((s) => {
        const prefix = `${s.screenId}:`;
        const rects = rectsOf(s.screenId);
        return {
          screenId: s.screenId,
          splitNum: rects.length,
          windows: Object.entries(slots)
            .filter(([k]) => k.startsWith(prefix))
            .map(([k, c]) => {
              const i = Number(k.slice(prefix.length));
              const r = rects[i] ?? rects[rects.length - 1];
              return {
                index: i,
                channelCode: c.channelCode,
                channelName: c.channelName,
                left: r?.left,
                top: r?.top,
                width: r?.width,
                height: r?.height,
              };
            })
            .filter((w) => Number.isFinite(w.index))
            .sort((a, b) => a.index - b.index),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rectsOf 跟着 rectsByScreen 变
    [wallScreens, slots, rectsByScreen]
  );


  /** 换墙就把画布清空：上一面墙的窗口留着会张冠李戴 */
  useEffect(() => {
    setSlots({});
    setRectsByScreen({});
    setPresetId("");
    setSelectedScreen(null);
    baselineRef.current = "";
  }, [tvWallId]);

  // 宫格改小时丢弃越界窗口
  useEffect(() => {
    setSlots((prev) => {
      const next: Record<string, VideoChannel> = {};
      for (const [k, c] of Object.entries(prev)) {
        const cut = k.lastIndexOf(":");
        const idx = Number(k.slice(cut + 1));
        if (Number.isFinite(idx) && idx < rectsOf(k.slice(0, cut)).length) next[k] = c;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rectsByScreen, wallScreens]);

  /**
   * 实时模式：画布一变就推一次（防抖 400ms，连续拖放只发最后一次）。
   * 刚打开开关那一轮不推 —— 否则「打开」本身等于一次上墙，可能误伤大屏。
   */
  const liveArmRef = useRef(false);
  useEffect(() => {
    if (!live) {
      liveArmRef.current = false;
      return;
    }
    if (!liveArmRef.current) {
      liveArmRef.current = true;
      return;
    }
    if (!tvWallId || !wallScreens.length) return;
    const timer = setTimeout(() => layoutM.mutate({ screens: screensSpec, silent: true }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutM 每次渲染都是新对象，不该进依赖
  }, [slots, rectsByScreen, live, tvWallId, wallScreens]);

  /**
   * 拖窗口的右/下边调整分界：**贴在同一条缝上的邻居一起让位**，
   * 否则两块会重叠（大华那边按 zorder 叠着画，看起来就是花了）。
   */
  const startResize = (
    e: React.PointerEvent,
    sid: string,
    index: number,
    edge: "right" | "bottom"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const host = (e.currentTarget as HTMLElement).closest("[data-screen]") as HTMLElement | null;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const pct =
        edge === "right"
          ? ((ev.clientX - box.left) / box.width) * 100
          : ((ev.clientY - box.top) / box.height) * 100;
      const v = Math.min(100, Math.max(5, Math.round(pct)));
      setRectsByScreen((prev) => {
        const cur = (prev[sid] ?? rectsOf(sid)).map((r) => ({ ...r }));
        const me = cur[index];
        if (!me) return prev;
        if (edge === "right") {
          const oldRight = me.left + me.width;
          if (v - me.left < 5) return prev;
          me.width = v - me.left;
          cur.forEach((r, i) => {
            if (i === index || Math.abs(r.left - oldRight) > 0.6) return;
            if (!(r.top < me.top + me.height && me.top < r.top + r.height)) return;
            const right = r.left + r.width;
            r.left = v;
            r.width = Math.max(5, right - v);
          });
        } else {
          const oldBottom = me.top + me.height;
          if (v - me.top < 5) return prev;
          me.height = v - me.top;
          cur.forEach((r, i) => {
            if (i === index || Math.abs(r.top - oldBottom) > 0.6) return;
            if (!(r.left < me.left + me.width && me.left < r.left + r.width)) return;
            const bottom = r.top + r.height;
            r.top = v;
            r.height = Math.max(5, bottom - v);
          });
        }
        return { ...prev, [sid]: cur };
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    // 指针被系统中断（切窗口/手势抢走）时也要摘掉，否则监听器留着，之后随便一动都在改分界
    window.addEventListener("pointercancel", up);
  };

  /** 交换两个窗口里的通道（宫格之间拖拽） */
  const swapSlots = (a: string, b: string) => {
    setSlots((prev) => {
      const next = { ...prev };
      const va = next[a];
      const vb = next[b];
      if (vb) next[a] = vb;
      else delete next[a];
      if (va) next[b] = va;
      else delete next[b];
      return next;
    });
  };

  /** 点画布里的通道 → 左树展开到它所在的分组并滚到眼前 */
  const focusChannelInTree = (c: VideoChannel) => {
    const nodeId = c.videoCategoryId;
    if (nodeId == null) return;
    setKeyword("");
    const parentOf = new Map((catsQ.data ?? []).map((n) => [n.id, n.parentId]));
    setExpanded((prev) => {
      const next = new Set(prev);
      let cur: number | undefined = nodeId;
      while (cur) {
        next.add(cur);
        cur = parentOf.get(cur);
      }
      return next;
    });
    // 选中它：持续选中态，一眼看得出「就是这一路」
    setSelectedChannel(c.channelCode);
    // 树刚展开，等一帧再滚；**居中**而不是「就近」，一眼就能看到
    window.setTimeout(() => {
      document
        .querySelector(`[data-channel="${c.channelCode}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
  };

  const put = useCallback((key: string, channel: VideoChannel | null) => {
    setSlots((prev) => {
      const next = { ...prev };
      if (channel) next[key] = channel;
      else delete next[key];
      return next;
    });
  }, []);

  const layoutM = useMutation({
    mutationFn: (v: { screens: TaskScreen[]; silent?: boolean }) =>
      operateTvWallLayout({ tvWallId, screens: v.screens }),
    onSuccess: (_d, v) => {
      // 实时模式下每次拖放都推一次，弹提示会刷屏，静默处理
      if (!v.silent) {
        const cleared = v.screens.every((s) => !s.splitNum || !s.windows.length);
        toast.success(cleared ? "已清空该屏" : "已上墙");
      }
      qc.invalidateQueries({ queryKey: ["tvwall", "current"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "上墙失败"),
  });

  const applyM = useMutation({
    mutationFn: (taskId: string) => applyTvWallTask(tvWallId, taskId),
    onSuccess: () => {
      toast.success("已切到该预设");
      qc.invalidateQueries({ queryKey: ["tvwall", "current"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "切换失败"),
  });

  const saveM = useMutation({
    // overwrite = true 时覆盖当前选中的预设，否则另存为新预设
    mutationFn: (overwrite: boolean) =>
      saveTvWallPreset({
        tvWallId,
        taskId: overwrite && presetId ? presetId : null,
        taskName: overwrite && presetPreviewName ? presetPreviewName : presetName.trim(),
        screens: screensSpec,
      }),
    onSuccess: (_d, overwrite) => {
      toast.success(overwrite ? "已保存到该预设" : "预设已保存");
      setPresetDialogOpen(false);
      setPresetName("");
      baselineRef.current = canvasSignature;
      qc.invalidateQueries({ queryKey: ["tvwall", "tasks", tvWallId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存失败"),
  });

  /** 把当前画布复制成另一个电视墙上的预设（原版不支持，这里补上） */
  const copyM = useMutation({
    mutationFn: async () => {
      if (!copySource) throw new Error("没有选中要复制的预设");
      // 取源预设的**方案内容**（不是当前画布），再原样存成目标墙上的新预设
      const src = await fetchTvWallTask(tvWallId, copySource.taskId);
      const detail = await fetchTvWallDetail(copyTarget);
      const targets = detail.screens ?? [];
      const srcScreens = src.screens ?? [];
      // 目标墙的屏数/位置可能不同，按顺序对应；对不上的屏留空
      const screens: TaskScreen[] = targets.map((t, i) => {
        const s = srcScreens[i];
        return {
          screenId: t.screenId,
          splitNum: s?.splitNum ?? 0,
          windows: (s?.windows ?? []).map((w) => ({ ...w })),
        };
      });
      await saveTvWallPreset({
        tvWallId: copyTarget,
        taskId: null,
        taskName: copyName.trim(),
        screens,
      });
    },
    onSuccess: () => {
      toast.success("已复制到该电视墙");
      setCopyOpen(false);
      qc.invalidateQueries({ queryKey: ["tvwall", "tasks", copyTarget] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "复制失败"),
  });

  const renamePresetM = useMutation({
    mutationFn: ({ taskId, name }: { taskId: string; name: string }) =>
      renameTvWallPreset(tvWallId, taskId, name),
    onSuccess: () => {
      toast.success("预设已重命名");
      qc.invalidateQueries({ queryKey: ["tvwall", "tasks", tvWallId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "重命名失败"),
  });

  /** 预设改名：大华没有改名接口，后端按同一 taskId 重存，方案内容不动 */
  const askRenamePreset = async (t: TvWallTaskItem) => {
    const name = await appPrompt("重命名预设（方案内容不变）", t.taskName, { title: "重命名预设" });
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === t.taskName) return;
    renamePresetM.mutate({ taskId: String(t.taskId), name: trimmed });
  };

  const askDeletePreset = async (t: TvWallTaskItem) => {
    if (!(await appConfirm(`删除预设「${t.taskName}」？`, { title: "删除预设", danger: true }))) return;
    delM.mutate(String(t.taskId));
  };

  // ── 参观顺序 ──
  // 两端共用一份队列；这里改动后先用本地缓存即时反馈，再落库。

  const tourSaveM = useMutation({
    mutationFn: (ids: string[]) => saveTvWallTour(tvWallId, ids),
    onSuccess: (rows) => qc.setQueryData(["tvwall", "tour", tvWallId], rows),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "保存参观顺序失败"),
  });

  const tourIds = tourQ.data ?? [];
  const taskById = useMemo(() => {
    const m = new Map<string, TvWallTaskItem>();
    for (const t of tasksQ.data ?? []) m.set(String(t.taskId), t);
    return m;
  }, [tasksQ.data]);
  const tourItems = useMemo(
    () => tourIds.map((id) => taskById.get(String(id))).filter((t): t is TvWallTaskItem => !!t),
    [tourIds, taskById]
  );
  /** 还没进队的预设 */
  const tourRest = useMemo(
    () => (tasksQ.data ?? []).filter((t) => !tourIds.some((id) => String(id) === String(t.taskId))),
    [tasksQ.data, tourIds]
  );

  const setTourIds = (ids: string[]) => {
    qc.setQueryData(["tvwall", "tour", tvWallId], ids);
    tourSaveM.mutate(ids);
  };

  /** 点方块 = 切到这个预设（同时把画布预览也带过去） */
  const tourApply = (taskId: string) => {
    setTourActiveId(String(taskId));
    setPresetId(String(taskId));
    void previewPreset(tvWallId, String(taskId));
    applyM.mutate(String(taskId));
  };

  /** 主按钮：开关参观模式；打开时顺带把顺序弹窗也弹出来 */
  const toggleTour = () => {
    const next = !tour;
    setTour(next);
    setLive(false);
    setTourOpen(next);
  };

  // ── 网页控制（集成在参观弹窗里）：同账号登录的在线页面 ──
  const screensQ = useQuery({
    queryKey: ["tvwall", "remoteScreens"],
    queryFn: listRemoteScreens,
    enabled: tourOpen,
    refetchInterval: tourOpen ? 5000 : false,
  });
  const tourScreens = screensQ.data ?? [];
  const tourScreen =
    tourScreens.find((s) => s.screenId === tourScreenId) ??
    (pairedScreen && pairedScreen.screenId === tourScreenId ? pairedScreen : null);
  /** 配对：凭码连别的账号/别的设备上的页面 */
  const pairM = useMutation({
    mutationFn: (code: string) => pairRemoteScreen(code),
    onSuccess: (s) => {
      setPairedScreen(s);
      setPairedCode(s.code || "");
      setTourScreenId(s.screenId);
      setPairCode("");
      toast.success(`已连上「${s.label || "未命名屏幕"}」`);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "配对失败"),
  });
  const screenNavM = useMutation({
    mutationFn: (args: { screenId: string; route: string; code?: string }) =>
      navigateRemoteScreen(args.screenId, args.route, args.code),
    onSuccess: (_d, args) => {
      toast.success("已下发跳转");
      qc.invalidateQueries({ queryKey: ["tvwall", "remoteScreens"] });
      // 配对来的那台不在列表里，重新配一次把「当前页面」刷新出来
      if (args.code) {
        window.setTimeout(() => pairM.mutate(args.code as string), 1200);
      }
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "下发失败"),
  });

  // 关掉弹窗时回到屏幕列表，下次打开不会停在上次那台
  useEffect(() => {
    if (!tourOpen) {
      setTourScreenId(null);
      setRouteQuery("");
      setPairCode("");
      setPairedCode("");
      setPairedScreen(null);
    }
  }, [tourOpen]);

  // 收藏从账号配置里读（远程切换专用字段），打开弹窗时拉一次
  useEffect(() => {
    if (!tourOpen) return;
    let alive = true;
    void fetchRemoteRouteStars().then((list) => {
      if (alive) setStarPaths(list);
    });
    return () => {
      alive = false;
    };
  }, [tourOpen]);

  /** 点星号：**交后端按单个路由切换**（不传整份列表，避免多端互相覆盖） */
  const toggleStar = async (value: string) => {
    try {
      const list = await toggleRemoteRouteStar(normalizeAdminPath(value));
      setStarPaths(list);
    } catch {
      toast.error("收藏保存失败");
    }
  };

  /**
   * 可跳转的页面清单：**优先读后端持久化的导航配置**（nav-manager 里改的名字/顺序存在那儿），
   * 读不到才退回注册表快照 —— 这样后台改了页面名称，这里立刻跟着变。
   */
  const navConfigQ = useQuery({
    queryKey: ["tvwall", "navRoutes"],
    queryFn: () => fetchAdminNavConfig("ADMIN"),
    enabled: tourOpen,
    staleTime: 60000,
  });
  const navRoutes = useMemo(() => {
    const out: { label: string; value: string }[] = [];
    const seen = new Set<string>();
    const walk = (nodes: typeof navConfigQ.data) => {
      for (const n of nodes ?? []) {
        if (n.type === "ITEM" && n.itemPath && n.visible !== false) {
          const value = `/console${n.itemPath}`;
          if (!seen.has(value)) {
            seen.add(value);
            out.push({ label: n.title, value });
          }
        }
        if (n.children?.length) walk(n.children);
      }
    };
    walk(navConfigQ.data);
    return out.length ? out : REMOTE_ROUTES;
  }, [navConfigQ.data]);

  /** 列表 = 同账号在线页面 + 配对来的那台（若不在列表里） */
  const screenRows = useMemo(() => {
    if (!pairedScreen || tourScreens.some((s) => s.screenId === pairedScreen.screenId)) {
      return tourScreens;
    }
    return [pairedScreen, ...tourScreens];
  }, [tourScreens, pairedScreen]);

  /** 按名称/路径过滤；收藏的排在前面 */
  const starredSet = useMemo(() => new Set(starPaths.map(normalizeAdminPath)), [starPaths]);
  const routeRows = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    const matched = navRoutes.filter(
      (r) => !q || r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    );
    return [...matched].sort((a, b) => {
      const as = starredSet.has(normalizeAdminPath(a.value)) ? 0 : 1;
      const bs = starredSet.has(normalizeAdminPath(b.value)) ? 0 : 1;
      return as - bs;
    });
  }, [routeQuery, starredSet, navRoutes]);

  const delM = useMutation({    mutationFn: (taskId: string) => deleteTvWallPreset(tvWallId, taskId),
    onSuccess: (_d, taskId) => {
      toast.success("预设已删除");
      // 删的正好是当前选中的才清选中；删别人别把选中态也带没了
      if (String(taskId) === String(presetId)) {
        setPresetId("");
        baselineRef.current = "";
      }
      qc.invalidateQueries({ queryKey: ["tvwall", "tasks", tvWallId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "删除失败"),
  });

  /** 搜索按通道名过滤：只留「有命中通道」的文件夹与它的祖先链，并强制展开 */
  const { shownTree, searchExpanded } = useMemo(() => {
    if (!keyword.trim()) return { shownTree: catTree, searchExpanded: null as Set<number> | null };
    const parentOf = new Map<number, number>();
    for (const n of catsQ.data ?? []) parentOf.set(n.id, n.parentId);
    const keep = new Set<number>();
    for (const [nid, list] of byNode) {
      if (!list.length) continue;
      keep.add(nid);
      let p = parentOf.get(nid);
      while (p) {
        keep.add(p);
        p = parentOf.get(p);
      }
    }
    const prune = (list: CatNode[]): CatNode[] =>
      list.filter((n) => keep.has(n.id)).map((n) => ({ ...n, children: prune(n.children) }));
    return { shownTree: prune(catTree), searchExpanded: keep };
  }, [catTree, byNode, keyword, catsQ.data]);

  /** 未分类的通道挂在一个伪节点下，不再另开一块列表 */
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

  const channelsUnder = (node: CatNode) =>
    node.id === UNASSIGNED_ID ? unassigned : byNode.get(node.id) ?? [];

  /**
   * 每个节点的（在线/总数），**含子文件夹**累加 —— 父文件夹也要能一眼看出这一层有多少路在线。
   * 用未过滤的全量通道算，搜索时数字不会跟着搜索结果缩水。
   */
  const statsByNode = useMemo(() => {
    const nodeIds = new Set((catsQ.data ?? []).map((n) => n.id));
    const direct = new Map<number, { total: number; online: number }>();
    for (const c of channelsQ.data ?? []) {
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
  }, [channelsQ.data, catsQ.data, catTree]);

  /** 某个节点的（在线/总数）；未分类伪节点按未归类的通道算 */
  const statsOf = (n: CatNode) => {
    if (n.id !== UNASSIGNED_ID) return statsByNode.get(n.id);
    const list = (channelsQ.data ?? []).filter((c) => c.videoCategoryId == null);
    return { total: list.length, online: list.filter((c) => c.isOnline === 1).length };
  };

  /** 行右端的在线数：有离线就标红并写出条数，把行尾空宽用起来 */
  const renderOnlineSuffix = (n: CatNode) => {
    const s = statsOf(n);
    if (!s || !s.total) return null;
    const offline = s.total - s.online;
    return (
      <span
        className={cn(
          "shrink-0 pl-2 text-[10px] tabular-nums",
          offline > 0
            ? "font-medium text-[var(--app-color-feedback-danger-ink)]"
            : "text-[var(--app-color-text-tertiary)]"
        )}
      >
        {s.online}/{s.total}
        {offline > 0 ? ` · ${offline} 离线` : ""}
      </span>
    );
  };

  /** 「移动到」弹窗里的候选树：带 (在线/总数)，与左栏同一口径 */
  const moveOptions = useMemo<VideoTreeOption[]>(() => {
    const conv = (list: CatNode[]): VideoTreeOption[] =>
      list.map((n) => {
        const st = statsByNode.get(n.id);
        return {
          id: n.id,
          name: n.name,
          suffix: st && st.total ? `(${st.online}/${st.total})` : undefined,
          children: conv(n.children),
        };
      });
    return conv(catTree);
  }, [catTree, statsByNode]);

  /** 通道行：名称 + 一个「移动」按钮（收进小菜单，不占名称的宽度） */
  const renderChannelRow = (c: VideoChannel) => {
    const isPicked = picked?.channelCode === c.channelCode;
    return (
      <div
        key={c.channelCode}
        className={cn("flex items-center gap-1 rounded-twin-sm pr-0.5", isPicked && "bg-[var(--app-color-accent)]")}
      >
        <button
          type="button"
          draggable
          data-channel={c.channelCode}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", c.channelCode);
            setPicked(c);
          }}
          onClick={() => setPicked(c)}
          title={c.channelName}
          className={cn(
            "min-w-0 flex-1 truncate rounded-twin-sm px-1 py-1 text-left text-[12px] transition",
            isPicked
              ? "font-medium text-white"
              : "text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"
          )}
        >
          {c.channelName}
        </button>
        {c.linkUrl ? (
          <a
            href={c.linkUrl}
            target="_blank"
            rel="noreferrer"
            title={`打开设备页面：${c.linkUrl}`}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "shrink-0 rounded p-0.5 transition",
              isPicked
                ? "text-white/80 hover:text-white"
                : "text-[var(--app-color-accent)] hover:text-[var(--app-color-accent-hover)]"
            )}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="更多"
              className={cn(
                "shrink-0 rounded p-0.5 transition",
                isPicked
                  ? "text-white/80 hover:text-white"
                  : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"
              )}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-max min-w-[11rem]">
            <DropdownMenuItem onClick={() => void askSetLink(c)}>
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              {c.linkUrl ? "修改跳转地址…" : "设置跳转地址…"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMoveTarget(c)}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" />移动到文件夹…
            </DropdownMenuItem>

          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-4">
      {/* 顶部：墙体 + 预设 + 宫格 + 状态 + 动作，全部挤一行；低频动作收进「更多」 */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <MonitorPlay className="h-4 w-4 shrink-0 text-[var(--app-color-text-tertiary)]" />
          <PlainSelect
            className="w-36 shrink-0"
            value={wallName}
            onChange={(name) => {
              const w = (wallsQ.data ?? []).find((x) => x.tvWallName === name);
              if (w) setTvWallId(w.tvWallId);
            }}
            options={(wallsQ.data ?? []).map((w) => w.tvWallName)}
            placeholder="选电视墙"
            hideClear
            onOpen={() => void wallsQ.refetch()}
          />
        </div>

        <PlainSelect
          className="w-44 shrink-0"
          value={presetPreviewName}
          onChange={async (name) => {
            // 画布改过再切预设，先问一句，别把改动悄悄丢掉
            if (name !== presetPreviewName && dirty) {
              const go = await appConfirm("画布有未保存的改动，仍要切换预设吗？", {
                title: "未保存的改动",
                danger: true,
              });
              if (!go) return;
            }
            // 预设有两种用法：先预览再决定要不要上墙。所以选中预设一律退出实时模式，
            // 免得预览的动作被实时推上大屏 —— 只有参观模式例外（它本来就要直接上墙）。
            if (!tour) setLive(false);
            if (!name) {
              setPresetId("");
              return;
            }
            const t = (tasksQ.data ?? []).find((x) => x.taskName === name);
            if (!t) return;
            setPresetId(t.taskId);
            void previewPreset(tvWallId, t.taskId);
            if (tour) applyM.mutate(t.taskId);
          }}
          options={(tasksQ.data ?? []).map((t) => t.taskName)}
          placeholder="预设（选中先预览）"
          clearLabel="不预览任何预设"
          onOpen={() => void tasksQ.refetch()}
          renderItemActions={(name) => {
            const t = (tasksQ.data ?? []).find((x) => x.taskName === name);
            if (!t) return null;
            return (
              <span className="flex shrink-0 items-center gap-0.5 pr-1">
                <button
                  type="button"
                  title="重命名（方案内容不变）"
                  onClick={(e) => {
                    e.stopPropagation();
                    void askRenamePreset(t);
                  }}
                  className="rounded p-1 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="复制到其它电视墙"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCopySource({ taskId: String(t.taskId), name: t.taskName });
                    setCopyTarget("");
                    setCopyName(`${t.taskName} 副本`);
                    setCopyOpen(true);
                  }}
                  className="rounded p-1 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="删除该预设"
                  onClick={(e) => {
                    e.stopPropagation();
                    void askDeletePreset(t);
                  }}
                  className="rounded p-1 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-error)]"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            );
          }}
        />
        <div className="flex shrink-0 items-center gap-1">
          <AdminButton
            size="icon-sm"
            tone="secondary"
            disabled={!tvWallId}
            onClick={() => setPresetDialogOpen(true)}
            title="另存为新预设（当前画布存成一条新预设）"
            aria-label="存为预设"
          >
            <Save className="h-3.5 w-3.5" />
          </AdminButton>

          {dirty && (
            <button
              type="button"
              onClick={() => saveM.mutate(true)}
              title={`覆盖保存到「${presetPreviewName}」`}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-[var(--app-color-feedback-danger-ink)] bg-[var(--app-color-feedback-danger-soft)] px-2 py-1.5 text-[11px] font-medium text-[var(--app-color-feedback-danger-ink)]"
            >
              <Save className="h-3.5 w-3.5" />
              保存当前预设
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="whitespace-nowrap text-[11px] text-[var(--app-color-text-tertiary)]">
            切分（{activeScreenLabel}）
          </span>
          <PlainSelect
            className="w-36 shrink-0"
            value={labelOf(activeScreenId)}
            onChange={(v) => setLayoutOne(activeScreenId, v)}
            options={LAYOUT_OPTIONS}
            placeholder="切分"
            hideClear
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AdminButton tone="secondary" size="sm" className="ml-auto shrink-0" title="更多操作">
              <MoreHorizontal className="mr-1.5 h-4 w-4" />更多
            </AdminButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={() => {
                wallsQ.refetch();
                channelsQ.refetch();
                currentQ.refetch();
                catsQ.refetch();
              }}
            >
              <RotateCw className="mr-2 h-4 w-4" />刷新
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={pullChannelsM.isPending}
              onSelect={() => pullChannelsM.mutate()}
            >
              <Download className="mr-2 h-4 w-4" />拉取通道（同步大华）
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!tvWallId || layoutM.isPending} onClick={() =>
                layoutM.mutate({
                  screens: wallScreens.map((s) => ({ screenId: s.screenId, splitNum: 0, windows: [] })),
                })
              }>
              <Eraser className="mr-2 h-4 w-4" />清空该屏
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 「实时」做进「立即上墙」本体：左半按一次就上墙，右半是模式切换 */}
        <div className="flex shrink-0 items-stretch overflow-hidden rounded-lg border border-[var(--app-color-accent)]">
          <AdminButton
            size="sm"
            className="shrink-0 rounded-none border-0 shadow-none"
            onClick={() => layoutM.mutate({ screens: screensSpec })}
            disabled={!tvWallId || layoutM.isPending || live}
            loading={layoutM.isPending}
            title={live ? "实时模式已打开，改动会自动上墙" : "把画布当前内容推到大屏"}
          >
            <Upload className="mr-1.5 h-4 w-4" />立即上墙
          </AdminButton>
          <button
            type="button"
            aria-pressed={live}
            onClick={() => {
              setLive((v) => !v);
              setTour(false);
            }}
            title="实时：打开后画布一有改动就自动上墙，不用再点「立即上墙」"
            className={cn(
              "flex items-center gap-1 border-l border-[var(--app-color-accent)] px-2.5 text-xs font-medium transition-colors",
              live
                ? "bg-[var(--app-color-feedback-danger-soft)] text-[var(--app-color-feedback-danger-ink)]"
                : "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
            )}
          >
            <Zap className={cn("h-3.5 w-3.5", live && "fill-current")} />
            实时
          </button>
        </div>

        {/* 参观：主按钮是开关（打开即弹出参观顺序），右侧小箭头随时再打开配置 */}
        <div
          className={cn(
            "flex shrink-0 items-stretch overflow-hidden rounded-lg border",
            tour ? "border-[var(--app-color-accent)]" : "border-[var(--app-color-border-default)]"
          )}
        >
          <AdminButton
            size="sm"
            tone={tour ? "primary" : "secondary"}
            className="rounded-none border-0 shadow-none"
            onClick={toggleTour}
            title="参观模式：点开即弹参观顺序；点方块直接切换大屏"
          >
            <Eye className="mr-1.5 h-4 w-4" />参观模式
          </AdminButton>
          <button
            type="button"
            onClick={() => {
              if (!tour) {
                setTour(true);
                setLive(false);
              }
              setTourOpen(true);
            }}
            title="配置参观顺序"
            className={cn(
              "flex items-center border-l px-2 transition-colors",
              tour
                ? "border-[var(--app-color-accent)] bg-[var(--app-color-surface-container)] text-[var(--app-color-accent)]"
                : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>另存为新预设</DialogTitle>
            <DialogDescription>把当前「{labelOf(activeScreenId)}」的摆放存成**一条新预设**；要覆盖已有预设请用下面的「保存当前预设」。</DialogDescription>
          </DialogHeader>
          <AdminFormInput
            autoFocus
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && presetName.trim()) saveM.mutate(false);
            }}
            placeholder="例如：2F饲养间16宫格"
          />
          <DialogFooter>
            <AdminButton tone="ghost" onClick={() => setPresetDialogOpen(false)}>取消</AdminButton>
            <AdminButton disabled={!presetName.trim()} loading={saveM.isPending} onClick={() => saveM.mutate(false)}>
              保存
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 移动通道：目标用「可搜索、可折叠」的文件夹树选，不再平铺一长串 */}
      <Dialog
        open={moveTarget !== null}
        onOpenChange={(v) => {
          if (!v) setMoveTarget(null);
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

      {/* 复制到其它电视墙：原版没有，这里补上 */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>复制预设到其它电视墙</DialogTitle>
            <DialogDescription>
              把预设「{copySource?.name ?? ""}」复制成另一面墙上的新预设（目标墙的屏按顺序对应，对不上的屏留空）。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <PlainSelect
              value={copyTarget}
              onChange={setCopyTarget}
              options={(wallsQ.data ?? [])
                .filter((w) => w.tvWallId !== tvWallId)
                .map((w) => w.tvWallName)}
              placeholder="选目标电视墙"
              hideClear
            />
            <AdminFormInput
              value={copyName}
              onChange={(e) => setCopyName(e.target.value)}
              placeholder="新预设名称"
            />
          </div>
          <DialogFooter>
            <AdminButton tone="ghost" onClick={() => setCopyOpen(false)}>取消</AdminButton>
            <AdminButton
              disabled={!copyTarget || !copyName.trim() || copyM.isPending}
              loading={copyM.isPending}
              onClick={() => copyM.mutate()}
            >
              复制
            </AdminButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 参观顺序：大宫格，点方块直接切大屏；顺序就是讲解顺序 */}
      <Dialog open={tourOpen} onOpenChange={setTourOpen}>
        <DialogContent className="flex h-[84vh] w-[92vw] max-w-[1100px] flex-col gap-3 p-5">
          <DialogHeader>
            <DialogTitle>参观顺序</DialogTitle>
            <DialogDescription>
              点方块直接切到那个预设；方块顺序就是讲解顺序。改动会自动保存，两端共用。
            </DialogDescription>
          </DialogHeader>

          {/* 页签：参观顺序 / 网页控制。**选中项用实色主色**，否则两个页签会跟容器糊在一起 */}
          <div className="flex shrink-0 items-center gap-1 self-start rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-1">
            <button
              type="button"
              onClick={() => setTourTab("presets")}
              className={cn(
                "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                tourTab === "presets"
                  ? "bg-[var(--app-color-accent)] text-white shadow-sm"
                  : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
              )}
            >
              参观顺序
            </button>
            <button
              type="button"
              onClick={() => setTourTab("screens")}
              className={cn(
                "rounded-md px-4 py-1.5 text-xs font-medium transition-colors",
                tourTab === "screens"
                  ? "bg-[var(--app-color-accent)] text-white shadow-sm"
                  : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
              )}
            >
              网页控制{tourScreens.length > 0 ? ` (${tourScreens.length})` : ""}
            </button>
          </div>

          {tourTab === "presets" ? (
            <>
          {tourItems.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--app-color-border-default)] text-sm text-[var(--app-color-text-tertiary)]">
              还没有参观顺序，从下面挑预设加进来
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <div
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
              >
                {tourItems.map((t, i) => {
                  const id = String(t.taskId);
                  const active = tourActiveId === id;
                  const color = TOUR_COLORS[i % TOUR_COLORS.length];
                  return (
                    /* 整块可点，但**不再用一个 absolute 兄弟层盖上去** ——
                       那样「当前」标记和操作按钮会互相压住。操作按钮直接放进卡片底部。 */
                    <div
                      key={id}
                      role="button"
                      tabIndex={0}
                      onClick={() => tourApply(id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          tourApply(id);
                        }
                      }}
                      title={t.taskName}
                      className={cn(
                        "relative flex min-h-[152px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl px-4 pb-12 pt-8 text-center text-white transition",
                        active
                          ? "ring-4 ring-inset ring-white shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
                          : "hover:brightness-110"
                      )}
                      style={{ backgroundColor: color }}
                    >
                      <span className="absolute left-3 top-2 text-xs font-semibold tabular-nums text-white/85">
                        {i + 1}
                      </span>
                      {active ? (
                        <span className="absolute right-2 top-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-800">
                          当前
                        </span>
                      ) : null}
                      <span className="line-clamp-3 break-all text-base font-semibold leading-snug">
                        {t.taskName}
                      </span>

                      {/* 排序 / 移出：固定在卡片底部一排。**实色白底**（半透明在实色卡上看不见） */}
                      <span className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1">
                        <button
                          type="button"
                          title="上移"
                          disabled={i === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (i === 0) return;
                            const next = [...tourIds];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            setTourIds(next);
                          }}
                          className="rounded-md bg-white px-1.5 py-1 text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="下移"
                          disabled={i === tourIds.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (i === tourIds.length - 1) return;
                            const next = [...tourIds];
                            [next[i + 1], next[i]] = [next[i], next[i + 1]];
                            setTourIds(next);
                          }}
                          className="rounded-md bg-white px-1.5 py-1 text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="移出参观顺序"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTourIds(tourIds.filter((x) => String(x) !== id));
                          }}
                          className="rounded-md bg-white px-1.5 py-1 text-red-600 shadow-sm transition hover:bg-red-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="shrink-0 border-t border-[var(--twin-hairline)] pt-3">
            <div className="mb-2 text-xs text-[var(--app-color-text-tertiary)]">
              加入参观顺序（这面墙还有 {tourRest.length} 个预设没进去）
            </div>
            <div className="flex max-h-24 flex-wrap gap-2 overflow-auto">
              {tourRest.map((t) => (
                <button
                  key={String(t.taskId)}
                  type="button"
                  onClick={() => setTourIds([...tourIds, String(t.taskId)])}
                  className="flex items-center gap-1 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-1.5 text-xs text-[var(--app-color-text-primary)] transition hover:border-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]"
                >
                  ＋ {t.taskName}
                </button>
              ))}
              {tourRest.length === 0 ? (
                <span className="text-xs text-[var(--app-color-text-tertiary)]">这面墙的预设都已在顺序里</span>
              ) : null}
            </div>
          </div>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {tourScreen ? (
                <>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTourScreenId(null)}
                      className="rounded-md border border-[var(--app-color-border-default)] px-2 py-1 text-xs text-[var(--app-color-text-secondary)] transition hover:bg-[var(--app-color-surface-hover)]"
                    >
                      ‹ 返回列表
                    </button>
                    <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">
                      {tourScreen.label || "未命名屏幕"}
                    </span>
                    <span className="text-xs text-[var(--app-color-text-tertiary)]">
                      当前：{tourScreen.route || "—"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <input
                      value={routeQuery}
                      onChange={(e) => setRouteQuery(e.target.value)}
                      placeholder="搜索页面名称…"
                      className="h-8 w-60 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 text-xs text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
                    />
                    <span className="text-xs text-[var(--app-color-text-tertiary)]">
                      {routeRows.length} 个页面 · 收藏的排在最前
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto">
                    <div
                      className="grid gap-3"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
                    >
                      {routeRows.length === 0 ? (
                        <div className="col-span-full py-10 text-center text-sm text-[var(--app-color-text-tertiary)]">
                          没有匹配的页面
                        </div>
                      ) : null}
                      {routeRows.map((r) => {
                        const on = tourScreen.route === r.value;
                        const starred = starredSet.has(normalizeAdminPath(r.value));
                        return (
                          <div key={r.value} className="relative">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => screenNavM.mutate({ screenId: tourScreen.screenId, route: r.value, code: pairedCode || undefined })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  screenNavM.mutate({ screenId: tourScreen.screenId, route: r.value, code: pairedCode || undefined });
                                }
                              }}
                              className={cn(
                                "flex min-h-[104px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border p-3 pr-6 text-center transition",
                                on
                                  ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-white"
                                  : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-primary)] hover:border-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]"
                              )}
                            >
                              <span className="text-sm font-semibold">{r.label}</span>
                              <span
                                className={cn(
                                  "break-all text-[10px]",
                                  on ? "text-white/80" : "text-[var(--app-color-text-tertiary)]"
                                )}
                              >
                                {r.value}
                              </span>
                              {on ? <span className="text-[10px] font-medium">当前</span> : null}
                            </div>
                            {/* 收藏：与侧栏「收藏」同一份数据，点星号加入/移出 */}
                            <button
                              type="button"
                              title={starred ? "取消收藏" : "收藏这个页面"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStar(r.value);
                              }}
                              className={cn(
                                "absolute right-1.5 top-1.5 rounded p-1 transition",
                                on ? "text-white/80 hover:text-white" : "text-[var(--app-color-text-tertiary)] hover:text-amber-500",
                                starred && !on ? "text-amber-500" : ""
                              )}
                            >
                              <Star className={cn("h-3.5 w-3.5", starred && "fill-current")} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                  {/* 配对码：平板/手机连别的账号、别的设备上打开的页面 */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <input
                      value={pairCode}
                      onChange={(e) => setPairCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && pairCode.trim()) pairM.mutate(pairCode.trim());
                      }}
                      maxLength={6}
                      placeholder="输入页面上的 6 位配对码"
                      className="h-8 w-56 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2 font-mono text-sm tracking-[0.2em] text-[var(--app-color-text-primary)] outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-[var(--app-color-text-tertiary)]"
                    />
                    <AdminButton
                      tone="primary"
                      className="h-8 px-3 text-xs"
                      loading={pairM.isPending}
                      disabled={!pairCode.trim()}
                      onClick={() => pairM.mutate(pairCode.trim())}
                    >
                      连接
                    </AdminButton>
                    <span className="text-xs text-[var(--app-color-text-tertiary)]">
                      同账号的页面自动列在下面；别的账号/设备用上面的配对码
                    </span>
                  </div>

                  <div className="min-h-0 flex-1 overflow-auto">
                    {screenRows.length === 0 ? (
                      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--app-color-border-default)] px-6 text-center text-sm text-[var(--app-color-text-tertiary)]">
                        没有在线网页。用同一个账号打开网站页面，它会自动出现在这里；别的账号用上面的配对码。
                      </div>
                    ) : (
                      <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
                      >
                        {screenRows.map((s) => {
                          // 当前这个标签页自己也在列表里：标出来且不允许控制自己
                          const isSelf = s.screenId === getCurrentScreenId();
                          return (
                            <button
                              key={s.screenId}
                              type="button"
                              disabled={isSelf}
                              onClick={() => {
                                setPairedCode("");
                                setTourScreenId(s.screenId);
                              }}
                              className={cn(
                                "relative flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-2xl border p-4 text-center transition",
                                isSelf
                                  ? "cursor-not-allowed border-dashed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] opacity-70"
                                  : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] hover:border-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]"
                              )}
                            >
                              {isSelf ? (
                                <span className="absolute right-2 top-2 rounded-full bg-[var(--app-color-surface-hover)] px-2 py-0.5 text-[10px] text-[var(--app-color-text-secondary)]">
                                  本页
                                </span>
                              ) : null}
                              <span className="text-base font-semibold text-[var(--app-color-text-primary)]">
                                {s.label || "未命名屏幕"}
                              </span>
                              <span className="break-all text-[11px] text-[var(--app-color-text-secondary)]">
                                {s.route || "—"}
                              </span>
                              <span className="text-[10px] text-[var(--app-color-text-tertiary)]">
                                {isSelf ? "这是你正在操作的这个页面" : s.ip}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 主体：通道源 | 大屏网格 | 窗口明细 */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* 通道源 */}
        <AdminFormCard fill className="w-72 shrink-0">
          {/* 卡片内容区是 overflow-auto，四周留一点内边距，否则输入框的高亮环会被裁掉 */}
          <div className="relative mb-2 px-1 pt-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-color-text-tertiary)]" />
            <AdminFormInput
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜通道名称"
              aria-label="搜索通道名称"
              className="py-1.5 pl-8 text-xs"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto overscroll-y-contain [scrollbar-gutter:stable]">
            {channelsQ.isLoading ? (
              <p className="p-2 text-xs text-[var(--app-color-text-tertiary)]">加载中…</p>
            ) : (channelsQ.data ?? []).length === 0 ? (
              <p className="p-2 text-xs text-[var(--app-color-text-tertiary)]">
                没有通道。可能还没刷新通道缓存（门禁/元数据页可触发刷新）。
              </p>
            ) : (
              <Tree<CatNode>
                nodes={nodesForTree}
                getId={(n) => n.id}
                getName={(n) => n.name}
                renderSuffix={(n) => renderOnlineSuffix(n)}
                getChildren={(n) => n.children}
                expandable={(n) => n.children.length > 0 || channelsUnder(n).length > 0}
                selectedId={null}
                expanded={expandedIds}
                onSelect={(id) => {
                  if (expandedIds.has(id)) toggleExpand(id);
                }}
                onToggle={toggleExpand}
                renderExtras={(n, depth) => {
                  const list = channelsUnder(n);
                  if (!list.length) return null;
                  return (
                    <div className="space-y-0.5" style={{ paddingLeft: (depth + 1) * 8 }}>
                      {list.map(renderChannelRow)}
                    </div>
                  );
                }}
                renderMenu={(n, h) =>
                  n.id === UNASSIGNED_ID ? (
                    <DropdownMenuLabel>未分类</DropdownMenuLabel>
                  ) : (
                    <>
                      <DropdownMenuItem onSelect={h.startCreateChild}>
                        <FolderPlus className="mr-2 h-3.5 w-3.5" />新建子文件夹
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => void askRename(n)}>
                        <Pencil className="mr-2 h-3.5 w-3.5" />重命名
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => void askDeleteFolder(n)}
                        className="text-[var(--app-color-feedback-error)]"
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />删除文件夹
                      </DropdownMenuItem>
                    </>
                  )
                }
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

        {/* 大屏网格（右侧整块） */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2 shadow-sm">
          <div className="flex min-h-0 flex-1 gap-2">
            {wallScreens.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg bg-slate-900 text-[11px] text-white/40">
                {wallQ.isLoading ? "读取屏幕布局…" : "这面墙没有可用的屏幕"}
              </div>
            ) : (
              wallScreens.map((s) => {
                const sid = s.screenId;
                const rects = rectsOf(sid);
                const sp = rects.length;
                return (
                  <div
                    key={sid}
                    data-screen={sid}
                    onClick={() => setSelectedScreen(sid)}
                    className={cn(
                      "relative min-h-0 min-w-0 overflow-hidden rounded-lg border bg-slate-900 transition-shadow",
                      activeScreenId === sid
                        ? "border-[var(--app-color-accent)] ring-2 ring-[var(--app-color-accent)]"
                        : "border-white/20 hover:border-white/40"
                    )}
                    style={{ flexGrow: s.width || 1 }}
                    title={s.name ? `屏幕 ${s.name}` : undefined}
                  >
                    {rects.map((r, i) => {
                      const key = `${sid}:${i}`;
                      const ch = slots[key];
                      return (
                        <div
                          key={key}
                          draggable={!!ch}
                          onDragStart={(e) => {
                            if (!ch) return;
                            // 用自定义类型区分「格子之间的搬动」与「从左树拖进来的通道」
                            e.dataTransfer.setData("application/x-tvwall-cell", key);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const fromCell = e.dataTransfer.getData("application/x-tvwall-cell");
                            if (fromCell) {
                              if (fromCell !== key) swapSlots(fromCell, key);
                              return;
                            }
                            const code = e.dataTransfer.getData("text/plain");
                            const found =
                              picked?.channelCode === code
                                ? picked
                                : (channelsQ.data ?? []).find((c) => c.channelCode === code);
                            if (found) put(key, found);
                          }}
                          onClick={() => {
                            // 点格子顺带选中这块屏（顶部切分就作用在选中的屏上）；
                            // 手上有通道就是放置；没有就是「在左树里找它」。
                            // 清空一律走右上角的 ×，避免误点把画面清掉
                            setSelectedScreen(sid);
                            if (picked) put(key, picked);
                            else if (ch) focusChannelInTree(ch);
                          }}
                          style={{
                            left: `${r.left}%`,
                            top: `${r.top}%`,
                            width: `${r.width}%`,
                            height: `${r.height}%`,
                          }}
                          className="group absolute box-border flex cursor-pointer items-center justify-center overflow-hidden border border-white/25 p-1 transition-colors hover:border-[var(--app-color-accent)]"
                          title={ch ? ch.channelName : `窗口 ${i + 1}`}
                        >
                          {ch ? (
                            <>
                              <span
                                className={cn(
                                  "line-clamp-3 max-w-full break-all text-center font-semibold leading-tight text-white/95",
                                  sp <= 4 ? "text-base" : sp <= 9 ? "text-sm" : "text-[11px]"
                                )}
                              >
                                {displayFloorAndName(ch.channelName)}
                              </span>
                              <span className="absolute right-0.5 top-0.5 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                                {ch.linkUrl ? (
                                  <a
                                    href={ch.linkUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={`打开设备页面：${ch.linkUrl}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded bg-black/40 p-0.5 text-white/70 transition hover:text-white"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : null}
                                <button
                                  type="button"
                                  title="清空该窗口"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    put(key, null);
                                  }}
                                  className="rounded bg-black/40 p-0.5 text-white/70 transition hover:text-white"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] text-white/35">{i + 1}</span>
                          )}
                          {/* 拖右/下边改分界：悬停才显形，不占版面 */}
                          <span
                            onPointerDown={(e) => startResize(e, sid, i, "right")}
                            onClick={(e) => e.stopPropagation()}
                            title="拖动调整分界"
                            className={cn(
                              "absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize transition",
                              customMode ? "bg-white/20" : "bg-transparent group-hover:bg-white/25"
                            )}
                          />
                          <span
                            onPointerDown={(e) => startResize(e, sid, i, "bottom")}
                            onClick={(e) => e.stopPropagation()}
                            title="拖动调整分界"
                            className={cn(
                              "absolute bottom-0 left-0 z-10 h-1.5 w-full cursor-row-resize transition",
                              customMode ? "bg-white/20" : "bg-transparent group-hover:bg-white/25"
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

