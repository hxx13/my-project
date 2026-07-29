import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Portal } from "@/components/Portal";
import {
    fetchCardMappings, searchCardMappings, updateExemptFlag, updateCardStatus, searchPersonnel,
    deleteCardMapping, deleteDahuaCard, runManualReaper, issueDahuaCard, fetchDahuaDepartments, refreshDahuaDepartments,
    fetchDahuaDoorGroups, refreshDahuaDoorGroups, fetchFreezeConfig, saveFreezeConfig,
    fetchAccessRuleScanLinkageConfig, saveAccessRuleScanLinkageConfig,
    fetchDahuaIssueAccessPrefill,
    type DahuaIssueAccessPrefill,
    addCardToExistingDahuaPerson,
    fetchDahuaDeviceChannels, fetchDahuaDeviceChannelRemarkCategories,
    fetchExemptHistory, type ExemptHistoryEntry,
    type DahuaDepartmentRow, type DahuaDoorGroupRow,
    type DahuaDeviceChannelRow, type DahuaDeviceChannelRemarkCategory, type CardMappingRow,
} from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { adminHintClass, adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authHttp } from "@/api/core/authHttp";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {RefreshCw, ShieldCheck, Link, Ban, Plus, User, Check, Loader2, X, Trash2, Clock, MoreHorizontal, ShieldAlert, Camera, ImageUp, History} from "lucide-react";
import {
    labelForChannelRow,
    normalizeChannelCode,
    resolveChannelLabelsByCodes,
    useHydrateChannelNameMap,
} from "@/utils/dahuaChannelUtils";
import {
    DAHUA_ISSUE_DEFAULT_DEPARTMENT_ID,
    DAHUA_ISSUE_DEFAULT_DOOR_GROUP_IDS,
} from "@/constants/dahuaIssueDefaults";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import { uploadBaselinePhoto, deleteBaselinePhoto, deleteBaselinePhotoById, fetchBaselinePhoto, type BaselinePhoto } from "@/api/domains/face.api";
import { FaceEnrollment } from "@/components/face-verify";
import { forceReleaseAllFaceCameras } from "@/components/face-verify/faceCameraExclusive";
import {
    FACE_MODAL_BACKDROP_CLASS,
    FACE_MODAL_SHELL_CLASS,
} from "@/components/face-verify/faceConfig";
import { Z_INDEX } from "@/constants/zIndex";
import {
    DEFAULT_EXEMPT_UNTIL_TIME,
    formatExemptExpireAt,
    formatExemptRemaining,
    EXEMPT_MODE_OPTIONS,
    formatExemptStatus,
    parseExemptRoomNames,
} from "@/constants/exemptDurationPresets";
import { ExemptUntilTimePicker } from "@/components/admin/ExemptUntilTimePicker";
import { ScanDelayConfigPanel } from "@/components/scanner/ScanDelayConfigPanel";
import { adminChromeTitle } from "@/features/admin/adminShellNavigation";

/** 自动冻结解释与保存均固定为中国时区 */
const FREEZE_TIMEZONE_CN = "Asia/Shanghai";

/** 全天 15 分钟粒度，供下拉选择 */
const FREEZE_TIME_OPTIONS: string[] = (() => {
    const o: string[] = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
            o.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
        }
    }
    return o;
})();

/** 轨迹时间统一为 yyyy-MM-dd HH:mm:ss（后端已按墙钟输出，这里仅防御 ISO 'T' 分隔） */
const formatExemptHistoryTime = (v?: string) => (v ? v.replace("T", " ").slice(0, 19) : "—");

export default function DebugCardMappingPage() {
    const location = useLocation();
    const pageLabel = useMemo(() => adminChromeTitle(location.pathname), [location.pathname]);

    const [page, setPage] = useState(1);
    const pageSize = 100;

    // 2. 在组件内部增加 state：
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [bindForm, setBindForm] = useState({
        cardNo: '',
        aroUserId: '',
        userName: '',
        departmentId: '',
        /** 大华通道 resource 编码，多选 */
        channelCodes: [] as string[],
        doorGroupIds: [] as number[],
    });
    const [channelSearchKeyword, setChannelSearchKeyword] = useState("");
    const [channelRemarkId, setChannelRemarkId] = useState<number | "">("");
    const [channelRemarkCategories, setChannelRemarkCategories] = useState<DahuaDeviceChannelRemarkCategory[]>([]);
    const [channelRows, setChannelRows] = useState<DahuaDeviceChannelRow[]>([]);
    const [channelTotal, setChannelTotal] = useState(0);
    const [channelPage, setChannelPage] = useState(1);
    const [channelLoading, setChannelLoading] = useState(false);
    const [channelNameMap, setChannelNameMap] = useState<Record<string, string>>({});
    const [showPasteChannels, setShowPasteChannels] = useState(false);
    const [pasteChannelRaw, setPasteChannelRaw] = useState("");
    const [searchUserResult, setSearchUserResult] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchDraft, setSearchDraft] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [departments, setDepartments] = useState<DahuaDepartmentRow[]>([]);
    const [doorGroups, setDoorGroups] = useState<DahuaDoorGroupRow[]>([]);
    const [issueSteps, setIssueSteps] = useState<Array<{ stepName?: string; success?: boolean; upstreamCode?: string; upstreamErrMsg?: string; message?: string }>>([]);
    const [personKeyword, setPersonKeyword] = useState("");
    const personSearchTimer = useRef<number | null>(null);
    const cardInputRef = useRef<HTMLInputElement | null>(null);
    const cardScanBufferRef = useRef("");
    const cardScanResetTimer = useRef<number | null>(null);
    const cardComposingRef = useRef(false);
    const [expandedDeptIds, setExpandedDeptIds] = useState<Set<number>>(new Set());
    const [issuingPhase, setIssuingPhase] = useState(0);
    const [freezeLoading, setFreezeLoading] = useState(false);
    const [freezeSaving, setFreezeSaving] = useState(false);
    const [freezeForm, setFreezeForm] = useState({
        enabled: true,
        freezeTime: "18:00",
        secondFreezeTime: "",
        secondFreezeAutoSignoutEnabled: false,
        dailyExemptRevokeAutoSignoutEnabled: false,
    });
    /** 1=第一次定时 2=第二次定时 */
    const [freezeSlotModal, setFreezeSlotModal] = useState<null | 1 | 2>(null);
    const [exemptModal, setExemptModal] = useState<{
        cardNo: string; userName?: string; aroUserId?: string;
    } | null>(null);
    /** 豁免轨迹弹窗：按卡号反查授予/收回全记录 */
    const [exemptHistoryModal, setExemptHistoryModal] = useState<{
        cardNo: string; userName?: string;
    } | null>(null);
    const [exemptRoomOptions, setExemptRoomOptions] = useState<
        { roomId: string; roomName: string; selected: boolean }[]
    >([]);
    const [exemptMode, setExemptMode] = useState<string>("TIME");
    const [exemptMaxCount, setExemptMaxCount] = useState<string>("");
    const [exemptUntilTime, setExemptUntilTime] = useState<string>(DEFAULT_EXEMPT_UNTIL_TIME);
    const [exemptRoomsLoading, setExemptRoomsLoading] = useState(false);
    const [exemptFilter, setExemptFilter] = useState<"all" | "exempt" | "controlled">("all");
    const queryClient = useQueryClient();
    const [scanDelayModalOpen, setScanDelayModalOpen] = useState(false);
    const [linkageModalOpen, setLinkageModalOpen] = useState(false);
    const [linkageLoading, setLinkageLoading] = useState(false);
    const [linkageSaving, setLinkageSaving] = useState(false);
    const [linkageForm, setLinkageForm] = useState({
        enterDispatchEnabled: true,
        exitDispatchEnabled: true,
        enterUnfreezeEnabled: true,
        exitFreezeEnabled: true,
        swipeExitSkipConfirm: false,
    });
    const [issueAccessPrefill, setIssueAccessPrefill] = useState<DahuaIssueAccessPrefill | null>(null);
    const [issueRuleSelectedKeys, setIssueRuleSelectedKeys] = useState<string[]>([]);
    const [issuePrefillLoading, setIssuePrefillLoading] = useState(false);
    /** 扫码门禁联动：离开时是否冻结；为 false 时不自动勾选门禁规则通道 */
    const [scanExitFreezeEnabled, setScanExitFreezeEnabled] = useState(true);

    /** 追加卡片弹窗 */
    const [addCardModalOpen, setAddCardModalOpen] = useState(false);
    const [addCardTarget, setAddCardTarget] = useState<CardMappingRow | null>(null);
    const [addCardNo, setAddCardNo] = useState("");
    const addCardScanBufferRef = useRef("");
    const addCardScanResetTimer = useRef<number | null>(null);
    const addCardComposingRef = useRef(false);
    const addCardInputRef = useRef<HTMLInputElement | null>(null);

    const issuingPhaseLabels = [
        "正在生成人员全局ID...",
        "正在下发人员信息...",
        "正在下发权限信息...",
        "正在激活卡片...",
        "正在本地落库映射..."
    ];

    const { data, isLoading, refetch } = useQuery({
        queryKey: ["cardMappings", page, pageSize],
        queryFn: () => fetchCardMappings(page, pageSize),
    });

    // 3. 增加绑卡提交的 Mutation：
    const issueDahuaMutation = useMutation({
        mutationFn: issueDahuaCard,
        onSuccess: (result) => {
            setIssueSteps(result?.steps || []);
            setIssuingPhase(0);
            if (result?.success) {
                toast.success("大华发卡成功");
                closeIssueModal();
                refetch();
                return;
            }
            const failStep = result?.failStep || "unknown";
            const last = (result?.steps || []).find((it) => it.success === false);
            const reason = last?.upstreamErrMsg || last?.message || "未知错误";
            toast.error(`发卡失败（${failStep}）：${reason}`);
        },
        onError: (err: unknown) => {
            setIssuingPhase(0);
            toast.error(err instanceof Error ? err.message : "大华发卡失败");
        }
    });

    // 为已有人员追加卡片 Mutation
    const addCardMutation = useMutation({
        mutationFn: addCardToExistingDahuaPerson,
        onSuccess: (result) => {
            if (result?.success) {
                toast.success("卡片追加成功");
                closeAddCardModal();
                refetch();
                return;
            }
            const failStep = result?.failStep || "unknown";
            const last = (result?.steps || []).find((it) => it.success === false);
            const reason = last?.upstreamErrMsg || last?.message || "未知错误";
            toast.error(`追加卡片失败（${failStep}）：${reason}`);
        },
        onError: (err: unknown) => {
            toast.error(err instanceof Error ? err.message : "追加卡片失败");
        }
    });

    // 删除大华卡片 + 本地映射
    const deleteDahuaCardMutation = useMutation({
        mutationFn: (cardNo: string) => deleteDahuaCard(cardNo),
        onSuccess: () => {
            toast.success("卡片已从大华删除，本地映射已清除");
            refetch();
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "删除大华卡片失败"),
    });

    // 💥 物理映射解除引擎（仅本地，保留兼容）
    const deleteMappingMutation = useMutation({
        mutationFn: (cardNo: string) => deleteCardMapping(cardNo),
        onSuccess: () => {
            // 使用原生的 alert 阻断，或者替换为您项目中的 toast
            alert("✅ 物理映射已彻底销毁！");
            refetch(); // 瞬间重载大屏数据
        },
        onError: (err: any) => alert("❌ 销毁失败: " + err.message)
    });

    // 4. 真实人员搜索逻辑 (在弹窗里搜 ARO 的人)：
    const handleSearchRealUser = async (keyword: string) => {
        const kw = keyword.trim();
        if (!kw) {
            setSearchUserResult([]);
            return;
        }
        try {
            const { data: res } = await searchPersonnel(kw); // 直接查你底层的 aro_personnel
            setSearchUserResult(res || []);
        } catch (e) {
            console.error("查无此人");
        }
    };

    const totalPages = data?.total ? Math.ceil(data.total / pageSize) : 0;

    const loadChannelPicker = async (
        page: number,
        append: boolean,
        kw?: string,
        remark?: number | ""
    ) => {
        setChannelLoading(true);
        try {
            const keyword = (kw !== undefined ? kw : channelSearchKeyword).trim();
            const rid = remark !== undefined ? remark : channelRemarkId;
            const res = await fetchDahuaDeviceChannels({
                page,
                pageSize: 40,
                keyword,
                remarkCategoryId: rid === "" ? undefined : Number(rid),
            });
            const batch = res.list || [];
            setChannelNameMap((prev) => {
                const next = { ...prev };
                batch.forEach((row) => {
                    const code = normalizeChannelCode(row.channelCode);
                    if (!code) return;
                    next[code] = labelForChannelRow(row);
                });
                return next;
            });
            setChannelRows((prev) => {
                if (!append) return batch;
                const merged = [...prev, ...batch];
                const seen = new Set<number>();
                return merged.filter((r) => {
                    if (seen.has(r.id)) return false;
                    seen.add(r.id);
                    return true;
                });
            });
            setChannelTotal(res.total || 0);
            setChannelPage(page);
        } catch (e) {
            console.error(e);
        } finally {
            setChannelLoading(false);
        }
    };

    useEffect(() => {
        if (!isAddModalOpen) return;
        (async () => {
            try {
                const [deptRes, dgRes, remarkRes] = await Promise.all([
                    fetchDahuaDepartments(1, 500, ""),
                    fetchDahuaDoorGroups(1, 500, ""),
                    fetchDahuaDeviceChannelRemarkCategories(),
                ]);
                setDepartments(deptRes.list || []);
                setDoorGroups(dgRes.list || []);
                setChannelRemarkCategories(remarkRes || []);
                setChannelSearchKeyword("");
                setChannelRemarkId("");
                setBindForm((prev) => ({
                    ...prev,
                    departmentId: String(DAHUA_ISSUE_DEFAULT_DEPARTMENT_ID),
                    doorGroupIds: [...DAHUA_ISSUE_DEFAULT_DOOR_GROUP_IDS],
                }));
                await loadChannelPicker(1, false, "", "");
            } catch (e) {
                console.error(e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 弹窗打开时拉元数据；检索条件变更用按钮触发
    }, [isAddModalOpen]);

    useEffect(() => {
        return () => {
            if (personSearchTimer.current) {
                window.clearTimeout(personSearchTimer.current);
            }
            if (cardScanResetTimer.current) {
                window.clearTimeout(cardScanResetTimer.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isAddModalOpen) return;
        cardScanBufferRef.current = "";
        if (cardScanResetTimer.current) {
            window.clearTimeout(cardScanResetTimer.current);
            cardScanResetTimer.current = null;
        }
        const timer = window.setTimeout(() => cardInputRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [isAddModalOpen]);

    const loadFreezeForm = async () => {
        setFreezeLoading(true);
        try {
            const data: any = await fetchFreezeConfig();
            setFreezeForm({
                enabled: data?.enabled !== false,
                freezeTime: data?.freezeTime || "18:00",
                secondFreezeTime: data?.secondFreezeTime || "",
                secondFreezeAutoSignoutEnabled: data?.secondFreezeAutoSignoutEnabled === true,
                dailyExemptRevokeAutoSignoutEnabled: data?.dailyExemptRevokeAutoSignoutEnabled === true,
            });
        } catch (e) {
            console.error(e);
        } finally {
            setFreezeLoading(false);
        }
    };

    useEffect(() => {
        loadFreezeForm();
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const cfg = await fetchAccessRuleScanLinkageConfig();
                setScanExitFreezeEnabled(cfg.exitFreezeEnabled !== false);
            } catch {
                setScanExitFreezeEnabled(true);
            }
        })();
    }, []);

    useHydrateChannelNameMap(
        bindForm.channelCodes,
        channelNameMap,
        setChannelNameMap,
        fetchDahuaDeviceChannels,
        isAddModalOpen
    );

    useEffect(() => {
        if (!isAddModalOpen || !bindForm.aroUserId?.trim()) {
            setIssueAccessPrefill(null);
            setIssueRuleSelectedKeys([]);
            setIssuePrefillLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            setIssuePrefillLoading(true);
            try {
                const data = await fetchDahuaIssueAccessPrefill(bindForm.aroUserId.trim());
                if (cancelled) return;
                setIssueAccessPrefill(data);
                const keys = scanExitFreezeEnabled
                    ? (data.ruleMatches || []).filter((m) => m.defaultSelected).map((m) => m.matchKey)
                    : [];
                setIssueRuleSelectedKeys(keys);
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setIssueAccessPrefill(null);
                    setIssueRuleSelectedKeys([]);
                }
            } finally {
                if (!cancelled) setIssuePrefillLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isAddModalOpen, bindForm.aroUserId, scanExitFreezeEnabled]);

    useEffect(() => {
        const keyset = new Set(issueRuleSelectedKeys);
        const ch = new Set<string>();
        const dg = new Set<number>([...DAHUA_ISSUE_DEFAULT_DOOR_GROUP_IDS]);
        if (issueAccessPrefill?.ruleMatches?.length) {
            for (const m of issueAccessPrefill.ruleMatches) {
                if (!keyset.has(m.matchKey)) continue;
                (m.channelResourceCodes || []).forEach((c) => {
                    const k = normalizeChannelCode(c);
                    if (k) ch.add(k);
                });
                (m.doorGroupIds || []).forEach((id) => {
                    if (id != null && !Number.isNaN(Number(id))) dg.add(Number(id));
                });
            }
        }
        setBindForm((prev) => ({ ...prev, channelCodes: Array.from(ch), doorGroupIds: Array.from(dg) }));
    }, [issueRuleSelectedKeys, issueAccessPrefill]);

    useEffect(() => {
        if (!issueDahuaMutation.isPending) {
            setIssuingPhase(0);
            return;
        }
        setIssuingPhase(0);
        const timer = window.setInterval(() => {
            setIssuingPhase((prev) => Math.min(prev + 1, issuingPhaseLabels.length - 1));
        }, 1400);
        return () => window.clearInterval(timer);
    }, [issueDahuaMutation.isPending]);

    const toggleIssueChannel = (code: string, checked: boolean, row?: DahuaDeviceChannelRow) => {
        const k = normalizeChannelCode(code);
        if (!k) return;
        if (checked && row) {
            setChannelNameMap((prev) => ({ ...prev, [k]: labelForChannelRow(row) }));
        }
        setBindForm((prev) => {
            const set = new Set(prev.channelCodes.map(normalizeChannelCode).filter(Boolean));
            if (checked) set.add(k);
            else set.delete(k);
            return { ...prev, channelCodes: Array.from(set) };
        });
    };

    const mergePasteChannels = () => {
        const parts = pasteChannelRaw.split(/[\r\n,;，]+/).map((s) => normalizeChannelCode(s)).filter(Boolean);
        setBindForm((prev) => {
            const set = new Set(prev.channelCodes.map(normalizeChannelCode).filter(Boolean));
            parts.forEach((p) => set.add(p));
            return { ...prev, channelCodes: Array.from(set) };
        });
        void (async () => {
            const labels = await resolveChannelLabelsByCodes(parts, fetchDahuaDeviceChannels);
            setChannelNameMap((prev) => ({ ...prev, ...labels }));
        })();
    };

    const departmentTreeGrouped = useMemo(() => {
        const map = new Map<number, DahuaDepartmentRow[]>();
        departments.forEach((d) => {
            const pid = d.parentId == null ? 0 : Number(d.parentId);
            const arr = map.get(pid) || [];
            arr.push(d);
            map.set(pid, arr);
        });
        map.forEach((arr) => arr.sort((a, b) => Number(a.id) - Number(b.id)));
        const idSet = new Set(departments.map((d) => Number(d.id)));
        const roots = departments.filter((d) => {
            const pid = d.parentId == null ? 0 : Number(d.parentId);
            return pid === 0 || !idSet.has(pid);
        }).sort((a, b) => Number(a.id) - Number(b.id));
        return { roots, childrenMap: map };
    }, [departments]);

    const sortedDoorGroups = useMemo(() => {
        return [...doorGroups].sort((a, b) => {
            const aName = a.name || "";
            const bName = b.name || "";
            const nameCmp = aName.localeCompare(bName, "zh-CN");
            if (nameCmp !== 0) return nameCmp;
            return Number(a.id) - Number(b.id);
        });
    }, [doorGroups]);

    const handleSearch = async (keyword: string) => {
        if (!keyword.trim()) {
            setIsSearching(false);
            return;
        }
        setIsSearching(true);
        try {
            const res = await searchCardMappings(keyword.trim());
            setSearchResults(res || []);
        } catch (error) {
            console.error("映射搜索失败", error);
        }
    };

    const submitMappingSearch = () => {
        void handleSearch(searchDraft);
    };

    const closeIssueModal = () => {
        setIsAddModalOpen(false);
        setSearchUserResult([]);
        setPersonKeyword("");
        setIssueSteps([]);
        setIssueAccessPrefill(null);
        setIssueRuleSelectedKeys([]);
        setIssuePrefillLoading(false);
        setBindForm({ cardNo: "", aroUserId: "", userName: "", departmentId: "", channelCodes: [], doorGroupIds: [] });
        setPasteChannelRaw("");
        setShowPasteChannels(false);
        cardScanBufferRef.current = "";
        if (cardScanResetTimer.current) {
            window.clearTimeout(cardScanResetTimer.current);
            cardScanResetTimer.current = null;
        }
    };

    const sanitizeCardNo = (value: string) => value.replace(/[^0-9A-Za-z]/g, "");

    // ── 追加卡片弹窗 ──
    const openAddCardModal = (row: CardMappingRow) => {
        setAddCardTarget(row);
        setAddCardNo("");
        addCardScanBufferRef.current = "";
        setAddCardModalOpen(true);
    };
    const closeAddCardModal = () => {
        setAddCardModalOpen(false);
        setAddCardTarget(null);
        setAddCardNo("");
        addCardScanBufferRef.current = "";
        if (addCardScanResetTimer.current) {
            window.clearTimeout(addCardScanResetTimer.current);
            addCardScanResetTimer.current = null;
        }
    };

    const updateAddCardNoWithBuffer = (nextValue: string) => {
        addCardScanBufferRef.current = nextValue;
        setAddCardNo(nextValue);
        if (addCardScanResetTimer.current) {
            window.clearTimeout(addCardScanResetTimer.current);
        }
        addCardScanResetTimer.current = window.setTimeout(() => {
            addCardScanBufferRef.current = "";
            addCardScanResetTimer.current = null;
        }, 1200);
    };

    // 追加卡片弹窗的读卡器扫码捕获
    useEffect(() => {
        if (!addCardModalOpen) return;
        const onWinKeyDown = (e: KeyboardEvent) => {
            const el = addCardInputRef.current;
            if (!el || document.activeElement !== el) return;
            if (e.isComposing || e.key === "Process" || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) return;
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            const key = e.key;
            if (key === "Tab") return;
            if (key === "Enter") { e.preventDefault(); return; }
            if (key === "Backspace") { e.preventDefault(); updateAddCardNoWithBuffer(addCardScanBufferRef.current.slice(0, -1)); return; }
            if (key.length !== 1) { e.preventDefault(); return; }
            if (!/[0-9A-Za-z]/.test(key)) { e.preventDefault(); return; }
            e.preventDefault();
            updateAddCardNoWithBuffer(`${addCardScanBufferRef.current}${key}`);
        };
        window.addEventListener("keydown", onWinKeyDown, true);
        return () => window.removeEventListener("keydown", onWinKeyDown, true);
    }, [addCardModalOpen]);

    // 追加卡片弹窗打开时自动聚焦扫码输入框
    useEffect(() => {
        if (!addCardModalOpen) return;
        addCardScanBufferRef.current = "";
        if (addCardScanResetTimer.current) {
            window.clearTimeout(addCardScanResetTimer.current);
            addCardScanResetTimer.current = null;
        }
        const timer = window.setTimeout(() => addCardInputRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [addCardModalOpen]);

    const updateCardNoWithBuffer = (nextValue: string) => {
        cardScanBufferRef.current = nextValue;
        setBindForm((prev) => ({ ...prev, cardNo: nextValue }));
        if (cardScanResetTimer.current) {
            window.clearTimeout(cardScanResetTimer.current);
        }
        cardScanResetTimer.current = window.setTimeout(() => {
            cardScanBufferRef.current = "";
            cardScanResetTimer.current = null;
        }, 1200);
    };

    /** 与首页程序坞扫码一致：window capture 处理按键，避免中文输入法抢占读卡器字符 */
    useEffect(() => {
        if (!isAddModalOpen) return;
        const onWinKeyDown = (e: KeyboardEvent) => {
            const el = cardInputRef.current;
            if (!el || document.activeElement !== el) return;
            if (e.isComposing || e.key === "Process" || (e as KeyboardEvent & { keyCode?: number }).keyCode === 229) {
                return;
            }
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            const key = e.key;
            if (key === "Tab") return;
            if (key === "Enter") {
                e.preventDefault();
                return;
            }
            if (key === "Backspace") {
                e.preventDefault();
                updateCardNoWithBuffer(cardScanBufferRef.current.slice(0, -1));
                return;
            }
            if (key.length !== 1) {
                e.preventDefault();
                return;
            }
            if (!/[0-9A-Za-z]/.test(key)) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            updateCardNoWithBuffer(`${cardScanBufferRef.current}${key}`);
        };
        window.addEventListener("keydown", onWinKeyDown, true);
        return () => window.removeEventListener("keydown", onWinKeyDown, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随弹窗开关重绑；updateCardNoWithBuffer 内用 ref/稳定 setState
    }, [isAddModalOpen]);

    const handleSaveFreezeConfig = async () => {
        setFreezeSaving(true);
        try {
            await saveFreezeConfig({
                enabled: freezeForm.enabled,
                freezeTime: freezeForm.freezeTime,
                secondFreezeTime: freezeForm.secondFreezeTime || undefined,
                secondFreezeAutoSignoutEnabled: freezeForm.secondFreezeAutoSignoutEnabled,
                dailyExemptRevokeAutoSignoutEnabled: freezeForm.dailyExemptRevokeAutoSignoutEnabled,
                timezone: FREEZE_TIMEZONE_CN,
            });
            alert("自动冻结配置已保存");
            await loadFreezeForm();
        } catch (e: any) {
            alert("保存冻结配置失败: " + (e?.message || "unknown"));
        } finally {
            setFreezeSaving(false);
        }
    };

    const openLinkageModal = async () => {
        setLinkageModalOpen(true);
        setLinkageLoading(true);
        try {
            const cfg = await fetchAccessRuleScanLinkageConfig();
            setLinkageForm({
                enterDispatchEnabled: cfg.enterDispatchEnabled !== false,
                exitDispatchEnabled: cfg.exitDispatchEnabled !== false,
                enterUnfreezeEnabled: cfg.enterUnfreezeEnabled !== false,
                exitFreezeEnabled: cfg.exitFreezeEnabled !== false,
                swipeExitSkipConfirm: cfg.swipeExitSkipConfirm === true,
            });
        } catch (e) {
            console.error(e);
            alert("加载扫码门禁联动配置失败");
        } finally {
            setLinkageLoading(false);
        }
    };

    const handleSaveLinkageConfig = async () => {
        setLinkageSaving(true);
        try {
            await saveAccessRuleScanLinkageConfig({
                enterDispatchEnabled: linkageForm.enterDispatchEnabled,
                exitDispatchEnabled: linkageForm.exitDispatchEnabled,
                enterUnfreezeEnabled: linkageForm.enterUnfreezeEnabled,
                exitFreezeEnabled: linkageForm.exitFreezeEnabled,
                swipeExitSkipConfirm: linkageForm.swipeExitSkipConfirm,
            });
            setScanExitFreezeEnabled(linkageForm.exitFreezeEnabled);
            alert("扫码门禁联动配置已保存");
            setLinkageModalOpen(false);
        } catch (e: any) {
            alert("保存失败: " + (e?.message || "unknown"));
        } finally {
            setLinkageSaving(false);
        }
    };

    const toggleDeptExpanded = (id: number) => {
        setExpandedDeptIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // 🚨 严禁在查询流中使用本地 state 覆盖，采用 React Query 的 Mutation
    const mergeExemptRow = (cardNo: string, patch: Partial<CardMappingRow>) => (row: CardMappingRow) =>
        row.cardNo === cardNo ? { ...row, ...patch } : row;

    const loadExemptRoomOptions = async (aroUserId: string) => {
        setExemptRoomsLoading(true);
        try {
            const res = await authHttp.get(`/v1/twin/mappings/dahua-issue/access-prefill`, {
                params: { aroUserId },
            });
            const data = res.data?.data;
            const rooms = (data?.officialRooms || []).map((r: Record<string, unknown>) => ({
                roomId: String(r.id || r.roomId || ''),
                roomName: String(r.name || r.roomName || r.title || ''),
                selected: false,
            })).filter((r: { roomId: string }) => r.roomId);
            setExemptRoomOptions(rooms);
        } catch {
            setExemptRoomOptions([]);
        } finally {
            setExemptRoomsLoading(false);
        }
    };

    const parseExemptMaxCount = (): number | undefined => {
        const raw = exemptMaxCount.trim();
        if (!raw) return undefined;
        const n = parseInt(raw, 10);
        return Number.isNaN(n) || n < 1 ? undefined : n;
    };

    const submitExemptConfig = (untilTime?: string) => {
        if (!exemptModal) return;
        const selectedRooms = exemptRoomOptions.filter((r) => r.selected);
        if (selectedRooms.length === 0) {
            toast.error("请至少选择一个授权房间");
            return;
        }
        let maxCount: number | undefined;
        if (exemptMode === "COUNT" || exemptMode === "BOTH") {
            maxCount = parseExemptMaxCount();
            if (maxCount == null) {
                toast.error("请填写可用次数");
                return;
            }
        }
        const extendUntilTime =
            exemptMode === "TIME" || exemptMode === "BOTH"
                ? (untilTime ?? exemptUntilTime ?? DEFAULT_EXEMPT_UNTIL_TIME)
                : undefined;
        toggleExemptMutation.mutate({
            cardNo: exemptModal.cardNo,
            flag: 1,
            extendUntilTime,
            mode: exemptMode,
            maxCount,
            roomIds: JSON.stringify(selectedRooms.map((r) => ({ roomId: r.roomId, roomName: r.roomName }))),
        });
    };

    const toggleExemptMutation = useMutation({
        mutationFn: (variables: {
            cardNo: string; flag: number; durationMinutes?: number; extendUntilTime?: string;
            mode?: string; maxCount?: number; roomIds?: string;
        }) => updateExemptFlag(variables.cardNo, variables.flag, variables.durationMinutes,
            variables.mode, variables.maxCount, variables.roomIds, variables.extendUntilTime),
        onSuccess: (updated, variables) => {
            // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
            const patch: Partial<CardMappingRow> = {
                freezeExemptFlag: updated?.freezeExemptFlag ?? variables.flag,
                freezeExemptExpireAt: updated?.freezeExemptExpireAt ?? (variables.flag === 0 ? null : undefined),
                freezeExemptMode: updated?.freezeExemptMode ?? null,
                freezeExemptMaxCount: updated?.freezeExemptMaxCount ?? null,
                freezeExemptUsedCount: 0,
                freezeExemptRoomIds: updated?.freezeExemptRoomIds ?? null,
                lastModifiedTime: updated?.lastModifiedTime,
            };
            queryClient.setQueryData(
                ["cardMappings", page, pageSize],
                (old: { list?: CardMappingRow[]; total?: number } | undefined) => {
                    if (!old?.list) return old;
                    return { ...old, list: old.list.map(mergeExemptRow(variables.cardNo, patch)) };
                },
            );
            setSearchResults((prev) => prev.map(mergeExemptRow(variables.cardNo, patch)));
            setExemptModal(null);
            toast.success(variables.flag === 1 ? "已设置豁免" : "已取消豁免");
        },
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "豁免更新失败"),
    });

    const exemptHistoryQuery = useQuery({
        queryKey: ["exempt-history", exemptHistoryModal?.cardNo],
        queryFn: () => fetchExemptHistory(exemptHistoryModal?.cardNo ?? ""),
        enabled: !!exemptHistoryModal?.cardNo,
    });

    const runReaperMutation = useMutation({
        mutationFn: runManualReaper,
        onSuccess: (stats: { frozenCount?: number; exemptCount?: number; totalChecked?: number }) => {
            const frozenCount = stats?.frozenCount ?? 0;
            const exemptCount = stats?.exemptCount ?? 0;
            alert(`🏁 风控跑批完成！\n\n🚫 强制冻结: ${frozenCount} 人\n🛡️ 豁免赦免: ${exemptCount} 人\n\n请检查表格状态是否已同步。`);
            refetch();
        },
        onError: (err: any) => alert("❌ 跑批失败: " + err.message)
    });

    const toggleStatusMutation = useMutation({
        mutationFn: (variables: { cardNo: string, status: string }) => updateCardStatus(variables.cardNo, variables.status),
        onSuccess: () => refetch()
    });

    const displayData: CardMappingRow[] = (() => {
        const raw: CardMappingRow[] = isSearching ? searchResults : (data?.list || []);
        if (exemptFilter === "all") {
            // 已豁免置顶，其余保持服务器排序
            return [...raw].sort((a, b) => {
                const aEx = a.freezeExemptFlag === 1 &&
                    (!a.freezeExemptExpireAt || Date.parse(String(a.freezeExemptExpireAt).replace(/-/g, "/")) > Date.now());
                const bEx = b.freezeExemptFlag === 1 &&
                    (!b.freezeExemptExpireAt || Date.parse(String(b.freezeExemptExpireAt).replace(/-/g, "/")) > Date.now());
                if (aEx && !bEx) return -1;
                if (!aEx && bEx) return 1;
                return 0;
            });
        }
        return raw.filter(row => {
            const isExempt =
                row.freezeExemptFlag === 1 &&
                (!row.freezeExemptExpireAt ||
                    Date.parse(String(row.freezeExemptExpireAt).replace(/-/g, "/")) > Date.now());
            return exemptFilter === "exempt" ? isExempt : !isExempt;
        });
    })();

    /** 按人员聚合：同一人的多张卡合并为一行 */
    const groupedData = useMemo(() => {
        const groups = new Map<string, { info: CardMappingRow; cards: CardMappingRow[] }>();
        for (const row of displayData) {
            const key = row.aroUserId || row.dahuaSeq || row.cardNo;
            const existing = groups.get(key);
            if (existing) {
                existing.cards.push(row);
                // 保留最新修改时间
                if (row.lastModifiedTime && (!existing.info.lastModifiedTime || row.lastModifiedTime > existing.info.lastModifiedTime)) {
                    existing.info.lastModifiedTime = row.lastModifiedTime;
                }
                // 如果任一张卡已豁免，聚合行显示已豁免
                if (row.freezeExemptFlag === 1) {
                    existing.info.freezeExemptFlag = 1;
                    existing.info.freezeExemptExpireAt = row.freezeExemptExpireAt;
                }
            } else {
                groups.set(key, { info: { ...row }, cards: [row] });
            }
        }
        return Array.from(groups.values());
    }, [displayData]);

    const timeOptionsWithCurrent = (current: string) => {
        if (current && !FREEZE_TIME_OPTIONS.includes(current)) {
            return [current, ...FREEZE_TIME_OPTIONS];
        }
        return FREEZE_TIME_OPTIONS;
    };

    const role = authStorage.getRole() || "MEMBER";
    const canCardIssue = hasMinRole(role, "STAFF");
    const canReaper = hasMinRole(role, "SUPER_ADMIN");
    const canGrantExempt = hasMinRole(role, "ADMIN");
    const canFreezeCfg = hasMinRole(role, "STAFF");
    const showCardPageMenu = canCardIssue || canReaper || canFreezeCfg;

    return (
        <AdminPageShell>

            <div className="flex flex-col max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-[200px]">

                <AdminFormCard className="shrink-0 mb-3">
                    {/* 第一行：页面标题 + 操作按钮 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-color-border-default)] pb-3 mb-3">
                        <h2 className="text-base font-bold text-[var(--app-color-text-primary)] shrink-0">{pageLabel}</h2>
                        <div className="flex flex-wrap items-center gap-2">
                        {canCardIssue ? (
                            <AdminButton type="button" tone="primary" onClick={() => setIsAddModalOpen(true)}>
                                <Plus className="h-4 w-4" aria-hidden /> 大华发卡
                            </AdminButton>
                        ) : null}
                        {showCardPageMenu ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <AdminButton type="button" tone="secondary">
                                        <MoreHorizontal className="h-4 w-4" aria-hidden /> 本页操作
                                    </AdminButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-[12rem]">
                                    <DropdownMenuLabel className="text-xs text-[var(--app-color-text-tertiary)]">大华与风控</DropdownMenuLabel>
                                    {canCardIssue ? (
                                        <DropdownMenuItem onSelect={() => setIsAddModalOpen(true)}>大华发卡</DropdownMenuItem>
                                    ) : null}
                                    {canReaper ? (
                                        <DropdownMenuItem
                                            className="text-cyan-700 focus:bg-cyan-50 focus:text-cyan-800"
                                            disabled={runReaperMutation.isPending}
                                            onSelect={() => {
                                                if (window.confirm("❄️ 警告：即将模拟系统自动风控逻辑！\n\n系统将自动冻结所有『在馆滞留』且『未获豁免』的人员卡片，并同步锁死大华门禁硬件。确认执行？")) {
                                                    runReaperMutation.mutate();
                                                }
                                            }}
                                        >
                                            {runReaperMutation.isPending ? "跑批中…" : "触发自动冻结跑批"}
                                        </DropdownMenuItem>
                                    ) : null}
                                    {canGrantExempt ? (
                                        <DropdownMenuItem
                                            onSelect={() => setScanDelayModalOpen(true)}
                                        >
                                            扫码延迟免冻结
                                        </DropdownMenuItem>
                                    ) : null}
                                    {canFreezeCfg ? (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuLabel className="text-xs text-[var(--app-color-text-tertiary)]">冻结定时</DropdownMenuLabel>
                                            <DropdownMenuItem disabled={freezeLoading} onSelect={() => setFreezeSlotModal(1)}>
                                                定时一
                                            </DropdownMenuItem>
                                            <DropdownMenuItem disabled={freezeLoading} onSelect={() => setFreezeSlotModal(2)}>
                                                定时二
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                disabled={freezeLoading}
                                                onSelect={() => {
                                                    void openLinkageModal();
                                                }}
                                            >
                                                扫码门禁联动
                                            </DropdownMenuItem>
                                        </>
                                    ) : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : null}
                        </div>
                    </div>

                    {/* 第二行：表格筛选控件 */}
                    <div className="flex flex-wrap items-end gap-3">
                        {/* 豁免筛选 */}
                        <div className="flex shrink-0 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-0.5 shadow-[var(--app-elevation-card)]">
                            {([
                                { key: "all", label: "全部" },
                                { key: "exempt", label: "已豁免" },
                                { key: "controlled", label: "未豁免" },
                            ] as const).map((opt) => (
                                <button
                                    key={opt.key}
                                    type="button"
                                    className={`px-3 py-1.5 text-xs font-bold rounded-[10px] transition-colors ${
                                        exemptFilter === opt.key
                                            ? "bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)] shadow-sm"
                                            : "text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)]"
                                    }`}
                                    onClick={() => setExemptFilter(opt.key)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        {freezeLoading ? <span className="hidden shrink-0 text-xs text-[var(--app-color-text-tertiary)] sm:inline">配置加载中…</span> : null}
                        <AdminToolbarSearchField
                            className="w-[min(42vw,14rem)] shrink-0 sm:w-56"
                            placeholder="搜姓名、物理卡号或大华序号..."
                            value={searchDraft}
                            onChange={(val) => {
                                setSearchDraft(val);
                                if (!val.trim()) setIsSearching(false);
                            }}
                            onSubmit={submitMappingSearch}
                        />
                    </div>
                </AdminFormCard>

                {/* ═══ 第二层：表格 + 翻页（flex-1，填满剩余空间） ═══ */}
                <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-sm overflow-hidden">

                    {/* 表格滚动区 */}
                    <div className="flex-1 min-h-0 overflow-auto">
                        {isLoading && !isSearching ? (
                            <div className="flex min-h-[200px] items-center justify-center gap-3 text-xl font-bold text-[var(--app-color-text-tertiary)]">
                                <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" /> 正在加载映射矩阵...
                            </div>
                        ) : groupedData.length === 0 ? (
                            <div className="flex min-h-[160px] items-center justify-center text-sm font-bold text-[var(--app-color-text-tertiary)]">
                                {isSearching ? '未在映射矩阵中找到关联记录...' : '暂无映射记录'}
                            </div>
                        ) : (
                            <div>
                    <table className="w-full min-w-max text-left text-sm whitespace-nowrap border-collapse">
                        <thead className="border-b-2 border-[var(--app-color-border-strong)]">
                        <tr className="sticky top-0 z-[2] bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold shadow-[var(--app-elevation-card)]">
                            <th className="p-3 w-16 text-center">照片</th>
                            <th className="p-3">绑定人员 (ARO)</th>
                            <th className="p-3">课题组</th>
                            <th className="p-3">物理卡号 (扫描头输入)</th>
                            <th className="p-3">大华通道序号 (下发指令用)</th>
                            <th className="p-3 text-center">系统特权</th>
                            <th className="p-3 text-right">上次修改</th>
                            <th className="p-3 text-center w-10">操作</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--app-color-border-default)]">
                        {groupedData.map((group, gIdx: number) => {
                            const info = group.info;
                            const cards = group.cards;
                            const rowKey = info.aroUserId || info.dahuaSeq || `group-${gIdx}`;

                            return (
                                <tr key={rowKey} className="hover:bg-indigo-50/50 transition-colors">
                                    {/* 照片 */}
                                    <td className="p-3 text-center">
                                        <FacePhotoCell
                                            aroUserId={info.aroUserId}
                                            headUrl={info.head}
                                            onUpdated={() => refetch()}
                                        />
                                    </td>
                                    {/* 人员信息 */}
                                    <td className="p-3">
                                        <div className="font-black text-[var(--app-color-text-primary)] text-base">{info.userName || '（人员库未匹配）'}</div>
                                        <div className="font-mono text-xs text-[var(--app-color-text-tertiary)] mt-1">ARO ID：{info.aroUserId || '—'}</div>
                                        <div className="font-mono text-xs text-[var(--app-color-text-tertiary)] mt-0.5">工号：{info.jobNumber || '—'}</div>
                                    </td>
                                    {/* 课题组 */}
                                    <td className="p-3 text-sm text-[var(--app-color-text-secondary)] max-w-[160px] whitespace-normal">
                                        {info.projectGroupName || '—'}
                                    </td>
                                    {/* 卡片列表：每张卡一行 */}
                                    <td className="p-2">
                                        <div className="flex flex-col gap-1.5">
                                            {cards.map((card, cIdx) => {
                                                const isFrozen = card.cardStatus === 'FROZEN';
                                                return (
                                                    <div key={card.cardNo || cIdx} className="flex items-center gap-2 bg-[var(--app-color-surface-page)] rounded-lg px-2.5 py-1.5 border border-[var(--app-color-border-default)]">
                                                        {/* 冻结/解冻 */}
                                                        <button
                                                            onClick={() => toggleStatusMutation.mutate({ cardNo: card.cardNo, status: isFrozen ? 'NORMAL' : 'FROZEN' })}
                                                            disabled={toggleStatusMutation.isPending}
                                                            className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all ${isFrozen ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'}`}
                                                            title={isFrozen ? '解冻' : '冻结'}
                                                        >
                                                            {isFrozen ? <Ban className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                                                        </button>
                                                        {/* 卡号即删卡按钮 */}
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm(`🗑 删除卡片\n\n将从大华平台删除卡号 [${card.cardNo}]。\n人员 [${info.userName || info.aroUserId}] 不受影响。\n\n确定继续？`)) {
                                                                    deleteDahuaCardMutation.mutate(card.cardNo);
                                                                }
                                                            }}
                                                            disabled={deleteDahuaCardMutation.isPending}
                                                            className="font-mono font-bold text-indigo-600 text-sm hover:text-red-600 hover:line-through hover:bg-red-50 rounded px-1.5 py-0.5 transition-all cursor-pointer min-w-[80px]"
                                                            title={`点击删除卡片 ${card.cardNo}`}
                                                        >
                                                            {deleteDahuaCardMutation.isPending && deleteDahuaCardMutation.variables === card.cardNo ? (
                                                                <Loader2 className="w-4 h-4 animate-spin text-red-500 inline" />
                                                            ) : (
                                                                card.cardNo
                                                            )}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>
                                    {/* 大华信息 */}
                                    <td className="p-3">
                                        <div className="flex items-center gap-2 bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] px-2 py-1 rounded w-fit font-mono text-xs border border-[var(--app-color-border-default)]">
                                            <Link className="w-3 h-3" />
                                            {info.dahuaSeq || '—'}
                                        </div>
                                        <div className="font-mono text-xs text-[var(--app-color-text-tertiary)] mt-1">
                                            编码：{info.dahuaPersonCode || '—'}
                                        </div>
                                    </td>
                                    {/* 豁免状态（聚合：任一卡豁免即显示） */}
                                    <td className="p-3 text-center">
                                        {(() => {
                                            const exemptCard = cards.find(c => c.freezeExemptFlag === 1);
                                            const isExempt = !!exemptCard;
                                            const primaryCard = exemptCard || cards[0];
                                            return (
                                                <>
                                                    {canGrantExempt ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (isExempt && exemptCard) {
                                                                if (window.confirm(`取消卡号 ${exemptCard.cardNo} 的豁免？`)) {
                                                                    toggleExemptMutation.mutate({ cardNo: exemptCard.cardNo, flag: 0 });
                                                                }
                                                                return;
                                                            }
                                                            setExemptModal({ cardNo: primaryCard.cardNo, userName: info.userName, aroUserId: info.aroUserId });
                                                            setExemptUntilTime(DEFAULT_EXEMPT_UNTIL_TIME);
                                                            setExemptMode("TIME");
                                                            setExemptMaxCount("");
                                                            setExemptRoomOptions([]);
                                                            if (info.aroUserId) loadExemptRoomOptions(info.aroUserId);
                                                        }}
                                                        disabled={toggleExemptMutation.isPending}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${isExempt ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] border border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]'}`}
                                                    >
                                                        {isExempt ? '👑 已豁免' : '受控'}
                                                    </button>
                                                    ) : (
                                                        <span className="text-xs text-[var(--app-color-text-tertiary)]">{isExempt ? '已豁免' : '受控'}</span>
                                                    )}
                                                    {exemptCard && formatExemptStatus(exemptCard) ? (
                                                        <div className="mt-1 text-[10px] text-amber-600 font-mono">{formatExemptStatus(exemptCard)}</div>
                                                    ) : null}
                                                    {exemptCard && parseExemptRoomNames(exemptCard.freezeExemptRoomIds).length > 0 ? (
                                                        <div className="mt-0.5 text-[10px] text-[var(--app-color-accent)] font-medium leading-tight">
                                                            房间: {parseExemptRoomNames(exemptCard.freezeExemptRoomIds).join(', ')}
                                                        </div>
                                                    ) : null}
                                                    {exemptCard && exemptCard.freezeExemptExpireAt ? (
                                                        <div className="mt-0.5 text-[10px] text-[var(--app-color-text-tertiary)] font-mono">
                                                            至 {formatExemptExpireAt(exemptCard.freezeExemptExpireAt)}
                                                        </div>
                                                    ) : null}
                                                    {canGrantExempt ? (
                                                        <div className="mt-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setExemptHistoryModal({ cardNo: primaryCard.cardNo, userName: info.userName })}
                                                                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-accent)] transition-colors"
                                                            >
                                                                <History className="w-3 h-3" /> 轨迹
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-3 text-right font-mono text-xs text-[var(--app-color-text-tertiary)]">
                                        {info.lastModifiedTime || '-'}
                                    </td>
                                    {/* 操作：追加新卡 + 删除人员 */}
                                    <td className="p-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            {canCardIssue && info.dahuaSeq && info.dahuaPersonCode ? (
                                                <button
                                                    onClick={() => openAddCardModal(info)}
                                                    className="p-2 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] hover:bg-[var(--app-color-accent-soft)] rounded-lg transition-all active:scale-95"
                                                    title="为此人追加一张新卡"
                                                >
                                                    <Plus className="w-5 h-5" />
                                                </button>
                                            ) : null}
                                            <button
                                                onClick={() => {
                                                    const cardList = cards.map(c => c.cardNo).join('、');
                                                    if (window.confirm(`🚨 删除人员与卡片信息\n\n将删除 [${info.userName || info.aroUserId}] 的全部卡片（${cardList}）并从大华平台清除。\n\n确定继续？`)) {
                                                        cards.forEach(card => deleteDahuaCardMutation.mutate(card.cardNo));
                                                    }
                                                }}
                                                disabled={deleteDahuaCardMutation.isPending}
                                                className="p-2 text-[var(--app-color-text-tertiary)] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                                                title="删除人员与卡片信息"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                            </div>
                        )}
                    </div>{/* 表格滚动区结束 */}

                    {/* 翻页（shrink-0，始终可见） */}
                    <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 border-t border-[var(--app-color-border-default)] text-sm">
                        <span className="text-xs text-[var(--app-color-text-tertiary)]">
                            第 {isSearching ? '-' : page} / {isSearching ? '-' : totalPages || 1} 页，共 {isSearching ? '-' : data?.total ?? 0} 条
                        </span>
                        <div className="flex items-center gap-2">
                            <AdminButton type="button" tone="secondary" size="sm" disabled={page === 1 || isSearching} onClick={() => setPage(p => p - 1)}>
                                上一页
                            </AdminButton>
                            <AdminButton type="button" tone="secondary" size="sm" disabled={page === totalPages || totalPages === 0 || isSearching} onClick={() => setPage(p => p + 1)}>
                                下一页
                            </AdminButton>
                        </div>
                    </div>

                </div>{/* 表格阴影容器结束 */}
            </div>{/* 外层 max-h 容器结束 */}

            {freezeSlotModal !== null && <Portal><div
                    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setFreezeSlotModal(null)}
                    role="presentation"
                >
                    <div
                        className="bg-[var(--app-color-surface-container)] rounded-2xl shadow-xl border border-[var(--app-color-border-default)] w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="text-lg font-black text-[var(--app-color-text-primary)] flex items-center gap-2">
                                <Clock className={`w-5 h-5 shrink-0 ${freezeSlotModal === 1 ? "text-indigo-600" : "text-violet-600"}`} />
                                {freezeSlotModal === 1 ? "第一次定时冻结" : "第二次定时冻结"}
                            </h3>
                            <button type="button" onClick={() => setFreezeSlotModal(null)} className="p-1 rounded-full hover:bg-[var(--app-color-surface-hover)]" aria-label="关闭">
                                <X className="w-5 h-5 text-[var(--app-color-text-tertiary)]" />
                            </button>
                        </div>
                        <p className="text-xs text-[var(--app-color-text-tertiary)] mb-4">
                            时区固定为 {FREEZE_TIMEZONE_CN}（中国），与服务器解释一致。
                        </p>

                        {freezeSlotModal === 1 && (
                            <>
                                <div className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] mb-3 cursor-pointer">
                                    <AdminSwitchScaled
                                        size="sm"
                                        checked={freezeForm.enabled}
                                        onChange={(checked) => setFreezeForm((prev) => ({ ...prev, enabled: checked }))}
                                    />
                                    启用每日自动冻结
                                </div>
                                <div className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] mb-4 cursor-pointer">
                                    <AdminSwitchScaled
                                        size="sm"
                                        checked={freezeForm.dailyExemptRevokeAutoSignoutEnabled}
                                        onChange={(checked) =>
                                            setFreezeForm((prev) => ({
                                                ...prev,
                                                dailyExemptRevokeAutoSignoutEnabled: checked,
                                            }))
                                        }
                                    />
                                    （已迁移）请改在「定时管理 → 每日豁免权回收」勾选「回收后签离」
                                </div>
                            </>
                        )}

                        {freezeSlotModal === 2 && (
                            <div className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] mb-4 cursor-pointer">
                                <AdminSwitchScaled
                                    size="sm"
                                    checked={freezeForm.secondFreezeAutoSignoutEnabled}
                                    onChange={(checked) =>
                                        setFreezeForm((prev) => ({ ...prev, secondFreezeAutoSignoutEnabled: checked }))
                                    }
                                />
                                第二次冻结时：今日曾豁免且仍未离开者，自动执行完整离开
                            </div>
                        )}

                        <label className="block text-xs font-bold text-[var(--app-color-text-secondary)] mb-2">
                            {freezeSlotModal === 1 ? "第一次触发时刻" : "第二次触发时刻"}
                        </label>
                        <select
                            className="w-full border border-[var(--app-color-border-default)] rounded-xl px-3 py-2.5 text-sm font-mono mb-4 bg-[var(--app-color-surface-container)]"
                            value={freezeSlotModal === 1 ? (freezeForm.freezeTime || "18:00") : (freezeForm.secondFreezeTime || "")}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (freezeSlotModal === 1) {
                                    setFreezeForm((prev) => ({ ...prev, freezeTime: v }));
                                } else {
                                    setFreezeForm((prev) => ({ ...prev, secondFreezeTime: v }));
                                }
                            }}
                        >
                            {freezeSlotModal === 2 && (
                                <option value="">不启用第二次定时</option>
                            )}
                            {timeOptionsWithCurrent(freezeSlotModal === 1 ? freezeForm.freezeTime : freezeForm.secondFreezeTime).map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>

                        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--app-color-border-default)]">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-hover)] hover:bg-[var(--app-color-surface-hover)]"
                                onClick={() => setFreezeSlotModal(null)}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                                disabled={freezeSaving}
                                onClick={async () => {
                                    await handleSaveFreezeConfig();
                                    setFreezeSlotModal(null);
                                }}
                            >
                                {freezeSaving ? "保存中…" : "保存"}
                            </button>
                        </div>
                    </div>
                </div></Portal>}

            {exemptModal && <Portal><div
                    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setExemptModal(null)}
                    role="presentation"
                >
                    <div
                        className="bg-[var(--app-color-surface-container)] rounded-2xl shadow-xl border border-[var(--app-color-border-default)] w-full max-w-md p-6 max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog" aria-modal="true"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-lg font-black text-[var(--app-color-text-primary)]">设置豁免</h3>
                            <button type="button" onClick={() => setExemptModal(null)} className="p-1 rounded-full hover:bg-[var(--app-color-surface-hover)]" aria-label="关闭">
                                <X className="w-5 h-5 text-[var(--app-color-text-tertiary)]" />
                            </button>
                        </div>
                        <p className="text-sm text-[var(--app-color-text-secondary)] mb-4">
                            卡号 <span className="font-mono font-bold text-indigo-600">{exemptModal.cardNo}</span>
                            {exemptModal.userName ? ` · ${exemptModal.userName}` : ""}
                        </p>

                        {/* 模式选择 */}
                        <div className="mb-4">
                            <label className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2 block">豁免模式</label>
                            <div className="flex gap-2">
                                {EXEMPT_MODE_OPTIONS.map(opt => (
                                    <button key={opt.value} type="button"
                                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                                            exemptMode === opt.value
                                                ? 'bg-amber-100 border-amber-400 text-amber-800'
                                                : 'bg-[var(--app-color-surface-page)] border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)]'
                                        }`}
                                        onClick={() => setExemptMode(opt.value)}
                                    >{opt.label}</button>
                                ))}
                            </div>
                        </div>

                        {/* 时长选择（TIME/BOTH） */}
                        {(exemptMode === 'TIME' || exemptMode === 'BOTH') && (
                            <div className="mb-4">
                                <label className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2 block">延长至（当日）</label>
                                <ExemptUntilTimePicker
                                    value={exemptUntilTime}
                                    onChange={(t) => setExemptUntilTime(t)}
                                    disabled={toggleExemptMutation.isPending}
                                />
                                {exemptMode === "TIME" ? (
                                    <p className="mt-2 text-[11px] text-[var(--app-color-text-tertiary)]">
                                        选择延长至时点与授权房间后，点击下方「确认设置」生效；默认 {DEFAULT_EXEMPT_UNTIL_TIME}
                                    </p>
                                ) : null}
                            </div>
                        )}

                        {/* 次数输入（COUNT/BOTH） */}
                        {(exemptMode === 'COUNT' || exemptMode === 'BOTH') && (
                            <div className="mb-4">
                                <label className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2 block">可用次数</label>
                                <input type="number" min={1} placeholder="请填写次数"
                                    value={exemptMaxCount}
                                    onChange={e => setExemptMaxCount(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] text-sm text-[var(--app-color-text-primary)]"
                                />
                            </div>
                        )}

                        {/* 房间权限选择 */}
                        <div className="mb-4">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-xs font-bold text-[var(--app-color-text-secondary)]">授权房间（免时段限制）</label>
                                <button type="button"
                                    className="text-xs text-indigo-600 hover:underline"
                                    disabled={exemptRoomsLoading}
                                    onClick={() => exemptModal.aroUserId && loadExemptRoomOptions(exemptModal.aroUserId)}
                                >{exemptRoomsLoading ? '加载中...' : '刷新房间列表'}</button>
                            </div>
                            {exemptRoomOptions.length === 0 ? (
                                <p className="text-xs text-[var(--app-color-text-tertiary)]">点击「刷新房间列表」获取人员房间权限</p>
                            ) : (
                                <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5">
                                    {exemptRoomOptions.map(r => (
                                        <button
                                            key={r.roomId}
                                            type="button"
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                                                r.selected
                                                    ? 'bg-amber-100 border-amber-400 text-amber-800'
                                                    : 'bg-[var(--app-color-surface-page)] border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-amber-50 hover:border-amber-300'
                                            }`}
                                            onClick={() => setExemptRoomOptions(prev =>
                                                prev.map(x => x.roomId === r.roomId ? { ...x, selected: !x.selected } : x)
                                            )}
                                        >{r.roomName}</button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button type="button"
                            disabled={
                                toggleExemptMutation.isPending
                                || exemptRoomOptions.filter((r) => r.selected).length === 0
                                || ((exemptMode === "COUNT" || exemptMode === "BOTH") && !exemptMaxCount.trim())
                            }
                            className="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                            onClick={() => submitExemptConfig(exemptUntilTime)}
                        >确认设置</button>
                    </div>
                </div></Portal>}

            {exemptHistoryModal && <Portal><div
                    className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setExemptHistoryModal(null)}
                    role="presentation"
                >
                    <div
                        className="bg-[var(--app-color-surface-container)] rounded-2xl shadow-xl border border-[var(--app-color-border-default)] w-full max-w-lg p-6 max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog" aria-modal="true" aria-label="豁免轨迹"
                    >
                        <div className="shrink-0 flex justify-between items-start mb-1">
                            <h3 className="text-lg font-black text-[var(--app-color-text-primary)] flex items-center gap-2">
                                <History className="w-5 h-5 shrink-0 text-[var(--app-color-accent)]" aria-hidden />
                                豁免轨迹
                            </h3>
                            <button type="button" onClick={() => setExemptHistoryModal(null)} className="p-1 rounded-full hover:bg-[var(--app-color-surface-hover)]" aria-label="关闭">
                                <X className="w-5 h-5 text-[var(--app-color-text-tertiary)]" />
                            </button>
                        </div>
                        <p className="shrink-0 text-sm text-[var(--app-color-text-secondary)] mb-3">
                            {exemptHistoryModal.userName ? `${exemptHistoryModal.userName} · ` : ""}
                            卡号 <span className="font-mono font-bold text-[var(--app-color-text-primary)]">{exemptHistoryModal.cardNo}</span>
                        </p>

                        {exemptHistoryQuery.isLoading ? (
                            <div className="space-y-4 py-2" aria-hidden>
                                {[0, 1, 2, 3].map((i) => (
                                    <div key={i} className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="h-5 w-28 rounded-full bg-[var(--app-color-surface-hover)] animate-skeleton-pulse motion-reduce:animate-none" />
                                            <div className="h-3.5 w-32 rounded-md bg-[var(--app-color-surface-hover)] animate-skeleton-pulse motion-reduce:animate-none" />
                                        </div>
                                        <div className="h-3.5 w-4/5 rounded-md bg-[var(--app-color-surface-hover)] animate-skeleton-pulse motion-reduce:animate-none" />
                                    </div>
                                ))}
                            </div>
                        ) : exemptHistoryQuery.isError ? (
                            <div className="py-8 text-center">
                                <p className="text-sm font-bold text-[var(--app-color-feedback-danger)]">轨迹加载失败</p>
                                <p className="mt-1 text-xs text-[var(--app-color-text-secondary)]">
                                    {exemptHistoryQuery.error instanceof Error ? exemptHistoryQuery.error.message : "网络或服务异常，请稍后再试"}
                                </p>
                                <div className="mt-3 flex justify-center">
                                    <AdminButton type="button" tone="secondary" size="sm" onClick={() => exemptHistoryQuery.refetch()}>
                                        重试
                                    </AdminButton>
                                </div>
                            </div>
                        ) : !exemptHistoryQuery.data || exemptHistoryQuery.data.length === 0 ? (
                            <div className="py-10 text-center">
                                <History className="mx-auto mb-3 h-8 w-8 text-[var(--app-color-text-tertiary)]" aria-hidden />
                                <p className="text-sm font-bold text-[var(--app-color-text-primary)]">这个人还没有豁免变动记录</p>
                                <p className="mx-auto mt-1.5 max-w-[36ch] text-xs leading-relaxed text-[var(--app-color-text-secondary)]">
                                    管理员手动下放、延迟申请审核通过或豁免到期收回后，都会在这里按时间倒序留痕。
                                </p>
                            </div>
                        ) : (
                            <>
                                <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-[var(--app-color-border-default)]">
                                    {exemptHistoryQuery.data.map((entry: ExemptHistoryEntry) => {
                                        const granted = entry.eventKey === "EXEMPT_GRANTED";
                                        return (
                                            <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold text-[var(--app-color-text-primary)] ${
                                                            granted
                                                                ? "bg-[var(--app-color-feedback-success-soft)] border-[var(--app-color-feedback-success)]"
                                                                : "bg-[var(--app-color-feedback-warning-soft)] border-[var(--app-color-feedback-warning)]"
                                                        }`}
                                                    >
                                                        <span
                                                            className={`h-1.5 w-1.5 rounded-full ${granted ? "bg-[var(--app-color-feedback-success)]" : "bg-[var(--app-color-feedback-warning)]"}`}
                                                            aria-hidden
                                                        />
                                                        {entry.eventKeyLabel || (granted ? "授予冻结豁免" : "收回冻结豁免")}
                                                    </span>
                                                    {entry.success === 0 ? (
                                                        <span className="text-xs font-bold text-[var(--app-color-feedback-danger)]">执行失败</span>
                                                    ) : null}
                                                    <span className="ml-auto font-mono text-xs text-[var(--app-color-text-secondary)]">
                                                        {formatExemptHistoryTime(entry.eventTime)}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--app-color-text-secondary)]">
                                                    {entry.triggerReasonLabel ? <span>来源：{entry.triggerReasonLabel}</span> : null}
                                                    {entry.userName ? <span>{entry.userName}</span> : null}
                                                </div>
                                                {(entry.detailDisplayZh || entry.detail) ? (
                                                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--app-color-text-secondary)] whitespace-pre-wrap break-words">
                                                        {entry.detailDisplayZh || entry.detail}
                                                    </p>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                                <p className="shrink-0 pt-3 mt-1 border-t border-[var(--app-color-border-default)] text-[11px] text-[var(--app-color-text-tertiary)]">
                                    共 {exemptHistoryQuery.data.length} 条，按时间倒序，最多显示最近 50 条
                                </p>
                            </>
                        )}
                    </div>
                </div></Portal>}

            {scanDelayModalOpen && canGrantExempt && (
                <Portal>
                    <div
                        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                        onClick={() => setScanDelayModalOpen(false)}
                        role="presentation"
                    >
                        <div
                            className="bg-[var(--app-color-surface-container)] rounded-2xl shadow-xl border border-[var(--app-color-border-default)] w-full max-w-3xl p-6"
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-black text-[var(--app-color-text-primary)] flex items-center gap-2">
                                    <Clock className="w-5 h-5 shrink-0 text-amber-600" />
                                    扫码延迟免冻结
                                </h3>
                                <button type="button" onClick={() => setScanDelayModalOpen(false)} className="p-1 rounded-full hover:bg-[var(--app-color-surface-hover)]" aria-label="关闭">
                                    <X className="w-5 h-5 text-[var(--app-color-text-tertiary)]" />
                                </button>
                            </div>
                            <ScanDelayConfigPanel />
                        </div>
                    </div>
                </Portal>
            )}

            {linkageModalOpen && <Portal><div
                    className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setLinkageModalOpen(false)}
                    role="presentation"
                >
                    <div
                        className="bg-[var(--app-color-surface-container)] rounded-2xl shadow-xl border border-[var(--app-color-border-default)] w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="text-lg font-black text-[var(--app-color-text-primary)] flex items-center gap-2">
                                <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600" />
                                扫码门禁联动
                            </h3>
                            <button type="button" onClick={() => setLinkageModalOpen(false)} className="p-1 rounded-full hover:bg-[var(--app-color-surface-hover)]" aria-label="关闭">
                                <X className="w-5 h-5 text-[var(--app-color-text-tertiary)]" />
                            </button>
                        </div>
                        <p className="text-xs text-[var(--app-color-text-tertiary)] mb-4">
                            权限类开关控制大华 batch 下发/回收；冻融类开关控制物理卡解冻/冻结（与权限开关正交）。关闭离开冻结不影响定时跑批冻结任务。
                        </p>
                        {linkageLoading ? (
                            <div className="text-sm text-[var(--app-color-text-tertiary)] flex items-center gap-2 py-4">
                                <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
                            </div>
                        ) : (
                            <div className="space-y-4 mb-4">
                                <div>
                                    <p className="text-[11px] font-bold text-[var(--app-color-text-tertiary)] uppercase tracking-wide mb-2">确认弹窗</p>
                                    <div className="space-y-2 bg-amber-50/60 border border-amber-200 rounded-lg p-3">
                                        <div className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <AdminSwitchScaled
                                                size="sm"
                                                checked={linkageForm.swipeExitSkipConfirm}
                                                onChange={(checked) => setLinkageForm((p) => ({ ...p, swipeExitSkipConfirm: checked }))}
                                            />
                                            二次刷卡离开跳过确认
                                        </div>
                                        <p className="text-[11px] text-[var(--app-color-text-tertiary)] leading-snug ml-6">
                                            开启后，已进入状态再次扫码将直接执行离开，不弹出确认对话框。
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-[var(--app-color-text-tertiary)] uppercase tracking-wide mb-2">权限（大华门禁规则）</p>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <AdminSwitchScaled
                                                size="sm"
                                                checked={linkageForm.enterDispatchEnabled}
                                                onChange={(checked) => setLinkageForm((p) => ({ ...p, enterDispatchEnabled: checked }))}
                                            />
                                            进入时执行门禁规则（大华权限下发）
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <AdminSwitchScaled
                                                size="sm"
                                                checked={linkageForm.exitDispatchEnabled}
                                                onChange={(checked) => setLinkageForm((p) => ({ ...p, exitDispatchEnabled: checked }))}
                                            />
                                            离开时执行门禁规则（大华权限回收）
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-[var(--app-color-text-tertiary)] uppercase tracking-wide mb-2">冻融（物理卡 / 大华人员状态）</p>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <AdminSwitchScaled
                                                size="sm"
                                                checked={linkageForm.enterUnfreezeEnabled}
                                                onChange={(checked) => setLinkageForm((p) => ({ ...p, enterUnfreezeEnabled: checked }))}
                                            />
                                            进入时解冻物理卡（大华人员解冻）
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <AdminSwitchScaled
                                                size="sm"
                                                checked={linkageForm.exitFreezeEnabled}
                                                onChange={(checked) => setLinkageForm((p) => ({ ...p, exitFreezeEnabled: checked }))}
                                            />
                                            离开时冻结物理卡（扫码/自动签退）
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                                    关闭进入解冻但开启权限下发时，大华可能返回「冻结人员不能授权」。关闭离开冻结不影响「定时跑批冻结」配置。
                                </p>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--app-color-border-default)]">
                            <button
                                type="button"
                                className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-hover)] hover:bg-[var(--app-color-surface-hover)]"
                                onClick={() => setLinkageModalOpen(false)}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                                disabled={linkageSaving || linkageLoading}
                                onClick={() => void handleSaveLinkageConfig()}
                            >
                                {linkageSaving ? "保存中…" : "保存"}
                            </button>
                        </div>
                    </div>
                </div></Portal>}

            {isAddModalOpen && <Portal><div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
                    role="presentation"
                >
                    <div
                        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-[var(--app-color-surface-container)] shadow-xl ring-1 ring-black/[0.06]"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="dahua-issue-modal-title"
                    >
                        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-6 py-4">
                            <h2 id="dahua-issue-modal-title" className="text-lg font-semibold text-neutral-900">
                                大华发卡
                            </h2>
                            <button
                                type="button"
                                onClick={closeIssueModal}
                                className="rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100"
                                aria-label="关闭"
                            >
                                <X className="h-5 w-5" aria-hidden />
                            </button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-6 py-4">
                        <AdminFormCard title="1. 选择人员" description="键入姓名或工号自动检索，回车可立即搜索。">
                        <div className="relative">
                            <label className={adminLabelClass}>人员检索</label>
                            <div className="relative mt-1">
                                <input
                                    type="text"
                                    value={personKeyword}
                                    placeholder="输入姓名或工号..."
                                    className={adminInputClass}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleSearchRealUser(personKeyword);
                                        }
                                    }}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setPersonKeyword(val);
                                        if (personSearchTimer.current) {
                                            window.clearTimeout(personSearchTimer.current);
                                        }
                                        personSearchTimer.current = window.setTimeout(() => {
                                            if (!val.trim()) {
                                                setSearchUserResult([]);
                                                return;
                                            }
                                            handleSearchRealUser(val);
                                        }, 250);
                                    }}
                                />
                            </div>

                            {/* 豪华预检悬浮框 (悬浮在表单上方，不撑开原有高度) */}
                            {searchUserResult.length > 0 && (
                                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[220px] overflow-y-auto rounded-lg border border-neutral-200 bg-[var(--app-color-surface-container)] p-1 shadow-lg">
                                    {searchUserResult.map((rawPerson: any) => {
                                        // 融合你的暴力提取逻辑，确保绝不报错
                                        const safeId = rawPerson.userid || rawPerson.user_id || rawPerson.id || '';
                                        const safeName = rawPerson.name || rawPerson.username || '未知';
                                        const safeGroup = rawPerson.projectgroupname || rawPerson.project_group_name || '无课题组';
                                        const safeHead = rawPerson.head || rawPerson.avatar;
                                        const headSrc = resolvePersonnelAvatarUrl(safeHead);

                                        return (
                                            <div
                                                key={safeId}
                                                className="flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-neutral-50"
                                                onClick={() => {
                                                    // 💥 核心：点击后直接填入表单，并清空预检框
                                                    setBindForm((prev) => ({...prev, aroUserId: safeId, userName: safeName}));
                                                    setPersonKeyword(`${safeName} (${safeId})`);
                                                    setSearchUserResult([]);
                                                }}
                                            >
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
                                                    {headSrc ? <img src={headSrc} className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-[var(--app-color-text-tertiary)]" />}
                                                </div>
                                                <div className="flex-1 overflow-hidden flex flex-col justify-center">
                                                    <div className="flex justify-between items-center">
                                                        <span className="truncate text-sm font-medium text-neutral-900">{safeName}</span>
                                                        <span className="text-[10px] font-mono text-[var(--app-color-text-tertiary)]">{safeId}</span>
                                                    </div>
                                                    <span className="mt-0.5 truncate text-xs text-neutral-500">{safeGroup}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {bindForm.userName && (
                            <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#0070f3]/20 bg-[#0070f3]/5 p-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0070f3] text-white">
                                    <Check className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className={adminHintClass}>已选定发卡人员</p>
                                    <p className="text-sm font-medium text-neutral-900">
                                        {bindForm.userName}{" "}
                                        <span className="ml-1 font-mono text-xs text-neutral-500">({bindForm.aroUserId})</span>
                                    </p>
                                </div>
                            </div>
                        )}

                        </AdminFormCard>

                        <AdminFormCard title="2. 扫描卡号" description="焦点置于输入框后使用读卡器刷卡。">
                        <label className={adminLabelClass}>物理卡号</label>
                        <input
                            ref={cardInputRef}
                            id="dahua-issue-card-scan-input"
                            type="text"
                            lang="en"
                            inputMode="text"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            value={bindForm.cardNo}
                            onPaste={(e) => {
                                e.preventDefault();
                                const pasted = sanitizeCardNo(e.clipboardData.getData("text"));
                                updateCardNoWithBuffer(pasted);
                            }}
                            onChange={(e) => {
                                if (cardComposingRef.current) return;
                                const clean = sanitizeCardNo(e.target.value);
                                updateCardNoWithBuffer(clean);
                            }}
                            onCompositionStart={() => {
                                cardComposingRef.current = true;
                            }}
                            onCompositionEnd={(e) => {
                                cardComposingRef.current = false;
                                const clean = sanitizeCardNo((e.target as HTMLInputElement).value);
                                updateCardNoWithBuffer(clean);
                            }}
                            className={cn(adminInputClass, "mb-4 font-mono font-semibold text-[#0070f3]")}
                            placeholder="等待读卡器输入..."
                        />
                        </AdminFormCard>

                        <AdminFormCard title="3. 所属部门" description="结构树选择部门，departmentType 固定传 1。">
                        <label className={adminLabelClass}>部门树</label>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 text-xs text-[var(--app-color-text-tertiary)]">
                                已选部门ID：{bindForm.departmentId || ""}
                            </div>
                            <button
                                type="button"
                                className="px-2 py-1 text-xs rounded-lg border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                                onClick={async () => {
                                    await refreshDahuaDepartments();
                                    const deptRes = await fetchDahuaDepartments(1, 500, "");
                                    setDepartments(deptRes.list || []);
                                    setExpandedDeptIds(new Set());
                                    alert("部门缓存已刷新");
                                }}
                            >
                                刷新
                            </button>
                        </div>
                        <div className="border-2 border-[var(--app-color-border-default)] rounded-xl p-2 mb-4 max-h-[220px] overflow-auto bg-[var(--app-color-surface-container)]">
                            {departmentTreeGrouped.roots.map((root) => {
                                const renderNode = (node: DahuaDepartmentRow, depth: number) => {
                                    const nodeId = Number(node.id);
                                    const children = departmentTreeGrouped.childrenMap.get(nodeId) || [];
                                    const open = expandedDeptIds.has(nodeId);
                                    const checked = String(node.id) === bindForm.departmentId;
                                    return (
                                        <div key={node.id} className="mb-1">
                                            <div
                                                className={`flex items-center gap-2 py-1 px-1 rounded text-sm ${checked ? "bg-indigo-50 text-indigo-700" : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-page)]"}`}
                                                style={{ marginLeft: `${depth * 18}px` }}
                                            >
                                                {children.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        className="w-5 h-5 text-xs rounded border border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]"
                                                        onClick={() => toggleDeptExpanded(nodeId)}
                                                    >
                                                        {open ? "▾" : "▸"}
                                                    </button>
                                                ) : (
                                                    <span className="inline-block w-5 h-5" />
                                                )}
                                                <input
                                                    type="radio"
                                                    name="departmentId"
                                                    checked={checked}
                                                    onChange={() => setBindForm({ ...bindForm, departmentId: String(node.id) })}
                                                />
                                                <span>{depth > 0 ? "└ " : ""}{node.name || `部门${node.id}`}</span>
                                                <span className="text-xs text-[var(--app-color-text-tertiary)]">#{node.id}</span>
                                            </div>
                                            {open && children.length > 0 && (
                                                <div className="mt-1">
                                                    {children.map((child) => renderNode(child, depth + 1))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                };
                                return renderNode(root, 0);
                            })}
                            {departmentTreeGrouped.roots.length === 0 && <div className="text-xs text-[var(--app-color-text-tertiary)]">暂无部门缓存，请先刷新</div>}
                        </div>
                        </AdminFormCard>

                        <AdminFormCard title="4. 门禁规则预填" description="按 ARO 官方可进房间自动匹配；勾选结果合并到步骤 5 通道/门组。">
                        <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50/80 p-3">
                            {!bindForm.aroUserId ? (
                                <div className="text-xs text-[var(--app-color-text-tertiary)]">请先检索并选择人员后，将自动拉取官方可进房间并匹配门禁规则。</div>
                            ) : issuePrefillLoading ? (
                                <div className="text-xs text-[var(--app-color-text-tertiary)] flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" /> 正在匹配门禁规则…
                                </div>
                            ) : !issueAccessPrefill?.ruleMatches?.length ? (
                                <div className="text-xs text-[var(--app-color-text-tertiary)]">
                                    未匹配到门禁子项（该人员在官方无可进房间，或房间未配置规则/无通道门组）。
                                    {issueAccessPrefill?.officialRoomsNormalized && issueAccessPrefill.officialRoomsNormalized.length > 0 ? (
                                        <span className="block mt-1 text-[var(--app-color-text-secondary)]">
                                            官方房间数：{issueAccessPrefill.officialRoomsNormalized.length}
                                        </span>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="text-[11px] text-[var(--app-color-text-tertiary)]">
                                        取消勾选会按当前勾选重算步骤 5 的通道与门组并集。
                                    </div>
                                    {issueAccessPrefill.ruleMatches.map((m) => (
                                        <div key={m.matchKey} className="flex items-start gap-2 text-xs text-[var(--app-color-text-primary)] cursor-pointer">
                                            <AdminSwitchScaled
                                                size="3"
                                                className="mt-0.5"
                                                checked={issueRuleSelectedKeys.includes(m.matchKey)}
                                                onChange={(checked) => {
                                                    setIssueRuleSelectedKeys((prev) => {
                                                        const s = new Set(prev);
                                                        if (checked) s.add(m.matchKey);
                                                        else s.delete(m.matchKey);
                                                        return Array.from(s);
                                                    });
                                                }}
                                            />
                                            <span>
                                                <span className="font-bold">{m.ruleName || `规则#${m.ruleId}`}</span>
                                                {" · 房间 "}
                                                {m.roomName || m.roomId}
                                                {!m.hasPrivilege ? (
                                                    <span className="text-amber-700">（规则未配通道/门组）</span>
                                                ) : null}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        </AdminFormCard>

                        <AdminFormCard title="5. 通道与门组" description="均可不选：将跳过下发大华权限，仅执行建人/绑卡等前置步骤。">
                        <div className="mb-3 rounded-xl border-2 border-[var(--app-color-border-default)] p-3 space-y-3">
                            <div className="flex flex-wrap gap-2 items-end">
                                <AdminToolbarSearchField
                                    className="min-w-0 flex-1 basis-[12rem]"
                                    placeholder="通道关键字（支持名称/编码搜索）"
                                    value={channelSearchKeyword}
                                    onChange={setChannelSearchKeyword}
                                    onSubmit={() => void loadChannelPicker(1, false)}
                                />
                                <select
                                    className="border border-[var(--app-color-border-default)] rounded-lg px-2 py-1.5 text-sm"
                                    value={channelRemarkId}
                                    onChange={(e) => setChannelRemarkId(e.target.value === "" ? "" : Number(e.target.value))}
                                >
                                    <option value="">备注分类</option>
                                    {channelRemarkCategories.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-white"
                                    onClick={() => void loadChannelPicker(1, false)}
                                >
                                    搜索通道
                                </button>
                            </div>
                            <div className="max-h-[160px] overflow-y-auto space-y-1">
                                {channelLoading && (
                                    <div className="text-xs text-[var(--app-color-text-tertiary)] flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" /> 加载通道…
                                    </div>
                                )}
                                {channelRows.map((ch) => {
                                    const code = normalizeChannelCode(ch.channelCode);
                                    const checked = bindForm.channelCodes.some((x) => normalizeChannelCode(x) === code);
                                    return (
                                        <div key={ch.id} className="flex items-start gap-2 text-xs cursor-pointer">
                                            <AdminSwitchScaled
                                                size="3"
                                                className="mt-0.5"
                                                disabled={!code}
                                                checked={checked}
                                                onChange={(on) => toggleIssueChannel(code, on, ch)}
                                            />
                                            <span className="break-all text-[var(--app-color-text-primary)]">
                                                <span className="font-medium">{labelForChannelRow(ch)}</span>
                                                {code && <span className="ml-1 text-[10px] text-[var(--app-color-text-tertiary)]">#{code}</span>}
                                            </span>
                                            {ch.remarkCategoryName && (
                                                <span className="text-[var(--app-color-text-tertiary)] shrink-0">[{ch.remarkCategoryName}]</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {channelRows.length < channelTotal && (
                                <button
                                    type="button"
                                    className="text-xs text-indigo-600 hover:underline"
                                    onClick={() => void loadChannelPicker(channelPage + 1, true)}
                                >
                                    加载更多…
                                </button>
                            )}
                            {bindForm.channelCodes.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1 border-t border-[var(--app-color-border-default)]">
                                    {bindForm.channelCodes.map((c) => (
                                        <span
                                            key={c}
                                            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-mono text-indigo-900"
                                        >
                                            {channelNameMap[normalizeChannelCode(c)] ||
                                                labelForChannelRow({
                                                    channelCode: c,
                                                    channelName: "",
                                                } as DahuaDeviceChannelRow)}
                                            <button type="button" className="text-indigo-500" onClick={() => toggleIssueChannel(c, false)} aria-label="移除">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <button
                                type="button"
                                className="text-xs text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] underline"
                                onClick={() => setShowPasteChannels((v) => !v)}
                            >
                                {showPasteChannels ? "收起「粘贴通道」" : "高级：粘贴通道编码"}
                            </button>
                            {showPasteChannels && (
                                <div className="space-y-1">
                                    <textarea
                                        className="w-full min-h-[72px] rounded border border-[var(--app-color-border-default)] p-2 font-mono text-xs"
                                        placeholder="每行一个，或逗号/分号分隔"
                                        value={pasteChannelRaw}
                                        onChange={(e) => setPasteChannelRaw(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="text-xs rounded bg-[var(--app-color-surface-hover)] px-2 py-1 hover:bg-[var(--app-color-surface-hover)]"
                                        onClick={() => mergePasteChannels()}
                                    >
                                        合并到已选
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="border-2 border-[var(--app-color-border-default)] rounded-xl p-2 mb-4 max-h-[220px] overflow-auto">
                            {sortedDoorGroups.map((g) => {
                                const checked = bindForm.doorGroupIds.includes(g.id);
                                return (
                                    <div key={g.id} className="flex items-center gap-2 py-1 px-1 rounded text-sm text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-page)]">
                                        <AdminSwitchScaled
                                            size="sm"
                                            checked={checked}
                                            onChange={(on) => {
                                                const set = new Set(bindForm.doorGroupIds);
                                                if (on) set.add(g.id);
                                                else set.delete(g.id);
                                                setBindForm({ ...bindForm, doorGroupIds: Array.from(set) });
                                            }}
                                        />
                                        <span>{g.name || `门组${g.id}`}</span>
                                        <span className="text-xs text-[var(--app-color-text-tertiary)]">#{g.id}</span>
                                    </div>
                                );
                            })}
                            {sortedDoorGroups.length === 0 && <div className="text-xs text-[var(--app-color-text-tertiary)]">暂无门组缓存，请先刷新</div>}
                        </div>
                        <div className="mb-4 flex justify-end">
                            <button
                                type="button"
                                className="px-2 py-1 text-xs rounded-lg border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
                                onClick={async () => {
                                    await refreshDahuaDoorGroups();
                                    const dgRes = await fetchDahuaDoorGroups(1, 500, "");
                                    setDoorGroups(dgRes.list || []);
                                    alert("门组缓存已刷新");
                                }}
                            >
                                刷新门组
                            </button>
                        </div>

                        {issueDahuaMutation.isPending && (
                            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                                <div className="text-xs font-bold text-indigo-700 mb-2">流程执行中（按步骤等待返回）</div>
                                <div className="space-y-1">
                                    {issuingPhaseLabels.map((label, idx) => {
                                        const isDone = idx < issuingPhase;
                                        const isCurrent = idx === issuingPhase;
                                        return (
                                            <div key={label} className={`text-xs flex items-center gap-2 ${isDone ? "text-emerald-700" : isCurrent ? "text-indigo-700" : "text-[var(--app-color-text-tertiary)]"}`}>
                                                {isDone ? (
                                                    <Check className="w-3.5 h-3.5" />
                                                ) : isCurrent ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <span className="inline-block w-3.5 h-3.5 rounded-full border border-[var(--app-color-border-strong)]" />
                                                )}
                                                <span>{label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {issueSteps.length > 0 && (
                            <div className="mb-4 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3">
                                <div className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2">执行步骤回显</div>
                                <div className="space-y-1 max-h-[120px] overflow-auto">
                                    {issueSteps.map((step, idx) => (
                                        <div key={`${step.stepName}-${idx}`} className={`text-xs ${step.success ? "text-emerald-700" : "text-rose-700"}`}>
                                            [{step.success ? "成功" : "失败"}] {step.stepName} {step.upstreamCode ? `(code=${step.upstreamCode})` : ""} {step.upstreamErrMsg || step.message || ""}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        </AdminFormCard>
                        </div>
                        <div className="flex shrink-0 justify-end gap-2 border-t border-neutral-100 px-6 py-4">
                            <AdminButton type="button" tone="secondary" onClick={closeIssueModal}>
                                取消
                            </AdminButton>
                            <AdminButton
                                type="button"
                                tone="primary"
                                className="gap-2"
                                disabled={!bindForm.aroUserId || !bindForm.cardNo || !bindForm.departmentId || issueDahuaMutation.isPending}
                                onClick={() =>
                                    issueDahuaMutation.mutate({
                                        cardNo: bindForm.cardNo.trim(),
                                        aroUserId: bindForm.aroUserId,
                                        userName: bindForm.userName,
                                        departmentId: Number(bindForm.departmentId),
                                        channelResourceCodes: bindForm.channelCodes.map(normalizeChannelCode).filter(Boolean),
                                        doorGroupIds: bindForm.doorGroupIds,
                                    })
                                }
                            >
                                {issueDahuaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
                                确认发卡
                            </AdminButton>
                        </div>
                    </div>
                </div></Portal>}

            {/* ═══ 追加卡片弹窗（为已有人员加卡） ═══ */}
            {addCardModalOpen && addCardTarget && <Portal><div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
                    onClick={closeAddCardModal}
                    role="presentation"
                >
                    <div
                        className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-[var(--app-color-surface-container)] shadow-xl ring-1 ring-black/[0.06]"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-3">
                            <h3 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
                                <Plus className="w-4 h-4 text-[var(--app-color-accent)]" />
                                追加卡片
                            </h3>
                            <button
                                type="button"
                                onClick={closeAddCardModal}
                                className="rounded-lg p-1.5 text-neutral-500 transition hover:bg-neutral-100"
                                aria-label="关闭"
                            >
                                <X className="h-5 w-5" aria-hidden />
                            </button>
                        </div>

                        <div className="flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-5 py-4">
                            {/* 人员信息 */}
                            <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3">
                                <div className="text-xs text-[var(--app-color-text-tertiary)] mb-1">绑定人员</div>
                                <div className="font-bold text-[var(--app-color-text-primary)]">{addCardTarget.userName || "—"}</div>
                                <div className="text-xs text-[var(--app-color-text-secondary)] mt-0.5">
                                    大华序号：<span className="font-mono">{addCardTarget.dahuaSeq}</span>
                                    {addCardTarget.dahuaPersonCode ? <span className="ml-2">编码：<span className="font-mono">{addCardTarget.dahuaPersonCode}</span></span> : null}
                                </div>
                                <div className="text-xs text-[var(--app-color-text-secondary)] mt-0.5">
                                    现有卡号：<span className="font-mono font-bold text-indigo-600">{addCardTarget.cardNo}</span>
                                </div>
                            </div>

                            {/* 扫描卡号 */}
                            <div>
                                <label className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-1.5 block">新物理卡号（读卡器输入）</label>
                                <input
                                    ref={addCardInputRef}
                                    type="text"
                                    lang="en"
                                    inputMode="text"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    value={addCardNo}
                                    onPaste={(e) => {
                                        e.preventDefault();
                                        const pasted = sanitizeCardNo(e.clipboardData.getData("text"));
                                        updateAddCardNoWithBuffer(pasted);
                                    }}
                                    onChange={(e) => {
                                        if (addCardComposingRef.current) return;
                                        const clean = sanitizeCardNo(e.target.value);
                                        updateAddCardNoWithBuffer(clean);
                                    }}
                                    onCompositionStart={() => { addCardComposingRef.current = true; }}
                                    onCompositionEnd={(e) => {
                                        addCardComposingRef.current = false;
                                        const clean = sanitizeCardNo((e.target as HTMLInputElement).value);
                                        updateAddCardNoWithBuffer(clean);
                                    }}
                                    className="w-full rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-2.5 font-mono font-semibold text-[var(--app-color-accent)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]/30"
                                    placeholder="等待读卡器输入..."
                                />
                                <p className="mt-1 text-[11px] text-[var(--app-color-text-tertiary)]">焦点置于输入框后刷卡，或手动粘贴卡号</p>
                            </div>

                            {/* 步骤回显 */}
                            {addCardMutation.data?.steps && addCardMutation.data.steps.length > 0 && (
                                <div className="rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-3">
                                    <div className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2">执行步骤</div>
                                    <div className="space-y-1 max-h-[120px] overflow-auto">
                                        {addCardMutation.data.steps.map((step, idx) => (
                                            <div key={`${step.stepName}-${idx}`} className={`text-xs ${step.success ? "text-emerald-700" : "text-rose-700"}`}>
                                                [{step.success ? "成功" : "失败"}] {step.stepName} {step.message || ""}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex shrink-0 justify-end gap-2 border-t border-neutral-100 px-5 py-3">
                            <AdminButton type="button" tone="secondary" size="sm" onClick={closeAddCardModal}>
                                取消
                            </AdminButton>
                            <AdminButton
                                type="button"
                                tone="primary"
                                size="sm"
                                className="gap-1.5"
                                disabled={!addCardNo.trim() || addCardMutation.isPending}
                                onClick={() => {
                                    if (!addCardTarget?.dahuaSeq || !addCardTarget?.dahuaPersonCode) return;
                                    addCardMutation.mutate({
                                        personId: addCardTarget.dahuaSeq,
                                        personCode: addCardTarget.dahuaPersonCode,
                                        cardNo: addCardNo.trim(),
                                        aroUserId: addCardTarget.aroUserId || "",
                                    });
                                }}
                            >
                                {addCardMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                                确认追加
                            </AdminButton>
                        </div>
                    </div>
                </div></Portal>}

        </AdminPageShell>
    );
}

/** 人脸照片单元格：显示预览缩略图 + 角标计数，点击打开照片管理弹窗 */
function FacePhotoCell({
    aroUserId,
    headUrl,
    onUpdated,
}: {
    aroUserId?: string;
    headUrl?: string;
    onUpdated: () => void;
}) {
    const [enrollOpen, setEnrollOpen] = useState(false);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [photos, setPhotos] = useState<BaselinePhoto[]>([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);

    const fallbackSrc = resolvePersonnelAvatarUrl(headUrl) ?? null;
    const previewSrc = photos.length > 0 ? photos[0].url : fallbackSrc;
    const photoCount = photos.length;

    // 加载底库照片列表
    const loadPhotos = useCallback(async () => {
        if (!aroUserId) return;
        setLoadingPhotos(true);
        try {
            const data = await fetchBaselinePhoto(aroUserId);
            setPhotos(data.photos || []);
        } catch { /* ignore */ }
        setLoadingPhotos(false);
    }, [aroUserId]);

    useEffect(() => {
        loadPhotos();
    }, [loadPhotos]);

    // 删除单张
    const handleDeleteOne = async (id: number) => {
        if (!aroUserId) return;
        try {
            await deleteBaselinePhotoById(aroUserId, id);
            setPhotos(prev => prev.filter(p => p.id !== id));
            toast.success('已删除');
            onUpdated();
        } catch (err: any) {
            toast.error(err?.message || '删除失败');
        }
    };

    // 录入前先清空旧照片 + 关闭画廊
    const handleStartEnroll = async () => {
        if (!aroUserId) return;
        setGalleryOpen(false);
        forceReleaseAllFaceCameras();
        if (photos.length > 0) {
            setUploading(true);
            try {
                await deleteBaselinePhoto(aroUserId);
                setPhotos([]);
            } catch (err: any) {
                toast.error('清空旧照片失败: ' + (err?.message || '请检查登录权限'));
                setUploading(false);
                return;
            }
            setUploading(false);
        }
        setEnrollOpen(true);
    };

    if (uploading) {
        return (
            <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center bg-[var(--app-color-surface-hover)]">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--app-color-accent)]" />
            </div>
        );
    }

    return (
        <>
            {/* 录入弹窗 */}
            {enrollOpen && aroUserId && (
                <FaceEnrollment
                    userId={aroUserId}
                    replaceExisting
                    uploadFn={async (file) => {
                        const row = await uploadBaselinePhoto(aroUserId, file);
                        return row;
                    }}
                    onCaptured={() => {
                        setEnrollOpen(false);
                        toast.success('人脸照片录入成功');
                        loadPhotos();
                        onUpdated();
                    }}
                    onCancel={() => { setEnrollOpen(false); forceReleaseAllFaceCameras(); }}
                />
            )}

            {/* 照片管理弹窗 */}
            {galleryOpen && (
                <PhotoGalleryModal
                    photos={photos}
                    fallbackSrc={fallbackSrc}
                    loading={loadingPhotos}
                    onDelete={handleDeleteOne}
                    onEnroll={handleStartEnroll}
                    onClose={() => setGalleryOpen(false)}
                />
            )}

            {/* 缩略图 + 角标 */}
            <div className="relative group w-10 h-10 mx-auto">
                <button
                    onClick={() => aroUserId && setGalleryOpen(true)}
                    className="w-10 h-10 block"
                    title={photoCount > 0 ? `${photoCount} 张底库照片，点击管理` : '未录入，点击录入'}
                >
                    {previewSrc ? (
                        <img
                            src={previewSrc}
                            alt=""
                            className="w-10 h-10 rounded-full object-cover border-2 border-[var(--app-color-border-default)]
                                group-hover:opacity-70 transition-opacity"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center
                            border-2 border-dashed border-[var(--app-color-border-default)]
                            bg-[var(--app-color-surface-page)]">
                            <Camera className="w-4 h-4 text-[var(--app-color-text-tertiary)]" />
                        </div>
                    )}
                </button>
                {/* 角标计数 */}
                {photoCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[var(--app-color-accent)] text-white
                        text-[10px] font-bold flex items-center justify-center shadow-md pointer-events-none">
                        {photoCount}
                    </span>
                )}
            </div>
        </>
    );
}

/** 照片管理弹窗：浏览所有底库照片、删除、重新录入 */
function PhotoGalleryModal({
    photos,
    fallbackSrc,
    loading,
    onDelete,
    onEnroll,
    onClose,
}: {
    photos: BaselinePhoto[];
    fallbackSrc: string | null;
    loading: boolean;
    onDelete: (id: number) => void;
    onEnroll: () => void;
    onClose: () => void;
}) {
    return createPortal(
        <div
            className={`fixed inset-0 flex items-center justify-center ${FACE_MODAL_BACKDROP_CLASS}`}
            style={{ zIndex: Z_INDEX.facePhotoGallery }}
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={e => e.stopPropagation()}
                className={`flex w-[min(420px,92vw)] max-h-[80vh] flex-col gap-4 rounded-[var(--app-radius-container)] p-5 shadow-[var(--app-elevation-modal)] ${FACE_MODAL_SHELL_CLASS}`}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">
                        底库照片 ({photos.length} 张)
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--app-color-surface-hover)] rounded-full">
                        <X className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-[var(--app-color-accent)]" />
                    </div>
                ) : photos.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                        {fallbackSrc ? (
                            <img src={fallbackSrc} alt="" className="w-24 h-24 rounded-full object-cover border-2 border-[var(--app-color-border-default)]" referrerPolicy="no-referrer" />
                        ) : (
                            <Camera className="w-12 h-12 text-[var(--app-color-text-tertiary)]" />
                        )}
                        <p className="text-xs text-[var(--app-color-text-tertiary)]">暂无底库照片</p>
                        <button
                            onClick={onEnroll}
                            className="rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-inverse)] hover:opacity-90"
                        >
                            立即录入
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-3 gap-3 max-h-[300px] overflow-y-auto">
                            {photos.map(p => (
                                <div key={p.id} className="relative group/item">
                                    <img
                                        src={p.url}
                                        alt=""
                                        className="aspect-square w-full rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] object-cover"
                                    />
                                    <button
                                        onClick={() => onDelete(p.id)}
                                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--app-color-feedback-danger)] text-[var(--app-color-text-inverse)] opacity-0 transition-opacity group-hover/item:opacity-100"
                                        title="删除此照片"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={onEnroll}
                            className="flex w-full items-center justify-center gap-2 rounded-[var(--app-radius-element)] border-2 border-dashed border-[var(--app-color-accent)] py-2 text-sm font-medium text-[var(--app-color-accent)] transition-colors hover:bg-[var(--app-color-accent-soft)]"
                        >
                            <Camera className="w-4 h-4" />
                            重新录入（将删除现有照片）
                        </button>
                    </>
                )}
            </motion.div>
        </div>,
        document.body
    );
}