import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Portal } from "@/components/Portal";
import {
    fetchCardMappings, searchCardMappings, updateExemptFlag, updateCardStatus, searchPersonnel,
    deleteCardMapping, runManualReaper, issueDahuaCard, fetchDahuaDepartments, refreshDahuaDepartments,
    fetchDahuaDoorGroups, refreshDahuaDoorGroups, fetchFreezeConfig, saveFreezeConfig,
    fetchAccessRuleScanLinkageConfig, saveAccessRuleScanLinkageConfig,
    fetchDahuaIssueAccessPrefill,
    type DahuaIssueAccessPrefill,
    fetchDahuaDeviceChannels, fetchDahuaDeviceChannelRemarkCategories,
    type DahuaDepartmentRow, type DahuaDoorGroupRow,
    type DahuaDeviceChannelRow, type DahuaDeviceChannelRemarkCategory, type CardMappingRow,
} from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard, AdminPageShell } from "@/components/admin/AdminPageShell";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { AdminToolbar, AdminToolbarActions } from "@/components/admin/AdminToolbar";
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
import {RefreshCw, ShieldCheck, Link, Ban, Plus, User, Check, Loader2, X, Trash2, Clock, MoreHorizontal, ShieldAlert, Camera, ImageUp} from "lucide-react";
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
    EXEMPT_DURATION_PRESETS,
    formatExemptExpireAt,
    formatExemptRemaining,
    EXEMPT_MODE_OPTIONS,
    formatExemptStatus,
} from "@/constants/exemptDurationPresets";
import { ScanDelayConfigPanel } from "@/components/scanner/ScanDelayConfigPanel";

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

export default function DebugCardMappingPage() {
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
    const [exemptRoomOptions, setExemptRoomOptions] = useState<
        { roomId: string; roomName: string; selected: boolean }[]
    >([]);
    const [exemptMode, setExemptMode] = useState<string>("TIME");
    const [exemptMaxCount, setExemptMaxCount] = useState<string>("");
    const [exemptRoomsLoading, setExemptRoomsLoading] = useState(false);
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

    // 💥 物理映射解除引擎
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

    const submitExemptConfig = (durationMinutes?: number) => {
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
        toggleExemptMutation.mutate({
            cardNo: exemptModal.cardNo,
            flag: 1,
            durationMinutes,
            mode: exemptMode,
            maxCount,
            roomIds: JSON.stringify(selectedRooms.map((r) => r.roomId)),
        });
    };

    const toggleExemptMutation = useMutation({
        mutationFn: (variables: {
            cardNo: string; flag: number; durationMinutes?: number;
            mode?: string; maxCount?: number; roomIds?: string;
        }) => updateExemptFlag(variables.cardNo, variables.flag, variables.durationMinutes,
            variables.mode, variables.maxCount, variables.roomIds),
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

    const displayData: CardMappingRow[] = isSearching ? searchResults : (data?.list || []);

    const timeOptionsWithCurrent = (current: string) => {
        if (current && !FREEZE_TIME_OPTIONS.includes(current)) {
            return [current, ...FREEZE_TIME_OPTIONS];
        }
        return FREEZE_TIME_OPTIONS;
    };

    const role = authStorage.getRole() || "STUDENT";
    const canCardIssue = hasMinRole(role, "STAFF");
    const canReaper = hasMinRole(role, "SUPER_ADMIN");
    const canGrantExempt = hasMinRole(role, "ADMIN");
    const canFreezeCfg = hasMinRole(role, "STAFF");
    const showCardPageMenu = canCardIssue || canReaper || canFreezeCfg;

    return (
        <AdminPageShell
            title="大华发卡"
            description="大华卡号与 ARO 用户绑定、豁免与自动冻结策略。发卡流程按步骤下发人员、权限与落库映射。"
            className="h-full"
        >
                    <AdminToolbar className="mb-4 flex shrink-0 flex-nowrap items-center gap-3 overflow-x-auto pb-1">
                        <AdminToolbarActions className="ml-auto flex min-w-0 shrink-0 flex-nowrap items-center gap-2">
                            {showCardPageMenu ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex h-[var(--admin-control-height,2.25rem)] shrink-0 items-center gap-1 rounded-lg border border-[var(--app-color-border-strong)] bg-[var(--app-color-surface-container)] px-3 text-xs font-bold text-[var(--app-color-text-secondary)] shadow-[var(--app-elevation-card)] hover:bg-[var(--app-color-surface-page)]"
                                        >
                                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                                            本页操作
                                        </button>
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
                            <div className="flex shrink-0 flex-nowrap items-center gap-2 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-1.5 shadow-[var(--app-elevation-card)] sm:gap-3 sm:px-4">
                                <button type="button" disabled={page === 1 || isSearching} onClick={() => setPage(p => p - 1)} className="font-black text-indigo-600 disabled:text-[var(--app-color-text-tertiary)]">◀</button>
                                <span className="whitespace-nowrap text-xs font-bold text-[var(--app-color-text-secondary)] sm:text-sm">第 {isSearching ? '-' : page} / {isSearching ? '-' : totalPages || 1} 页</span>
                                <button type="button" disabled={page === totalPages || totalPages === 0 || isSearching} onClick={() => setPage(p => p + 1)} className="font-black text-indigo-600 disabled:text-[var(--app-color-text-tertiary)]">▶</button>
                            </div>
                        </AdminToolbarActions>
                    </AdminToolbar>

                    {isLoading && !isSearching ? (
                        <div className="flex-1 flex justify-center items-center gap-3 text-xl font-bold text-[var(--app-color-text-tertiary)]">
                            <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" /> 正在加载映射矩阵...
                        </div>
                    ) : (
                        <div className="flex-1 bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] rounded-xl shadow-[var(--app-elevation-card)] overflow-auto relative pb-24">
                    <table className="w-full min-w-max text-left text-sm whitespace-nowrap border-collapse">
                        <thead className="bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] font-bold border-b-2 border-[var(--app-color-border-strong)] sticky top-0 z-20 shadow-[var(--app-elevation-card)]">
                        <tr>
                            <th className="p-4 w-16 text-center">状态</th>
                            <th className="p-4 w-16 text-center">照片</th>
                            <th className="p-4">绑定人员 (ARO)</th>
                            <th className="p-4">课题组</th>
                            <th className="p-4">物理卡号 (扫描头输入)</th>
                            <th className="p-4">大华通道序号 (下发指令用)</th>
                            <th className="p-4 text-center">系统特权 (豁免自动冻结)</th>
                            <th className="p-4 text-right">上次修改时间</th>
                            <th className="p-4 text-center w-20">操作</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--app-color-border-default)]">
                        {displayData.map((row, idx: number) => {
                            const isFrozen = row.cardStatus === 'FROZEN';
                            const isExempt =
                                row.freezeExemptFlag === 1 &&
                                (!row.freezeExemptExpireAt ||
                                    Date.parse(String(row.freezeExemptExpireAt).replace(/-/g, "/")) > Date.now());
                            const exemptRemain = isExempt ? formatExemptRemaining(row.freezeExemptExpireAt) : "";
                            const rowKey = row.cardNo || row.aroUserId || `row-${idx}`;

                            return (
                                <tr key={rowKey} className="hover:bg-indigo-50/50 transition-colors">
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => toggleStatusMutation.mutate({ cardNo: row.cardNo, status: isFrozen ? 'NORMAL' : 'FROZEN' })}
                                            disabled={toggleStatusMutation.isPending}
                                            className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center transition-all ${isFrozen ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'}`}
                                            title={isFrozen ? '点击解冻' : '点击冻结'}
                                        >
                                            {isFrozen ? <Ban className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                                        </button>
                                    </td>
                                    <td className="p-3 text-center">
                                        <FacePhotoCell
                                            aroUserId={row.aroUserId}
                                            headUrl={row.head}
                                            onUpdated={() => refetch()}
                                        />
                                    </td>
                                    <td className="p-3">
                                        <div className="font-black text-[var(--app-color-text-primary)] text-base">{row.userName || '（人员库未匹配）'}</div>
                                        <div className="font-mono text-xs text-[var(--app-color-text-tertiary)] mt-1">ARO ID：{row.aroUserId || '—'}</div>
                                        <div className="font-mono text-xs text-[var(--app-color-text-tertiary)] mt-0.5">工号：{row.jobNumber || '—'}</div>
                                    </td>
                                    <td className="p-3 text-sm text-[var(--app-color-text-secondary)] max-w-[200px] whitespace-normal">
                                        {row.projectGroupName || '—'}
                                    </td>
                                    <td className="p-3 font-mono font-bold text-indigo-600">
                                        {row.cardNo}
                                    </td>
                                    <td className="p-3">
                                        <div className="flex items-center gap-2 bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-secondary)] px-2 py-1 rounded w-fit font-mono text-xs border border-[var(--app-color-border-default)]">
                                            <Link className="w-3 h-3" />
                                            {row.dahuaSeq}
                                        </div>
                                        <div className="font-mono text-xs text-[var(--app-color-text-tertiary)] mt-1">
                                            大华人员编码：{row.dahuaPersonCode || '—'}
                                        </div>
                                    </td>
                                    <td className="p-3 text-center">
                                        {canGrantExempt ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isExempt) {
                                                    if (window.confirm(`取消卡号 ${row.cardNo} 的豁免？`)) {
                                                        toggleExemptMutation.mutate({ cardNo: row.cardNo, flag: 0 });
                                                    }
                                                    return;
                                                }
                                                setExemptModal({ cardNo: row.cardNo, userName: row.userName, aroUserId: row.aroUserId });
                                                setExemptMode("TIME");
                                                setExemptMaxCount("");
                                                setExemptRoomOptions([]);
                                                if (row.aroUserId) loadExemptRoomOptions(row.aroUserId);
                                            }}
                                            disabled={toggleExemptMutation.isPending}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${isExempt ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-[var(--app-color-surface-hover)] text-[var(--app-color-text-tertiary)] border border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]'}`}
                                        >
                                            {isExempt ? '👑 已豁免' : '受控'}
                                        </button>
                                        ) : (
                                            <span className="text-xs text-[var(--app-color-text-tertiary)]">{isExempt ? '已豁免' : '受控'}</span>
                                        )}
                                        {(() => {
                                            const statusText = formatExemptStatus(row);
                                            return statusText ? (
                                                <div className="mt-1 text-[10px] text-amber-600 font-mono">{statusText}</div>
                                            ) : null;
                                        })()}
                                        {isExempt && row.freezeExemptExpireAt ? (
                                            <div className="mt-0.5 text-[10px] text-[var(--app-color-text-tertiary)] font-mono">
                                                至 {formatExemptExpireAt(row.freezeExemptExpireAt)}
                                            </div>
                                        ) : null}
                                    </td>
                                    <td className="p-3 text-right font-mono text-xs text-[var(--app-color-text-tertiary)]">
                                        {row.lastModifiedTime || '-'}
                                    </td>
                                    {/* 💥 新增：删除操作单元格 */}
                                    <td className="p-3 text-center">
                                        <button
                                            onClick={() => {
                                                // 🚨 强警告阻断：防止管理员手抖误触
                                                if (window.confirm(`🚨 危险操作确认\n\n您即将永久销毁物理卡号 [${row.cardNo}] 与人员 [${row.userName || row.aroUserId}] 的绑定关系。\n\n解除后该卡将彻底失效，是否继续？`)) {
                                                    deleteMappingMutation.mutate(row.cardNo);
                                                }
                                            }}
                                            disabled={deleteMappingMutation.isPending}
                                            className="p-2 text-[var(--app-color-text-tertiary)] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all active:scale-95 disabled:opacity-50"
                                            title="解除物理映射"
                                        >
                                            {deleteMappingMutation.isPending && deleteMappingMutation.variables === row.cardNo ? (
                                                <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                                            ) : (
                                                <Trash2 className="w-5 h-5" />
                                            )}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                    {isSearching && displayData.length === 0 && <div className="p-10 text-center font-bold text-[var(--app-color-text-tertiary)]">未在映射矩阵中找到关联记录...</div>}
                        </div>
                    )}

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
                                <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] mb-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={freezeForm.enabled}
                                        onChange={(e) => setFreezeForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                                    />
                                    启用每日自动冻结
                                </label>
                                <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] mb-4 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={freezeForm.dailyExemptRevokeAutoSignoutEnabled}
                                        onChange={(e) =>
                                            setFreezeForm((prev) => ({
                                                ...prev,
                                                dailyExemptRevokeAutoSignoutEnabled: e.target.checked,
                                            }))
                                        }
                                    />
                                    （已迁移）请改在「定时管理 → 每日豁免权回收」勾选「回收后签离」
                                </label>
                            </>
                        )}

                        {freezeSlotModal === 2 && (
                            <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] mb-4 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={freezeForm.secondFreezeAutoSignoutEnabled}
                                    onChange={(e) =>
                                        setFreezeForm((prev) => ({ ...prev, secondFreezeAutoSignoutEnabled: e.target.checked }))
                                    }
                                />
                                第二次冻结时：今日曾豁免且仍未离开者，自动执行完整离开
                            </label>
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
                                <label className="text-xs font-bold text-[var(--app-color-text-secondary)] mb-2 block">豁免时长</label>
                                <div className="flex flex-col gap-1.5">
                                    {EXEMPT_DURATION_PRESETS.map(preset => (
                                        <button key={preset.durationMinutes} type="button"
                                            disabled={toggleExemptMutation.isPending}
                                            className="w-full px-4 py-2 rounded-lg text-sm font-bold text-[var(--app-color-text-secondary)] bg-[var(--app-color-surface-page)] border border-[var(--app-color-border-default)] hover:bg-amber-50 hover:border-amber-300 disabled:opacity-50 transition-colors"
                                            onClick={() => submitExemptConfig(preset.durationMinutes)}
                                        >{preset.label}</button>
                                    ))}
                                </div>
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

                        {/* COUNT/BOTH 模式的提交按钮 */}
                        {(exemptMode === 'COUNT' || exemptMode === 'BOTH') && (
                            <button type="button"
                                disabled={toggleExemptMutation.isPending || exemptRoomOptions.filter(r => r.selected).length === 0 || !exemptMaxCount.trim()}
                                className="w-full px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                                onClick={() => submitExemptConfig(
                                    exemptMode === 'BOTH' ? EXEMPT_DURATION_PRESETS[0].durationMinutes : undefined,
                                )}
                            >确认设置</button>
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
                                        <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={linkageForm.swipeExitSkipConfirm}
                                                onChange={(e) => setLinkageForm((p) => ({ ...p, swipeExitSkipConfirm: e.target.checked }))}
                                            />
                                            二次刷卡离开跳过确认
                                        </label>
                                        <p className="text-[11px] text-[var(--app-color-text-tertiary)] leading-snug ml-6">
                                            开启后，已进入状态再次扫码将直接执行离开，不弹出确认对话框。
                                        </p>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-[var(--app-color-text-tertiary)] uppercase tracking-wide mb-2">权限（大华门禁规则）</p>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={linkageForm.enterDispatchEnabled}
                                                onChange={(e) => setLinkageForm((p) => ({ ...p, enterDispatchEnabled: e.target.checked }))}
                                            />
                                            进入时执行门禁规则（大华权限下发）
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={linkageForm.exitDispatchEnabled}
                                                onChange={(e) => setLinkageForm((p) => ({ ...p, exitDispatchEnabled: e.target.checked }))}
                                            />
                                            离开时执行门禁规则（大华权限回收）
                                        </label>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-[var(--app-color-text-tertiary)] uppercase tracking-wide mb-2">冻融（物理卡 / 大华人员状态）</p>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={linkageForm.enterUnfreezeEnabled}
                                                onChange={(e) => setLinkageForm((p) => ({ ...p, enterUnfreezeEnabled: e.target.checked }))}
                                            />
                                            进入时解冻物理卡（大华人员解冻）
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-[var(--app-color-text-secondary)] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={linkageForm.exitFreezeEnabled}
                                                onChange={(e) => setLinkageForm((p) => ({ ...p, exitFreezeEnabled: e.target.checked }))}
                                            />
                                            离开时冻结物理卡（扫码/自动签退）
                                        </label>
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
                                        <label key={m.matchKey} className="flex items-start gap-2 text-xs text-[var(--app-color-text-primary)] cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5"
                                                checked={issueRuleSelectedKeys.includes(m.matchKey)}
                                                onChange={(e) => {
                                                    const on = e.target.checked;
                                                    setIssueRuleSelectedKeys((prev) => {
                                                        const s = new Set(prev);
                                                        if (on) s.add(m.matchKey);
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
                                        </label>
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
                                        <label key={ch.id} className="flex items-start gap-2 text-xs cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="mt-0.5"
                                                disabled={!code}
                                                checked={checked}
                                                onChange={(e) => toggleIssueChannel(code, e.target.checked, ch)}
                                            />
                                            <span className="break-all text-[var(--app-color-text-primary)]">
                                                <span className="font-medium">{labelForChannelRow(ch)}</span>
                                                {code && <span className="ml-1 text-[10px] text-[var(--app-color-text-tertiary)]">#{code}</span>}
                                            </span>
                                            {ch.remarkCategoryName && (
                                                <span className="text-[var(--app-color-text-tertiary)] shrink-0">[{ch.remarkCategoryName}]</span>
                                            )}
                                        </label>
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
                                    <label key={g.id} className="flex items-center gap-2 py-1 px-1 rounded text-sm text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-page)]">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                                const set = new Set(bindForm.doorGroupIds);
                                                if (e.target.checked) set.add(g.id);
                                                else set.delete(g.id);
                                                setBindForm({ ...bindForm, doorGroupIds: Array.from(set) });
                                            }}
                                        />
                                        <span>{g.name || `门组${g.id}`}</span>
                                        <span className="text-xs text-[var(--app-color-text-tertiary)]">#{g.id}</span>
                                    </label>
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