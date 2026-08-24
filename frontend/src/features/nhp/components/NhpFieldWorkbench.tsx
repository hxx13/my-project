/**
 * NHP 字段字典管理工作台（单个 dictKey 的字段管理）。
 *
 * 自包含工作台：自带工作区外壳（返回/搜索/状态筛选 + 左树右详情 + 弹窗），
 * 可嵌入 ContentManagerWorkbenchLayout 风格的内容管理壳，也可嵌入后台控制台页壳。
 *
 * 视觉/交互对齐：
 * - AupDictPage（aup-app 双栏、白卡片、搜索条、弹层）
 * - 设计 08 + 原型「字段/码表管理」（域→子模块→字段三级树，右侧 12 列元数据）
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  batchUnfreezeNhpFields,
  createNhpField,
  deleteNhpField,
  fetchNhpFieldPublishedUsage,
  fetchNhpFields,
  submitNhpFieldReview,
  approveNhpFieldReview,
  rejectNhpFieldReview,
  unfreezeNhpField,
  updateNhpField,
  type NhpField,
} from "../api/nhpField.api";
import {
  fetchNhpFieldDictionary,
  fetchNhpDictStructure,
  addNhpDictDomain,
  addNhpDictSubmodule,
  deleteNhpDictDomain,
  deleteNhpDictSubmodule,
  cloneNhpDictStructureFrom,
  renameNhpDictDomain,
  renameNhpDictSubmodule,
  syncNhpDictAtomLabels,
} from "../api/nhpFieldDictionary.api";
import { fetchNhpCodelistById, fetchNhpCodelistPublishedOptions, fetchNhpCodelists, type NhpCodelist } from "../api/nhpCodelist.api";
import { buildNhpCodelistPath, buildNhpFieldPagePath, nhpPathOf, sanitizeNhpReturnTo } from "../utils/nhpAdminNav";
import { compareBySortOrder, compareCodedId } from "../utils/domainSort";
import { isBlankOrSameAsCode } from "../utils/nhpSectionTitle";
import { scheduleScrollAsideItem } from "@/features/form-shared/scrollAsideItem";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import FolderTreeManager, { type FolderAction, type FolderTreeGroup } from "@/features/form-shared/FolderTreeManager";
import { FIELD_FOLDER_LABELS } from "../utils/folderTreeLabels";
import "@/features/aup/aup.css";
import "../nhp.css";

type StatusFilter = "ALL" | "DRAFT" | "PENDING_REVIEW" | "FROZEN";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "全部" },
  { value: "DRAFT", label: "草稿" },
  { value: "PENDING_REVIEW", label: "待校对" },
  { value: "FROZEN", label: "已冻结" },
];

function parseStatusFilter(raw: string | null): StatusFilter | null {
  const st = (raw || "").trim().toUpperCase();
  if (st === "DRAFT" || st === "PENDING_REVIEW" || st === "FROZEN" || st === "ALL") return st;
  return null;
}

/** 仅猪套种子参考名；其它数据域套勿默认套用 */
const PIG_DOMAIN_HINTS: { code: string; label: string }[] = [
  { code: "D1", label: "供体猪域" },
  { code: "D2", label: "受体 NHP 域" },
  { code: "D3", label: "配型与手术域" },
  { code: "D4", label: "样本与检测域" },
  { code: "D5", label: "随访与事件域" },
  { code: "D6", label: "免疫抑制用药域" },
  { code: "D7", label: "麻醉术中监护域" },
  { code: "D8", label: "病理诊断域" },
  { code: "D9", label: "心脏移植模块" },
  { code: "D10", label: "体外肝灌注模块" },
  { code: "D11", label: "平台治理域" },
  { code: "D12", label: "标准与版本域" },
  { code: "D13", label: "用户与权限域" },
];

const DATA_TYPES = [
  { value: "STRING", label: "字符" },
  { value: "TEXT", label: "文本" },
  { value: "INTEGER", label: "整数" },
  { value: "DECIMAL", label: "数值" },
  { value: "DATE", label: "日期" },
  { value: "DATETIME", label: "日期时间" },
  { value: "BOOLEAN", label: "布尔" },
  { value: "ENUM", label: "枚举" },
  { value: "ENUM_MULTI", label: "枚举多选" },
  { value: "CALC", label: "计算" },
  { value: "FILE", label: "文件" },
];

const REQUIRED_OPTS = [
  { value: "YES", label: "是" },
  { value: "NO", label: "否" },
  { value: "CONDITIONAL", label: "条件" },
];

function domainOf(fieldCode: string): string {
  const m = fieldCode?.match(/^(D+\d+)/i);
  return m ? m[1].toUpperCase() : "其它";
}

function submoduleOf(fieldCode: string): string {
  const m = fieldCode?.match(/^(D+\d+\.\d+)/i);
  return m ? m[1].toUpperCase() : "未分子模块";
}

function typeLabel(t?: string): string {
  return DATA_TYPES.find((x) => x.value === t)?.label ?? t ?? "—";
}

function requiredLabel(r?: string): string {
  return REQUIRED_OPTS.find((x) => x.value === r)?.label ?? r ?? "—";
}

function isEnumType(t?: string): boolean {
  const u = (t ?? "").toUpperCase();
  return u === "ENUM" || u === "ENUM_MULTI";
}

/** 字段编码 Dn.mm.nnn */
const FIELD_CODE_RE = /^D+\d+\.\d+\.\d+$/i;

function normalizeCode(s: string): string {
  return s.trim().toUpperCase();
}

function statusMeta(status?: string): { text: string; bg: string; color: string } {
  switch ((status ?? "").toUpperCase()) {
    case "FROZEN":
      return { text: "已冻结", bg: "#e8f7ee", color: "#16a34a" };
    case "PENDING_REVIEW":
      return { text: "待校对", bg: "#fdf3e3", color: "#d97706" };
    case "RETIRED":
      return { text: "已退役", bg: "#eef2f7", color: "#64748b" };
    default:
      return { text: "草稿", bg: "#eef2ff", color: "#002FA7" };
  }
}

function piReviewLabel(status?: string): string {
  switch ((status ?? "").toUpperCase()) {
    case "FROZEN":
      return "已通过 / 冻结";
    case "PENDING_REVIEW":
      return "待校对";
    case "RETIRED":
      return "已退役";
    default:
      return "待校对";
  }
}

/**
 * 建议一个尚未占用的单 D 表码（如 D1、D3）。
 * 仅作编码提示，不是「下一序号 / 第 N 步」——域码是表码/id。
 */
function suggestUnusedDomainCode(domains: { code?: string }[]): string {
  const used = new Set(
    domains
      .map((d) => (d.code || "").trim().toUpperCase())
      .filter((c) => /^D\d+$/i.test(c)),
  );
  for (let i = 1; i <= 99; i++) {
    const c = `D${i}`;
    if (!used.has(c)) return c;
  }
  return "D100";
}

type FieldForm = {
  fieldCode: string;
  nameEn: string;
  nameCn: string;
  dataType: string;
  unit: string;
  required: string;
  codelistId: string;
  description: string;
};

const emptyForm = (): FieldForm => ({
  fieldCode: "",
  nameEn: "",
  nameCn: "",
  dataType: "STRING",
  unit: "",
  required: "NO",
  codelistId: "",
  description: "",
});

export interface NhpFieldWorkbenchProps {
  /** 工作台返回按钮回调；缺省时回退到内容管理默认返回逻辑（returnTo → nhp-field 列表） */
  onBack?: () => void;
}

export default function NhpFieldWorkbench({ onBack }: NhpFieldWorkbenchProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { dictKey: dictKeyParam } = useParams<{ dictKey: string }>();
  const dictKey = (dictKeyParam || "").trim();

  useEffect(() => {
    if (!dictKey) {
      navigate("/content-manager/nhp-template", { replace: true });
    }
  }, [dictKey, navigate]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    () => parseStatusFilter(searchParams.get("status")) ?? "ALL",
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /**
   * 角色门控（本壳本身要求 ADMIN+）：
   * - 录入/字典维护：可见「提交校对」（DRAFT）
   * - 校对：ADMIN 代行 PI「通过并冻结 / 驳回」；正式 PI 身份标签尚未接入（ADMIN-as-PI gap）
   */
  const role = authStorage.getRole() || "";
  const canMaintainDict = hasMinRole(role, "ADMIN");
  const canPiReview = hasMinRole(role, "ADMIN"); // TODO: 将来改为 PI identityTag，ADMIN 仅代行
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [domainOpen, setDomainOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameKind, setRenameKind] = useState<"domain" | "submodule">("domain");
  const [renameCode, setRenameCode] = useState("");
  const [renameName, setRenameName] = useState("");
  const [domainForm, setDomainForm] = useState({ code: "", name: "" });
  const [subForm, setSubForm] = useState({ domainCode: "", code: "", name: "" });
  const [form, setForm] = useState<FieldForm>(emptyForm());
  const [createPrefillSub, setCreatePrefillSub] = useState<string | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const pendingScrollCode = useRef<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);

  const dictQuery = useQuery({
    queryKey: ["nhp", "field-dictionaries", dictKey],
    queryFn: () => fetchNhpFieldDictionary(dictKey),
    enabled: !!dictKey,
  });

  const fieldsQuery = useQuery({
    queryKey: ["nhp", "fields", dictKey],
    queryFn: () => fetchNhpFields(undefined, { dictKey }),
    enabled: !!dictKey,
  });
  const structureQuery = useQuery({
    queryKey: ["nhp", "field-structure", dictKey],
    queryFn: () => fetchNhpDictStructure(dictKey),
    enabled: !!dictKey,
  });
  const codelistsQuery = useQuery({
    queryKey: ["nhp", "codelists"],
    queryFn: fetchNhpCodelists,
  });
  /** 编辑挂接：仅最新已发布版本可选 */
  const publishedCodelistsQuery = useQuery({
    queryKey: ["nhp", "codelist", "published-options"],
    queryFn: fetchNhpCodelistPublishedOptions,
  });

  const fields = fieldsQuery.data ?? [];
  const pendingReviewCount = useMemo(
    () => fields.filter((f) => (f.status ?? "").toUpperCase() === "PENDING_REVIEW").length,
    [fields],
  );
  const frozenFields = useMemo(
    () => fields.filter((f) => (f.status ?? "").toUpperCase() === "FROZEN"),
    [fields],
  );
  const structure = structureQuery.data;
  /** 展示序：sortOrder 优先；编码数值序仅兜底（Dn 是表码，不是步骤） */
  const structureDomains = useMemo(() => {
    const domains = structure?.domains ?? [];
    return [...domains].sort(compareBySortOrder);
  }, [structure?.domains]);
  const hasDeclaredStructure = structureDomains.length > 0;
  const codelists = codelistsQuery.data ?? [];
  const publishedCodelists = publishedCodelistsQuery.data ?? [];
  const dictionary = dictQuery.data;

  const codelistById = useMemo(() => {
    const m = new Map<number, NhpCodelist>();
    codelists.forEach((c) => m.set(c.id, c));
    publishedCodelists.forEach((c) => m.set(c.id, c));
    return m;
  }, [codelists, publishedCodelists]);

  /** 展开域/子模块，并标记左栏滚入目标 */
  const focusField = (hit: NhpField) => {
    const d = domainOf(hit.fieldCode);
    const s = submoduleOf(hit.fieldCode);
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.delete(d);
      next.delete(`${d}:${s}`);
      return next;
    });
    setSelectedId(hit.id);
    pendingScrollCode.current = hit.fieldCode;
  };

  /** URL ?status= 同步到筛选（支持从旧校对页跳转 ?status=PENDING_REVIEW） */
  useEffect(() => {
    const fromUrl = parseStatusFilter(searchParams.get("status"));
    if (fromUrl) setStatusFilter(fromUrl);
  }, [searchParams]);

  const applyStatusFilter = (next: StatusFilter) => {
    setStatusFilter(next);
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("fieldCode");
        if (next === "ALL") p.delete("status");
        else p.set("status", next);
        return p;
      },
      { replace: true },
    );
  };

  /** URL ?fieldCode= 进入时展开树、选中并滚动定位（保留 ?status=） */
  useEffect(() => {
    const code = searchParams.get("fieldCode")?.trim();
    if (!code || !fieldsQuery.isSuccess) return;
    const hit = fields.find((f) => f.fieldCode === code);
    const keepStatus = parseStatusFilter(searchParams.get("status"));
    if (!hit) {
      toast.error(`未找到字段 ${code}`);
      setSearchParams(
        () => {
          const p = new URLSearchParams();
          if (keepStatus && keepStatus !== "ALL") p.set("status", keepStatus);
          return p;
        },
        { replace: true },
      );
      return;
    }
    setKeyword("");
    if (keepStatus) setStatusFilter(keepStatus);
    else setStatusFilter("ALL");
    focusField(hit);
    setSearchParams(
      () => {
        const p = new URLSearchParams();
        if (keepStatus && keepStatus !== "ALL") p.set("status", keepStatus);
        return p;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 深链仅随 URL/列表就绪触发
  }, [fields, fieldsQuery.isSuccess, searchParams, setSearchParams]);

  /** 左栏滚入：只改 aside.scrollTop，避免 scrollIntoView 带动整页 */
  useEffect(() => {
    const code = pendingScrollCode.current;
    if (!code || selectedId == null) return;
    const t = window.setTimeout(() => {
      scheduleScrollAsideItem(asideRef.current, `[data-field-code="${CSS.escape(code)}"]`);
      setHighlightCode(code);
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => setHighlightCode(null), 2200);
      pendingScrollCode.current = null;
    }, 60);
    return () => window.clearTimeout(t);
  }, [selectedId, collapsedFolders, fields, statusFilter, keyword]);

  const q = keyword.trim().toLowerCase();
  const filtered = useMemo(() => {
    return fields.filter((f) => {
      const st = (f.status ?? "DRAFT").toUpperCase();
      if (statusFilter !== "ALL" && st !== statusFilter) return false;
      if (!q) return true;
      const d = domainOf(f.fieldCode);
      const dLabel = structureDomains.find((x) => x.code === d)?.name ?? "";
      const cl = f.codelistId != null ? codelistById.get(f.codelistId) : undefined;
      return (
        (f.nameCn || "").toLowerCase().includes(q) ||
        (f.nameEn || "").toLowerCase().includes(q) ||
        (f.fieldCode || "").toLowerCase().includes(q) ||
        d.toLowerCase().includes(q) ||
        dLabel.toLowerCase().includes(q) ||
        (cl?.name || "").toLowerCase().includes(q) ||
        (cl?.code || "").toLowerCase().includes(q)
      );
    });
  }, [fields, q, codelistById, statusFilter, structureDomains]);

  const grouped = useMemo(() => {
    const domainMap = new Map<string, Map<string, NhpField[]>>();
    const domainMeta = new Map<string, { sortOrder?: number }>();
    const subMeta = new Map<string, { sortOrder?: number }>();
    for (const d of structureDomains) {
      const code = (d.code || "").toUpperCase();
      if (!code) continue;
      domainMeta.set(code, { sortOrder: d.sortOrder });
      if (!domainMap.has(code)) domainMap.set(code, new Map());
      const subMap = domainMap.get(code)!;
      for (const s of d.submodules ?? []) {
        const sc = (s.code || "").toUpperCase();
        if (sc && !subMap.has(sc)) subMap.set(sc, []);
        if (sc) subMeta.set(sc, { sortOrder: s.sortOrder });
      }
    }
    for (const f of filtered) {
      const d = domainOf(f.fieldCode);
      const s = submoduleOf(f.fieldCode);
      if (!domainMap.has(d)) domainMap.set(d, new Map());
      const sub = domainMap.get(d)!;
      if (!sub.has(s)) sub.set(s, []);
      sub.get(s)!.push(f);
    }
    return Array.from(domainMap.entries())
      .map(([dom, subs]) => {
        const sortedSubs = new Map(
          Array.from(subs.entries())
            .map(([sub, list]) => [sub, [...list].sort((a, b) => compareCodedId(a.fieldCode, b.fieldCode))] as const)
            .sort((a, b) =>
              compareBySortOrder(
                { code: a[0], sortOrder: subMeta.get(a[0])?.sortOrder },
                { code: b[0], sortOrder: subMeta.get(b[0])?.sortOrder },
              ),
            ),
        );
        return [dom, sortedSubs] as [string, Map<string, NhpField[]>];
      })
      .sort((a, b) =>
        compareBySortOrder(
          { code: a[0], sortOrder: domainMeta.get(a[0])?.sortOrder },
          { code: b[0], sortOrder: domainMeta.get(b[0])?.sortOrder },
        ),
      );
  }, [filtered, structureDomains]);

  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId],
  );

  const linkedCodelistId = selected?.codelistId ?? null;
  const linkedItemsQuery = useQuery({
    queryKey: ["nhp", "codelist", "by-id", linkedCodelistId],
    queryFn: () => fetchNhpCodelistById(linkedCodelistId!),
    enabled: linkedCodelistId != null,
  });
  const linkedCodelist: NhpCodelist | undefined =
    linkedItemsQuery.data ??
    (linkedCodelistId != null ? codelistById.get(linkedCodelistId) : undefined);
  const enumMissingCodelist = !!selected && isEnumType(selected.dataType) && !linkedCodelist && !linkedItemsQuery.isLoading;

  const openCodelist = (code?: string | null, version?: number | null) => {
    const returnPath = buildNhpFieldPagePath(dictKey, {
      status: statusFilter,
      fieldCode: selected?.fieldCode,
    });
    navigate(
      buildNhpCodelistPath({
        code: code || undefined,
        version: version ?? linkedCodelist?.version,
        dictKey,
      }),
      { state: { returnTo: returnPath } },
    );
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["nhp", "fields"] });
    qc.invalidateQueries({ queryKey: ["nhp", "codelists"] });
    qc.invalidateQueries({ queryKey: ["nhp", "codelist", "published-options"] });
    qc.invalidateQueries({ queryKey: ["nhp", "field-structure", dictKey] });
  };

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<NhpField> }) => updateNhpField(id, patch),
    onSuccess: () => {
      toast.success("已保存字段");
      setEditOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const createMut = useMutation({
    mutationFn: (body: Partial<NhpField>) =>
      createNhpField({
        ...body,
        dictionaryId: dictionary?.id ?? body.dictionaryId,
      }),
    onSuccess: (f) => {
      toast.success("已新建字段");
      setCreateOpen(false);
      setCreatePrefillSub(null);
      setForm(emptyForm());
      invalidate();
      focusField(f);
    },
    onError: (e: Error) => toast.error(e.message || "新建失败"),
  });

  const addDomainMut = useMutation({
    mutationFn: () =>
      addNhpDictDomain(dictKey, {
        code: domainForm.code.trim(),
        name: domainForm.name.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("已创建套内数据域");
      setDomainOpen(false);
      setDomainForm({ code: "", name: "" });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "创建数据域失败"),
  });

  const cloneFromPigMut = useMutation({
    mutationFn: () => cloneNhpDictStructureFrom(dictKey, "pig"),
    onSuccess: (r) => {
      toast.success(`已从猪套克隆大纲（新增 ${r.addedNodes ?? 0} 个节点）；字段未复制`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "克隆失败"),
  });

  const addSubMut = useMutation({
    mutationFn: () =>
      addNhpDictSubmodule(dictKey, {
        domainCode: subForm.domainCode.trim(),
        code: subForm.code.trim(),
        name: subForm.name.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("已创建子模块");
      setSubOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "创建子模块失败"),
  });

  const deleteDomainMut = useMutation({
    mutationFn: ({ code, cascade }: { code: string; cascade: boolean }) =>
      deleteNhpDictDomain(dictKey, code, cascade),
    onSuccess: (r) => {
      const n = r.softDeletedFields ?? 0;
      toast.success(n > 0 ? `已删除数据域（并软删 ${n} 个字段）` : "已删除数据域");
      setSelectedId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除数据域失败", { duration: 6000 }),
  });

  const deleteSubMut = useMutation({
    mutationFn: ({ code, cascade }: { code: string; cascade: boolean }) =>
      deleteNhpDictSubmodule(dictKey, code, cascade),
    onSuccess: (r) => {
      const n = r.softDeletedFields ?? 0;
      toast.success(n > 0 ? `已删除子模块（并软删 ${n} 个字段）` : "已删除子模块");
      setSelectedId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除子模块失败", { duration: 6000 }),
  });

  const renameMut = useMutation({
    mutationFn: () => {
      const name = renameName.trim();
      if (renameKind === "domain") return renameNhpDictDomain(dictKey, renameCode, name);
      return renameNhpDictSubmodule(dictKey, renameCode, name);
    },
    onSuccess: (r) => {
      const n = r.sectionsUpdated ?? 0;
      toast.success(
        n > 0
          ? `已更新显示名，并同步 ${n} 个模板章节`
          : "已更新显示名（大纲已写入；若需刷新旧原子可点「同步大纲名称到原子」）",
      );
      setRenameOpen(false);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message || "更新名称失败"),
  });

  const syncAtomLabelsMut = useMutation({
    mutationFn: () => syncNhpDictAtomLabels(dictKey),
    onSuccess: (r) => {
      toast.success(
        `已同步大纲名称：触及 ${r.formsTouched ?? 0} 个模板、更新 ${r.sectionsUpdated ?? 0} 个章节`,
      );
      void qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message || "同步失败"),
  });

  const openCreateDomain = () => {
    setDomainForm({ code: suggestUnusedDomainCode(structureDomains), name: "" });
    setDomainOpen(true);
  };

  const openRenameDomain = (code: string) => {
    const cur = structureDomains.find((d) => d.code === code);
    const hint = dictKey === "pig" ? PIG_DOMAIN_HINTS.find((d) => d.code === code)?.label : undefined;
    const raw = (cur?.name || hint || "").trim();
    setRenameKind("domain");
    setRenameCode(code);
    setRenameName(isBlankOrSameAsCode(code, raw) ? "" : raw);
    setRenameOpen(true);
  };

  const openRenameSub = (code: string) => {
    let raw = "";
    for (const d of structureDomains) {
      const hit = (d.submodules ?? []).find((s) => s.code === code);
      if (hit) {
        raw = (hit.name || "").trim();
        break;
      }
    }
    setRenameKind("submodule");
    setRenameCode(code);
    setRenameName(isBlankOrSameAsCode(code, raw) ? "" : raw);
    setRenameOpen(true);
  };

  const openCreateSub = (domainCode?: string) => {
    const first = (domainCode || structureDomains[0]?.code || "").toUpperCase();
    setSubForm({ domainCode: first, code: first ? `${first}.01` : "", name: "" });
    setSubOpen(true);
  };

  const confirmDeleteDomain = async (dom: string, fieldCount: number) => {
    if (fieldCount > 0) {
      const ok = await appConfirm(
        `数据域「${dom}」下有 ${fieldCount} 个字段。\n` +
          `确认删除将软删这些字段（已冻结 FROZEN 字段会拒绝）。\n` +
          `像删文件夹一样：域及其子模块大纲一并移除。继续？`,
      );
      if (!ok) return;
      deleteDomainMut.mutate({ code: dom, cascade: true });
      return;
    }
    if (!await appConfirm(`确定删除空数据域「${dom}」？`)) return;
    deleteDomainMut.mutate({ code: dom, cascade: false });
  };

  const confirmDeleteSub = async (sub: string, fieldCount: number) => {
    if (fieldCount > 0) {
      const ok = await appConfirm(
        `子模块「${sub}」下有 ${fieldCount} 个字段。\n` +
          `确认删除将软删这些字段（已冻结 FROZEN 字段会拒绝）。继续？`,
      );
      if (!ok) return;
      deleteSubMut.mutate({ code: sub, cascade: true });
      return;
    }
    if (!await appConfirm(`确定删除空子模块「${sub}」？`)) return;
    deleteSubMut.mutate({ code: sub, cascade: false });
  };

  const openCreateField = (under?: string) => {
    const next = emptyForm();
    const key = (under || "").trim().toUpperCase();
    if (/^D+\d+\.\d+$/i.test(key)) {
      next.fieldCode = `${key}.`;
      setCreatePrefillSub(key);
    } else if (/^D+\d+$/i.test(key)) {
      next.fieldCode = `${key}.`;
      setCreatePrefillSub(null);
    } else {
      setCreatePrefillSub(null);
    }
    setForm(next);
    setCreateOpen(true);
  };

  const reviewMut = useMutation({
    mutationFn: (id: number) => submitNhpFieldReview(id),
    onSuccess: () => {
      toast.success("已提交校对");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });

  const approveMut = useMutation({
    mutationFn: (id: number) => approveNhpFieldReview(id),
    onSuccess: () => {
      toast.success("已通过并冻结");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "通过失败"),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) => rejectNhpFieldReview(id, comment),
    onSuccess: () => {
      toast.success("已驳回为草稿");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "驳回失败"),
  });

  const unfreezeMut = useMutation({
    mutationFn: (id: number) => unfreezeNhpField(id),
    onSuccess: () => {
      toast.success("已解冻为草稿，可直接编辑");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败", { duration: 8000 }),
  });

  const batchUnfreezeMut = useMutation({
    mutationFn: (ids: number[]) => batchUnfreezeNhpFields(ids),
    onSuccess: (d) => {
      const blocked = d.blocked?.length ? `；失败：${d.blocked.join("；")}` : "";
      toast.success(`已批量解冻 ${d.unfrozenCount} 个字段${blocked}`, { duration: 9000 });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "批量解冻失败", { duration: 9000 }),
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => deleteNhpField(id, force),
    onSuccess: () => {
      toast.success("已删除字段");
      setSelectedId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
  });

  const openEdit = () => {
    if (!selected) return;
    setForm({
      fieldCode: selected.fieldCode,
      nameEn: selected.nameEn,
      nameCn: selected.nameCn ?? "",
      dataType: selected.dataType,
      unit: selected.unit ?? "",
      required: selected.required ?? "NO",
      codelistId: selected.codelistId != null ? String(selected.codelistId) : "",
      description: selected.description ?? "",
    });
    setEditOpen(true);
  };

  const confirmDeleteField = async () => {
    if (!selected) return;
    const name = selected.nameCn || selected.nameEn || selected.fieldCode;
    try {
      const used = await fetchNhpFieldPublishedUsage(selected.id);
      if (used.length > 0) {
        const titles = used.map((t) => t.title || t.formKey).join("、");
        const ok = await appConfirm(
          `字段「${name}」已在已发布模板中使用：${titles}。\n删除后模板仍可能引用该编码，确认强制删除？`,
        );
        if (!ok) return;
        deleteMut.mutate({ id: selected.id, force: true });
        return;
      }
    } catch (e) {
      toast.error((e as Error).message || "检查模板引用失败");
      return;
    }
    if (!await appConfirm(`确定删除字段「${name}」？`)) return;
    deleteMut.mutate({ id: selected.id, force: false });
  };

  const fieldFolderActions = (_folderKey: string, depth: number): FolderAction[] => {
    if (depth === 0) return ["createItem", "createFolder", "rename", "delete"];
    return ["createItem", "rename", "delete"];
  };

  /** 中文显示名（不含编码）；无信息量时返回空，由树节点只显示一次 code */
  const domainZhName = (code: string) => {
    const raw =
      structureDomains.find((d) => d.code === code)?.name
      || (dictKey === "pig" ? PIG_DOMAIN_HINTS.find((d) => d.code === code)?.label : undefined)
      || "";
    return isBlankOrSameAsCode(code, raw) ? "" : raw.trim();
  };

  const submoduleZhName = (code: string) => {
    for (const d of structureDomains) {
      const hit = (d.submodules ?? []).find((s) => s.code === code);
      if (hit) {
        const raw = (hit.name || "").trim();
        return isBlankOrSameAsCode(code, raw) ? "" : raw;
      }
    }
    return "";
  };

  /** 树节点标题：中文文件夹名；表码 Dn 仅作侧栏 id，不拼进名称 */
  const folderDisplayName = (code: string, zh: string) => (zh ? zh : code);

  const folderIdChip = (code: string, zh: string) =>
    zh ? (
      <span className="aup-wb-chip muted" style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}>
        {code}
      </span>
    ) : null;

  const fieldFolderGroups = useMemo((): FolderTreeGroup<{ id: string; field: NhpField }>[] => {
    return grouped.map(([dom, subs]) => {
      const domZh = domainZhName(dom);
      const domainDirect = subs.get("未分子模块") ?? [];
      return {
        key: dom,
        label: folderDisplayName(dom, domZh),
        items: domainDirect.map((f) => ({ id: String(f.id), field: f })),
        adornment: folderIdChip(dom, domZh),
        emptyHint: "尚无子模块",
        emptyActionLabel: "新建子模块",
        emptyAction: "createFolder",
        children: Array.from(subs.entries())
          .filter(([sub]) => sub !== "未分子模块")
          .map(([sub, list]) => {
            const subZh = submoduleZhName(sub);
            return {
              key: `${dom}:${sub}`,
              label: folderDisplayName(sub, subZh),
              items: list.map((f) => ({ id: String(f.id), field: f })),
              adornment: folderIdChip(sub, subZh),
              headerStyle: { paddingLeft: 28, fontSize: 12, color: "var(--slate)", fontWeight: 600 },
              emptyHint: "尚无字段",
              emptyActionLabel: "新建字段",
            };
          }),
      };
    });
  }, [grouped, structureDomains, dictKey]);

  const handleFieldFolderCreateItem = (folderKey: string) => {
    if (!folderKey || folderKey === "未分类") {
      openCreateField();
      return;
    }
    const idx = folderKey.indexOf(":");
    if (idx >= 0) openCreateField(folderKey.slice(idx + 1));
    else openCreateField(folderKey);
  };

  const validateCreateField = (): string | null => {
    const code = form.fieldCode.trim();
    const nameEn = form.nameEn.trim();
    if (!code) return "字段编码不能为空";
    if (!nameEn) return "英文名不能为空";
    if (!FIELD_CODE_RE.test(code)) return "字段编码须为 Dn.mm.nnn（如 D1.01.001）";
    if (fields.some((f) => normalizeCode(f.fieldCode) === normalizeCode(code))) {
      return `字段编码「${code}」在本套已存在`;
    }
    if (!dictionary?.id) return "字典套尚未加载，请稍后重试";
    return null;
  };

  const validateCreateDomain = (): string | null => {
    const code = normalizeCode(domainForm.code);
    if (!code) return "域编码不能为空";
    if (!/^D\d+$/i.test(code)) return "域编码须为 Dn 形式（如 D1）";
    if (structureDomains.some((d) => normalizeCode(d.code || "") === code)) {
      return `数据域「${code}」已存在`;
    }
    return null;
  };

  const validateCreateSub = (): string | null => {
    const code = normalizeCode(subForm.code);
    const domainCode = normalizeCode(subForm.domainCode);
    if (!domainCode) return "请先选择所属域";
    if (!code) return "子模块编码不能为空";
    if (!/^D\d+\.\d+$/i.test(code)) return "子模块编码须为 Dn.mm（如 D1.01）";
    if (!code.startsWith(domainCode + ".")) return `子模块编码须以 ${domainCode}. 开头`;
    for (const d of structureDomains) {
      const hit = (d.submodules ?? []).find((s) => normalizeCode(s.code || "") === code);
      if (hit) return `子模块「${code}」已存在`;
    }
    return null;
  };

  const submitCreateField = () => {
    const err = validateCreateField();
    if (err) {
      toast.error(err);
      return;
    }
    createMut.mutate({
      fieldCode: form.fieldCode.trim(),
      nameEn: form.nameEn.trim(),
      nameCn: form.nameCn.trim() || form.nameEn.trim(),
      dataType: form.dataType,
      required: form.required,
      description: form.description || undefined,
      unit: form.unit || undefined,
      dictionaryId: dictionary!.id,
    });
  };

  const submitCreateDomain = () => {
    const err = validateCreateDomain();
    if (err) {
      toast.error(err);
      return;
    }
    addDomainMut.mutate();
  };

  const submitCreateSub = () => {
    const err = validateCreateSub();
    if (err) {
      toast.error(err);
      return;
    }
    addSubMut.mutate();
  };

  const handleFieldFolderRename = (folderKey: string) => {
    const idx = folderKey.indexOf(":");
    if (idx >= 0) openRenameSub(folderKey.slice(idx + 1));
    else openRenameDomain(folderKey);
  };

  const handleFieldFolderDelete = (folderKey: string) => {
    const idx = folderKey.indexOf(":");
    if (idx >= 0) {
      const sub = folderKey.slice(idx + 1);
      const list = grouped.find(([d]) => d === folderKey.slice(0, idx))?.[1].get(sub) ?? [];
      void confirmDeleteSub(sub, list.length);
      return;
    }
    const subs = grouped.find(([d]) => d === folderKey)?.[1];
    const count = subs ? Array.from(subs.values()).reduce((n, arr) => n + arr.length, 0) : 0;
    void confirmDeleteDomain(folderKey, count);
  };

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 88, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  const metaCell = (label: string, value: ReactNode, opts?: { mono?: boolean; wrap?: boolean }) => (
    <div className="aup-wb-meta-cell">
      <label>{label}</label>
      <div
        className={`val${opts?.mono ? " mono" : ""}${opts?.wrap ? " wrap" : ""}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value || "—"}
      </div>
    </div>
  );

  const st = statusMeta(selected?.status);

  const statusFilterToolbar = (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid var(--border, #e5e7eb)",
        borderRadius: 8,
        overflow: "hidden",
        background: "#fff",
        flexShrink: 0,
      }}
      title="按状态筛选；点「待校对」可专看校对队列"
    >
      {STATUS_FILTERS.map((s) => {
        const on = statusFilter === s.value;
        const pendingBadge = s.value === "PENDING_REVIEW" ? pendingReviewCount : null;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => applyStatusFilter(s.value)}
            style={{
              border: "none",
              borderRight: "1px solid var(--border, #e5e7eb)",
              padding: "6px 10px",
              fontSize: 12,
              cursor: "pointer",
              background: on
                ? s.value === "PENDING_REVIEW"
                  ? "#fdf3e3"
                  : "var(--primary, #002FA7)"
                : "#fff",
              color: on
                ? s.value === "PENDING_REVIEW"
                  ? "#d97706"
                  : "#fff"
                : "var(--slate, #334155)",
              fontWeight: on ? 600 : 400,
            }}
          >
            {s.label}
            {pendingBadge != null ? (
              <span style={{ marginLeft: 4, opacity: on ? 1 : 0.7 }}>({pendingBadge})</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    const rt = sanitizeNhpReturnTo(
      (location.state as { returnTo?: unknown } | null)?.returnTo,
      nhpPathOf(location),
    );
    if (rt) {
      navigate(rt, { replace: true });
      return;
    }
    navigate("/content-manager/nhp-field", { replace: true });
  };

  const toolbarExtra = (
    <>
      {statusFilterToolbar}
      {canPiReview && frozenFields.length > 0 && (
        <button
          type="button"
          className="btn ghost small"
          disabled={batchUnfreezeMut.isPending}
          title="将本套全部已冻结字段解冻为草稿；无已发布模板引用/无活跃填写取值者解冻，占用者跳过并说明"
          onClick={async () => {
            if (
              await appConfirm(
                `批量解冻本套 ${frozenFields.length} 个已冻结字段为草稿？\n仅当无已发布模板引用、无活跃填写取值时解冻（软删实例不计）；有占用者会跳过并说明。`,
              )
            ) {
              batchUnfreezeMut.mutate(frozenFields.map((f) => f.id));
            }
          }}
        >
          批量解冻 ({frozenFields.length})
        </button>
      )}
      <button
        type="button"
        className="btn ghost small"
        title="打开码表管理（返回时保留本页筛选与选中字段）"
        onClick={() => openCodelist(linkedCodelist?.code)}
      >
        码表
      </button>
      {dictKey !== "pig" && !hasDeclaredStructure && (
        <button
          type="button"
          className="btn ghost small"
          disabled={cloneFromPigMut.isPending}
          title="仅复制猪套域/子模块大纲，不复制字段；非默认行为"
          onClick={async () => {
            if (
              await appConfirm(
                "将从「猪套」克隆域/子模块大纲到本套（不复制字段）。空套默认应自建域；确认要克隆？",
              )
            ) {
              cloneFromPigMut.mutate();
            }
          }}
        >
          从猪套克隆大纲
        </button>
      )}
    </>
  );

  const countText = (
    <>
      共 {filtered.length} 字段 · {grouped.length} 域
      {statusFilter === "PENDING_REVIEW" ? " · 校对队列" : ""}
      {q ? ` · 筛选「${keyword.trim()}」` : ""}
    </>
  );

  const aside = (
    <>
      {fieldsQuery.isLoading && (
        <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载字段…</div>
      )}
      {!fieldsQuery.isLoading && !structureQuery.isLoading && grouped.length === 0 && (
        <div style={{ padding: 28, textAlign: "center" }}>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 8, lineHeight: 1.55 }}>
            空<strong>数据域套</strong>：像建文件夹一样，先建<strong>套内数据域</strong>（表码如 D1、D3…，非填表步骤），再分子模块，再挂字段。
            <br />
            （猪套的 D1–D10 是猪套表码目录，不是全平台必选骨架，也不是 D1→D10 流水线。）
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn primary small" onClick={openCreateDomain}>
              ＋ 新建套内数据域
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => openCreateField()}
              title="无结构时也可直接建字段（不推荐）"
            >
              跳过结构 · 直接建字段
            </button>
          </div>
        </div>
      )}
      {grouped.length > 0 && (
        <FolderTreeManager
          folders={fieldFolderGroups}
          selectedItemId={selectedId != null ? String(selectedId) : null}
          onSelectItem={(id) => {
            const hit = fields.find((f) => String(f.id) === id);
            if (hit) focusField(hit);
          }}
          canMaintain={canMaintainDict}
          collapsedFolders={collapsedFolders}
          onCollapsedFoldersChange={setCollapsedFolders}
          deleteFolderPending={deleteDomainMut.isPending || deleteSubMut.isPending}
          folderActions={fieldFolderActions}
          itemActions={() => []}
          labels={FIELD_FOLDER_LABELS}
          onCreateFolder={
            canMaintainDict
              ? (folderKey) => {
                  if (folderKey) openCreateSub(folderKey);
                  else openCreateDomain();
                }
              : undefined
          }
          onCreateSubFolder={canMaintainDict ? openCreateSub : undefined}
          onCreateItem={canMaintainDict ? handleFieldFolderCreateItem : undefined}
          onRenameFolder={canMaintainDict ? handleFieldFolderRename : undefined}
          onDeleteFolder={canMaintainDict ? handleFieldFolderDelete : undefined}
          itemDataAttr={(item) => ({ "data-field-code": item.field.fieldCode })}
          itemRowClassName={(item) => (highlightCode === item.field.fieldCode ? "aup-wb-row--flash" : undefined)}
          extraHeaderActions={
            <button
              type="button"
              className="btn ghost small"
              style={{ fontSize: 11 }}
              disabled={syncAtomLabelsMut.isPending || !hasDeclaredStructure}
              title="把大纲中文名写回本套原子/组合模板章节，修复填写页「编码重复」"
              onClick={() => syncAtomLabelsMut.mutate()}
            >
              同步大纲名称到原子
            </button>
          }
          headerHint="套根 · 域码是表码/id · 树按展示序（sortOrder）排列 · 「中文名 + 编码」"
          renderItem={(item) => {
            const f = item.field;
            const sm = statusMeta(f.status);
            return (
              <>
                <span className="lbl">{f.nameCn || f.nameEn}</span>
                <span className="key" title={f.nameEn}>
                  {f.nameEn}
                </span>
                <span className="aup-wb-chip" style={{ background: sm.bg, color: sm.color, fontSize: 10 }}>
                  {sm.text}
                </span>
              </>
            );
          }}
        />
      )}
    </>
  );

  const main = (
    <>
      {!selected && <div className="aup-wb-empty">从左侧选一个字段看详情</div>}

      {selected && (
        <div className="aup-wb-panel">
          <div className="aup-wb-panel-hd">
            <span className="title">{selected.nameCn || selected.nameEn}</span>
            <span className="aup-wb-chip">
              {(() => {
                const dc = domainOf(selected.fieldCode);
                const zh = domainZhName(dc);
                return zh || dc;
              })()}
            </span>
            {(() => {
              const dc = domainOf(selected.fieldCode);
              const zh = domainZhName(dc);
              return zh ? (
                <span className="aup-wb-chip muted" style={{ fontFamily: "ui-monospace, monospace" }}>
                  {dc}
                </span>
              ) : null;
            })()}
            <span className="aup-wb-chip" style={{ background: st.bg, color: st.color }}>
              {st.text}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>v{selected.version}</span>
            <div style={{ flex: 1 }} />
            <button className="btn small ghost" onClick={openEdit} disabled={selected.status === "FROZEN"}>
              ✎ 编辑
            </button>
            {canPiReview && selected.status === "FROZEN" && (
              <button
                className="btn small ghost"
                disabled={unfreezeMut.isPending}
                title="无发布模板引用且无活跃填写取值时可解冻；软删实例不计占用"
                onClick={async () => {
                  if (
                    await appConfirm(
                      "解冻该字段为草稿？仅当无已发布模板引用、无活跃填写取值时允许（软删实例不计）。确认？",
                    )
                  ) {
                    unfreezeMut.mutate(selected.id);
                  }
                }}
              >
                解冻
              </button>
            )}
            {canMaintainDict && selected.status === "DRAFT" && (
              <button
                className="btn small primary"
                disabled={reviewMut.isPending}
                onClick={async () => {
                  if (await appConfirm("提交校对后进入待校对。校对人可在本页右侧通过或驳回。确认？")) {
                    reviewMut.mutate(selected.id);
                  }
                }}
              >
                提交校对
              </button>
            )}
            {canPiReview && selected.status === "PENDING_REVIEW" && (
              <>
                <button
                  className="btn small primary"
                  disabled={approveMut.isPending || rejectMut.isPending}
                  onClick={async () => {
                    if (await appConfirm("通过并冻结该字段？冻结后才可从字典生成原子。")) {
                      approveMut.mutate(selected.id);
                    }
                  }}
                >
                  通过并冻结
                </button>
                <button
                  className="btn small ghost"
                  disabled={approveMut.isPending || rejectMut.isPending}
                  onClick={async () => {
                    const note = await appPrompt("驳回意见（必填）", "") || "";
                    if (!note.trim()) {
                      toast.error("驳回须填写意见");
                      return;
                    }
                    rejectMut.mutate({ id: selected.id, comment: note.trim() });
                  }}
                >
                  驳回
                </button>
              </>
            )}
            <button
              className="btn small danger"
              disabled={deleteMut.isPending || selected.status === "FROZEN"}
              onClick={() => void confirmDeleteField()}
            >
              删除
            </button>
          </div>

          {enumMissingCodelist && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fff7ed",
                border: "1px solid #fdba74",
                color: "#9a3412",
                fontSize: 13,
                lineHeight: 1.55,
              }}
            >
              枚举字段尚未挂接码表，填写页将没有下拉选项。请「✎ 编辑」选择码表，或前往{" "}
              <button
                type="button"
                onClick={() => openCodelist()}
                style={{ color: "#c2410c", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                码表管理
              </button>{" "}
              新建后再绑定。
            </div>
          )}

          <div className="aup-wb-meta-grid">
            {metaCell("字段编码", selected.fieldCode, { mono: true })}
            {metaCell("字段名（英）", selected.nameEn, { mono: true })}
            {metaCell("字段名（中）", selected.nameCn)}
            {metaCell("数据类型", typeLabel(selected.dataType))}
            {metaCell("单位 / 格式", selected.unit || "—")}
            {metaCell("必填", requiredLabel(selected.required))}
            {metaCell(
              "取值 / 码表",
              linkedCodelist ? (
                <button
                  type="button"
                  onClick={() => openCodelist(linkedCodelist.code)}
                  style={{ color: "var(--primary)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {linkedCodelist.name}（{linkedCodelist.code}）
                  {linkedCodelist.version != null ? ` · v${linkedCodelist.version}` : ""}
                </button>
              ) : isEnumType(selected.dataType) ? (
                <span style={{ color: "#c2410c", fontWeight: 600 }}>未挂码表</span>
              ) : (
                "—"
              ),
            )}
            {metaCell("采集时点", "—")}
            {metaCell("采集方", "—")}
            {metaCell("说明", selected.description || "—", { wrap: true })}
            {metaCell("PI 校对", piReviewLabel(selected.status))}
            {metaCell("校对意见", "—")}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            状态机：草稿 →「提交校对」→ 待校对 →「通过并冻结」。无发布模板/活跃填写占用时可「解冻」回草稿；仅已冻结字段可从字典生成原子。
            校对暂由 ADMIN 代行（正式 PI 身份标签未接入）。用上方「待校对」筛选在队列间跳转。
          </div>
        </div>
      )}

      {selected && linkedCodelist && (
        <div className="aup-wb-panel">
          <div className="aup-wb-panel-hd">
            <span className="title" style={{ fontSize: 13 }}>
              码表项 · {linkedCodelist.name}（{linkedCodelist.code}）· v{linkedCodelist.version}
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>变更走码表版本流程</span>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn small primary" onClick={() => openCodelist(linkedCodelist.code)}>
              维护码表 ▸
            </button>
          </div>
          {linkedItemsQuery.isLoading ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载码表项…</div>
          ) : (
            <div className="aup-wb-table-wrap">
              <table className="aup-wb-table" style={{ minWidth: 420 }}>
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>序</th>
                    <th style={{ width: 180 }}>内部值</th>
                    <th>展示文本</th>
                  </tr>
                </thead>
                <tbody>
                  {(linkedItemsQuery.data?.items ?? []).slice(0, 12).map((it, i) => (
                    <tr key={it.id}>
                      <td style={{ color: "var(--muted)" }}>{i + 1}</td>
                      <td>
                        <div className="mono" title={it.itemCode}>
                          {it.itemCode}
                        </div>
                      </td>
                      <td>
                        <div className="clip" title={it.itemLabel}>
                          {it.itemLabel}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(linkedItemsQuery.data?.items?.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: 28, textAlign: "center", color: "var(--muted)" }}>
                        该码表暂无项
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-toolbar">
          <button type="button" className="btn ghost small" onClick={handleBack} style={{ flexShrink: 0 }}>
            ← 返回字段字典
          </button>
          <input
            className="input"
            placeholder="搜索中文名 / 英文名 / 编码 / 域 / 码表…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword.trim() && (
            <button type="button" className="btn ghost small" onClick={() => setKeyword("")}>
              清除
            </button>
          )}
          {toolbarExtra}
          <span className="aup-wb-count">{countText}</span>
        </div>

        <div className="aup-wb-split aup-wb-split--wide-aside">
          <aside className="aup-wb-aside" ref={asideRef}>
            {aside}
          </aside>
          <div className="aup-wb-main">{main}</div>
        </div>
      </div>

      {/* 编辑弹层 */}
      {editOpen && selected && (
        <div className="aup-modal-mask" onClick={() => setEditOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3>编辑字段</h3>
            {row("字段编码", <input className="input" value={form.fieldCode} disabled />)}
            {row("英文名", <input className="input" value={form.nameEn} disabled />)}
            {row(
              "中文名",
              <input className="input" value={form.nameCn} onChange={(e) => setForm({ ...form, nameCn: e.target.value })} />,
            )}
            {row(
              "数据类型",
              <select className="select" value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value })}>
                {DATA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>,
            )}
            {row(
              "单位/格式",
              <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="如 μmol/L、DON-XXX" />,
            )}
            {row(
              "必填",
              <select className="select" value={form.required} onChange={(e) => setForm({ ...form, required: e.target.value })}>
                {REQUIRED_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>,
            )}
            {row(
              "码表",
              <select className="select" value={form.codelistId} onChange={(e) => setForm({ ...form, codelistId: e.target.value })}>
                <option value="">（无）</option>
                {/* 当前已绑定版本（可能非最新）保留可选，避免保存时被清空 */}
                {form.codelistId &&
                  !publishedCodelists.some((c) => String(c.id) === form.codelistId) &&
                  linkedCodelist &&
                  String(linkedCodelist.id) === form.codelistId && (
                    <option value={String(linkedCodelist.id)}>
                      {linkedCodelist.name?.trim()
                        ? `${linkedCodelist.name}（${linkedCodelist.code}）· v${linkedCodelist.version}（当前绑定）`
                        : `${linkedCodelist.code} · v${linkedCodelist.version}（当前绑定）`}
                    </option>
                  )}
                {[...publishedCodelists]
                  .sort((a, b) => (a.name || a.code).localeCompare(b.name || b.code, "zh-CN"))
                  .map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.name?.trim() ? `${c.name}（${c.code}）· v${c.version}` : `${c.code} · v${c.version}`}
                    </option>
                  ))}
              </select>,
            )}
            {isEnumType(form.dataType) && !form.codelistId && (
              <div style={{ margin: "0 0 12px 98px", fontSize: 12, color: "#c2410c" }}>
                枚举类型须挂接最新已发布码表版本（绑定版本 id）。
              </div>
            )}
            {publishedCodelists.length === 0 && (
              <div style={{ margin: "0 0 12px 98px", fontSize: 12, color: "var(--muted)" }}>
                暂无已发布码表。请先在码表页提交校对并冻结发布。
              </div>
            )}
            {row(
              "说明",
              <textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setEditOpen(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={updateMut.isPending}
                onClick={() =>
                  updateMut.mutate({
                    id: selected.id,
                    patch: {
                      nameCn: form.nameCn,
                      dataType: form.dataType,
                      unit: form.unit || undefined,
                      required: form.required,
                      description: form.description,
                      codelistId: form.codelistId ? Number(form.codelistId) : null,
                    },
                  })
                }
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新建弹层 */}
      {createOpen && (
        <div className="aup-modal-mask" onClick={() => setCreateOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <h3>新建字段</h3>
            {hasDeclaredStructure && (
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                编码须落在已建数据域·子模块下
                {createPrefillSub ? `（当前建议前缀 ${createPrefillSub}.）` : "（如 D1.01.001）"}。
              </p>
            )}
            {row(
              "字段编码",
              <input
                className="input"
                placeholder="如 D1.01.001"
                value={form.fieldCode}
                onChange={(e) => setForm({ ...form, fieldCode: e.target.value })}
              />,
            )}
            {row(
              "英文名",
              <input
                className="input"
                placeholder="snake_case，如 donor_id"
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              />,
            )}
            {row(
              "中文名",
              <input className="input" value={form.nameCn} onChange={(e) => setForm({ ...form, nameCn: e.target.value })} />,
            )}
            {row(
              "数据类型",
              <select className="select" value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value })}>
                {DATA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>,
            )}
            {row(
              "必填",
              <select className="select" value={form.required} onChange={(e) => setForm({ ...form, required: e.target.value })}>
                {REQUIRED_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>,
            )}
            {row(
              "说明",
              <textarea className="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setCreateOpen(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!form.fieldCode.trim() || !form.nameEn.trim() || createMut.isPending || !dictionary?.id}
                onClick={submitCreateField}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {domainOpen && (
        <div className="aup-modal-mask" onClick={() => setDomainOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3>新建套内数据域</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              像新建文件夹：本套可建多个同级域。编码是<strong>表码/id</strong>（猪套常用 D1…D10），
              <strong>不是</strong>填表第 N 步；展示顺序由系统按创建顺序写入 sortOrder，与编码数字无关。
              勿把猪套域码写成 DD1——那是另一域，不会带上 D1.* 字段。
            </p>
            {row(
              "域编码（表码）",
              <input
                className="input"
                value={domainForm.code}
                onChange={(e) => setDomainForm({ ...domainForm, code: e.target.value.toUpperCase() })}
                placeholder="如 D1（猪套常用表码）"
              />,
            )}
            {row(
              "显示名",
              <input
                className="input"
                value={domainForm.name}
                onChange={(e) => setDomainForm({ ...domainForm, name: e.target.value })}
                placeholder={dictKey === "pig" ? "如 供体猪域" : "如 猴基线域"}
              />,
            )}
            {dictKey === "pig" && (
              <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--muted)" }}>
                猪套常用表码参考：{PIG_DOMAIN_HINTS.slice(0, 5).map((d) => d.code).join("、")}…（可跳号，非流水线）
              </p>
            )}
            {structureDomains.length > 0 && (
              <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--muted)" }}>
                本套已有表码：{structureDomains.map((d) => d.code).join("、")}
                {" · "}
                预填未占用编码 {suggestUnusedDomainCode(structureDomains)}（可改，非下一序号）
              </p>
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setDomainOpen(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!domainForm.code.trim() || addDomainMut.isPending}
                onClick={submitCreateDomain}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {subOpen && (
        <div className="aup-modal-mask" onClick={() => setSubOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3>新建子模块</h3>
            {row(
              "所属域",
              <select
                className="select"
                value={subForm.domainCode}
                onChange={(e) => {
                  const domainCode = e.target.value;
                  setSubForm({
                    domainCode,
                    code: subForm.code.startsWith(domainCode + ".") ? subForm.code : `${domainCode}.01`,
                    name: subForm.name,
                  });
                }}
              >
                {(structureDomains.length
                  ? structureDomains
                  : []
                ).map((d) => (
                    <option key={d.code} value={d.code}>
                      {folderDisplayName(d.code, domainZhName(d.code))}
                    </option>
                  ))}
                {!structureDomains.length && (
                  <option value="" disabled>
                    请先新建套内数据域
                  </option>
                )}
              </select>,
            )}
            {row(
              "子模块编码",
              <input
                className="input"
                value={subForm.code}
                onChange={(e) => setSubForm({ ...subForm, code: e.target.value })}
                placeholder="如 D1.01"
              />,
            )}
            {row(
              "显示名",
              <input
                className="input"
                value={subForm.name}
                onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
                placeholder="如 个体档案"
              />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setSubOpen(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!subForm.code.trim() || !subForm.domainCode.trim() || addSubMut.isPending}
                onClick={submitCreateSub}
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && (
        <div className="aup-modal-mask" onClick={() => setRenameOpen(false)}>
          <div className="aup-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3>{renameKind === "domain" ? "编辑数据域名称" : "编辑子模块名称"}</h3>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
              编码不可改（<code>{renameCode}</code>）。显示名写入大纲，并默认同步到本套原子/组合模板章节，填写页左侧树即可显示「中文名 + 编码」。
            </p>
            {row(
              "显示名",
              <input
                className="input"
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder={renameKind === "domain" ? "如 供体猪域" : "如 个体档案"}
              />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setRenameOpen(false)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={
                  !renameName.trim() ||
                  renameName.trim().toUpperCase() === renameCode.toUpperCase() ||
                  renameMut.isPending
                }
                onClick={() => renameMut.mutate()}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
