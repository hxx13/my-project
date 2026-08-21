/**
 * NHP CRF 模板管理：组合模板（上一层）与原子模板（套内数据域）分栏。
 * 工作台布局对齐码表/字段页：左列表 + 右版本/结构预览。
 * 按「数据域套」(dictKey) 隔离：猪套 D1–D10 不是全局；其它套有各自套内数据域。
 * - 原子：可独立发布为可填表单；也可被组合钉住（钉住版本锁定）
 * - 组合：可选——按套内数据域选原子版本 → 快照 → 发版
 * - 开填：已发布原子或组合均可；列表头若是草稿，仍可通过 publishedFormId 看到已发布版
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  composeNhpTemplate,
  createNhpAtom,
  createNhpTemplateDraft,
  cleanupNhpSeedComposites,
  deleteNhpTemplateAllVersions,
  deleteNhpTemplateVersion,
  ensureMissingAtomsFromDict,
  fetchNhpTemplateById,
  fetchNhpTemplateVersions,
  fetchNhpTemplates,
  generateFromDict,
  publishNhpTemplate,
  unfreezeNhpTemplate,
  versionOriginLabel,
  type NhpAtomReferencedBy,
  type NhpTemplateListItem,
} from "../../api/nhpTemplate.api";
import {
  fetchNhpDictStructure,
  fetchNhpFieldDictionaries,
  formatPigReimportToast,
  reimportPigDictionary,
} from "../../api/nhpFieldDictionary.api";
import NhpCompositeComposer, { type StagePick } from "../../components/NhpCompositeComposer";
import NhpTemplateStructurePreview from "../../components/NhpTemplateStructurePreview";
import { statusLabel } from "../../store/editorUtils";
import { compareBySortOrder, compareCodedId } from "../../utils/domainSort";
import { nhpNavState } from "../../utils/nhpAdminNav";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { appConfirm } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "../../nhp.css";

type Tab = "COMPOSITE" | "ATOM";

function isPublished(s: string): boolean {
  const u = (s || "").toUpperCase();
  return u === "PUBLISHED" || u === "FROZEN";
}

function kindBadge(tab: Tab): string {
  return tab === "COMPOSITE" ? "组合模板" : "套内数据域原子";
}

/** 猪套 / 猴套 / 其它 dictKey 的短徽标 */
function suiteBadgeLabel(dictKey?: string | null): string {
  const k = (dictKey || "").trim() || "pig";
  if (k === "pig") return "猪字典";
  if (k === "monkey") return "猴字典";
  if (k === "mixed") return "跨套";
  return k;
}

function suiteBadgeClass(dictKey?: string | null): string {
  const k = (dictKey || "").trim() || "pig";
  if (k === "monkey") return "nhp-suite-chip nhp-suite-chip--monkey";
  if (k === "mixed") return "nhp-suite-chip nhp-suite-chip--mixed";
  if (k === "pig") return "nhp-suite-chip nhp-suite-chip--pig";
  return "nhp-suite-chip";
}

/** 猪套裸键（D1）只显示 formKey；其它套显示 dictKey · domainCode */
function atomListMetaKey(t: NhpTemplateListItem): string {
  const dk = (t.dictKey || "").trim() || "pig";
  const dc = (t.domainCode || "").trim();
  const barePig = dk === "pig" && !t.formKey.includes("__");
  if (barePig) return t.formKey;
  if (dc) return `${dk} · ${dc}`;
  return t.formKey;
}

function suiteDisplayName(
  dicts: { dictKey: string; name?: string }[] | undefined,
  dictKey: string,
): string {
  if (!dictKey) return "全部套";
  const hit = (dicts ?? []).find((d) => d.dictKey === dictKey);
  return (hit?.name || "").trim() || dictKey;
}

function formatPinRefs(refs: NhpAtomReferencedBy[] | undefined): string {
  if (!refs?.length) return "";
  return refs
    .map((r) => {
      const ol = versionOriginLabel(r.origin);
      return `${r.formKey}@v${r.version ?? "?"}${ol ? `（${ol}）` : ""}`;
    })
    .join("、");
}

function editPath(formKey: string): string {
  return `/content-manager/nhp-template/edit/${encodeURIComponent(formKey)}`;
}

export default function NhpTemplateListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useGoBack("/content-manager/nhp-field");
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("COMPOSITE");
  const [suiteFilter, setSuiteFilter] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [previewFormId, setPreviewFormId] = useState<number | null>(null);
  const [newKey, setNewKey] = useState("nhp-crf");
  const [newTitle, setNewTitle] = useState("猪套 · 组合模板");
  const [composeOpen, setComposeOpen] = useState(false);
  const [createAtomOpen, setCreateAtomOpen] = useState(false);
  const [atomKey, setAtomKey] = useState("");
  const [atomTitle, setAtomTitle] = useState("");
  const [genDictOpen, setGenDictOpen] = useState(false);
  const [genDomain, setGenDomain] = useState("");
  const [genDictKey, setGenDictKey] = useState("pig");

  const dictListQuery = useQuery({
    queryKey: ["nhp", "field-dictionaries"],
    queryFn: fetchNhpFieldDictionaries,
  });

  /** 操作（生成/组合）用的套：全部套时回落到猪 */
  const actionSuite = suiteFilter || "pig";

  const suiteName = useMemo(
    () => suiteDisplayName(dictListQuery.data, suiteFilter || actionSuite),
    [dictListQuery.data, suiteFilter, actionSuite],
  );

  const genSuiteName = useMemo(
    () => suiteDisplayName(dictListQuery.data, genDictKey),
    [dictListQuery.data, genDictKey],
  );

  // 字典列表加载后：空=全部套合法；若当前指定套已不存在则回落猪或第一套
  useEffect(() => {
    const rows = dictListQuery.data ?? [];
    if (!rows.length) return;
    if (!suiteFilter) return;
    if (!rows.some((d) => d.dictKey === suiteFilter)) {
      const next = rows.some((d) => d.dictKey === "pig") ? "pig" : rows[0].dictKey;
      setSuiteFilter(next);
    }
  }, [dictListQuery.data, suiteFilter]);

  useEffect(() => {
    setGenDictKey(actionSuite);
  }, [actionSuite]);

  useEffect(() => {
    setNewTitle(`${suiteDisplayName(dictListQuery.data, actionSuite)} · 组合模板`);
  }, [dictListQuery.data, actionSuite]);

  const listQuery = useQuery({
    queryKey: ["nhp", "templates", tab, suiteFilter || "ALL"],
    queryFn: () =>
      tab === "ATOM"
        ? fetchNhpTemplates("ATOM", suiteFilter ? { dictKey: suiteFilter } : undefined)
        : fetchNhpTemplates("COMPOSITE", suiteFilter ? { dictKey: suiteFilter } : undefined),
  });

  /** 系统种子组合（用于横幅提示；不受当前套过滤限制） */
  const seedCompositeQuery = useQuery({
    queryKey: ["nhp", "templates", "COMPOSITE", "seed-banner"],
    queryFn: () => fetchNhpTemplates("COMPOSITE"),
    staleTime: 30_000,
  });

  const seedPinBanner = useMemo(() => {
    const rows = seedCompositeQuery.data ?? [];
    const seeds = rows.filter((t) => (t.origin || "").toUpperCase() === "SEED");
    if (!seeds.length) return null;
    return seeds
      .map((t) => {
        const codes = (t.atoms ?? []).map((a) => a.atomCode).filter(Boolean);
        const sample = codes.slice(0, 8).join("、");
        const more = codes.length > 8 ? ` 等 ${codes.length} 个` : "";
        return `${t.formKey}@v${t.version ?? "?"}（${t.title || "系统种子"}）${sample ? `钉住 ${sample}${more}` : ""}`;
      })
      .join("；");
  }, [seedCompositeQuery.data]);

  const genStructureQuery = useQuery({
    queryKey: ["nhp", "field-structure", genDictKey],
    queryFn: () => fetchNhpDictStructure(genDictKey),
    enabled: genDictOpen && !!genDictKey,
  });

  const suiteDomains = useMemo(() => {
    const domains = genStructureQuery.data?.domains ?? [];
    return [...domains].sort(compareBySortOrder);
  }, [genStructureQuery.data]);

  useEffect(() => {
    if (!genDictOpen) return;
    if (!suiteDomains.length) {
      setGenDomain("");
      return;
    }
    if (!suiteDomains.some((d) => d.code === genDomain)) {
      setGenDomain(suiteDomains[0].code);
    }
  }, [genDictOpen, suiteDomains, genDomain]);

  const versionsQuery = useQuery({
    queryKey: ["nhp", "templates", "versions", selectedKey],
    queryFn: () => fetchNhpTemplateVersions(selectedKey!),
    enabled: !!selectedKey,
  });
  const previewQuery = useQuery({
    queryKey: ["nhp", "templates", "by-id", previewFormId],
    queryFn: () => fetchNhpTemplateById(previewFormId!),
    enabled: !!previewFormId,
  });

  const templates = useMemo(() => {
    let list = [...(listQuery.data ?? [])];
    // Client: composites never under ATOM; merge unfiltered seed list into COMPOSITE tab
    if (tab === "ATOM") {
      list = list.filter(
        (t) =>
          (t.kind || "").toUpperCase() !== "COMPOSITE" &&
          (t.formType || "").toUpperCase() !== "TEMPLATE" &&
          (t.formType || "").toUpperCase() !== "COMPOSITE",
      );
      list.sort((a, b) => compareCodedId(a.formKey, b.formKey));
    } else {
      const byKey = new Map(list.map((t) => [t.formKey, t]));
      for (const t of seedCompositeQuery.data ?? []) {
        if (!byKey.has(t.formKey)) byKey.set(t.formKey, t);
      }
      list = [...byKey.values()];
      list.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    }
    return list;
  }, [listQuery.data, tab, seedCompositeQuery.data]);

  const versions = useMemo(() => {
    const rows = [...(versionsQuery.data ?? [])];
    rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    return rows;
  }, [versionsQuery.data]);

  const selected = useMemo(() => {
    const hit = templates.find((t) => t.formKey === selectedKey) ?? null;
    if (hit) return hit;
    // 钉住跳转后若当前套过滤尚未刷出该组合，用版本列表头做占位，保证右侧可删/可预览
    if (selectedKey && versions[0]?.formKey === selectedKey) return versions[0];
    return null;
  }, [templates, selectedKey, versions]);

  const existingAtomKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const t of templates) {
      if (tab !== "ATOM") continue;
      keys.add(t.formKey.toUpperCase());
      const dc = (t.domainCode || "").trim().toUpperCase();
      if (dc) keys.add(dc);
    }
    return keys;
  }, [templates, tab]);

  /** 打开组合（钉住链接 / 种子横幅）：切「全部套」保证可见，并钉住目标版本 */
  const openCompositeInList = (formKey: string, formId?: number) => {
    setTab("COMPOSITE");
    setSuiteFilter("");
    setSelectedKey(formKey);
    if (formId != null) setPreviewFormId(formId);
  };

  // 切 Tab / 套 / 列表变化：默认选中第一条，并预览其最新版
  useEffect(() => {
    if (!templates.length) {
      // 保留钉住/横幅跳转的 selectedKey，避免切套瞬间清空导致「打开了却看不到」
      if (selectedKey && tab === "COMPOSITE") return;
      setSelectedKey(null);
      setPreviewFormId(null);
      return;
    }
    const still = selectedKey && templates.some((t) => t.formKey === selectedKey);
    const nextKey = still ? selectedKey! : templates[0].formKey;
    if (nextKey !== selectedKey) setSelectedKey(nextKey);
  }, [templates, selectedKey, tab, suiteFilter]);

  useEffect(() => {
    if (!selectedKey) {
      setPreviewFormId(null);
      return;
    }
    if (versionsQuery.isLoading) return;
    if (versions.length) {
      const head = versions[0];
      setPreviewFormId((prev) => {
        if (prev && versions.some((v) => v.formId === prev)) return prev;
        return head.formId;
      });
    } else if (selected?.formId) {
      setPreviewFormId(selected.formId);
    }
  }, [selectedKey, versions, versionsQuery.isLoading, selected?.formId]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["nhp", "templates"] });
  };

  const composeMutation = useMutation({
    mutationFn: (picks: StagePick[]) => {
      const key = newKey.trim() || `nhp-${Date.now()}`;
      if (!picks.length) throw new Error("请至少勾选一个套内数据域原子");
      return composeNhpTemplate({
        formKey: key,
        title: newTitle.trim() || `${suiteName} · 组合模板`,
        atoms: picks.map((p) => ({ atomCode: p.atomCode, atomFormId: p.atomFormId })),
      });
    },
    onSuccess: (t) => {
      const originNote =
        t.origin === "AUTO_COMPOSE" || (t.version ?? 0) > 1
          ? `（v${t.version}：若此前已有发布版，可能是重组自动升版）`
          : "";
      toast.success(`已按套内数据域原子钉版本并快照${originNote}`);
      invalidate();
      setComposeOpen(false);
      setTab("COMPOSITE");
      setSelectedKey(t.formKey);
      navigate(editPath(t.formKey), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "组合失败"),
  });

  const createAtomMutation = useMutation({
    mutationFn: () => {
      const key = atomKey.trim().toUpperCase();
      if (!key) throw new Error("请填写套内数据域编码（如 D1）");
      return createNhpAtom({
        formKey: key,
        title: atomTitle.trim() || `${suiteName} · ${key}`,
        dictKey: actionSuite,
      });
    },
    onSuccess: (t) => {
      toast.success(`已新建原子 ${t.formKey}`);
      setAtomKey("");
      setAtomTitle("");
      setCreateAtomOpen(false);
      invalidate();
      setTab("ATOM");
      setSelectedKey(t.formKey);
      navigate(editPath(t.formKey), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "新建原子失败"),
  });

  const generateAtomMutation = useMutation({
    mutationFn: (args: { domain: string; dictKey: string }) => {
      const code = args.domain.trim().toUpperCase();
      if (!code) throw new Error("请选择套内数据域");
      const domainMeta = suiteDomains.find((d) => d.code.toUpperCase() === code);
      const namePart = domainMeta?.name ? ` ${domainMeta.name}` : "";
      const title = `${genSuiteName} · ${code}${namePart}`;
      return generateFromDict(code, title, args.dictKey || undefined);
    },
    onSuccess: (t) => {
      toast.success(`已从字段字典生成 ${t.formKey} 原子结构`);
      setGenDictOpen(false);
      invalidate();
      setTab("ATOM");
      setSuiteFilter(genDictKey);
      setSelectedKey(t.formKey);
      navigate(editPath(t.formKey), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "生成失败"),
  });

  const generateAllCompositeMutation = useMutation({
    mutationFn: () => {
      const key = newKey.trim() || "nhp-crf";
      return generateFromDict(key, newTitle.trim() || `${suiteName} · 组合模板`, actionSuite);
    },
    onSuccess: (t) => {
      toast.success(
        `已用「${suiteName}」套内全部原子生成组合模板 v${t.version ?? "?"}` +
          (t.origin === "AUTO_COMPOSE" ? "（已发布版被重组时会自动升版，并非手建）" : ""),
      );
      invalidate();
      setTab("COMPOSITE");
      setSelectedKey(t.formKey);
      navigate(editPath(t.formKey), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "生成失败"),
  });

  const publishMutation = useMutation({
    mutationFn: (formKey: string) => publishNhpTemplate(formKey),
    onSuccess: () => {
      toast.success("已发布（冻结）");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  const unfreezeMutation = useMutation({
    mutationFn: (formKey: string) => unfreezeNhpTemplate(formKey),
    onSuccess: (t) => {
      toast.success(`已解冻「${t.formKey}」@v${t.version ?? ""} 为草稿`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败", { duration: 9000 }),
  });

  const draftMutation = useMutation({
    mutationFn: (formKey: string) => createNhpTemplateDraft(formKey),
    onSuccess: (t) => {
      toast.success(`已新建版本 v${t.version ?? ""}，请修改后保存`);
      invalidate();
      navigate(editPath(t.formKey), { state: nhpNavState(location) });
    },
    onError: (e: Error) => toast.error(e.message || "新建版本失败"),
  });

  const deleteVersionMutation = useMutation({
    mutationFn: (formId: number) => deleteNhpTemplateVersion(formId),
    onSuccess: (d) => {
      toast.success(`已删除 v${d.version ?? ""}`);
      setPreviewFormId(null);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["nhp", "templates", "versions"] });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const deleteAllMutation = useMutation({
    mutationFn: (formKey: string) => deleteNhpTemplateAllVersions(formKey),
    onSuccess: (d, formKey) => {
      const blocked = d.blocked?.length ? `；未删：${d.blocked.join("；")}` : "";
      toast.success(`「${formKey}」已删 ${d.deletedCount} 个版本${blocked}`);
      setSelectedKey(null);
      setPreviewFormId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const cleanupSeedMutation = useMutation({
    mutationFn: () => cleanupNhpSeedComposites(),
    onSuccess: (d) => {
      toast.success(d.message || `已软删 ${d.deletedCount} 个无实例种子/自动组合`);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["nhp", "templates", "COMPOSITE", "seed-banner"] });
    },
    onError: (e: Error) => toast.error(e.message || "清理失败"),
  });

  const reimportPigMutation = useMutation({
    mutationFn: () => reimportPigDictionary(),
    onSuccess: (d) => {
      toast.success(formatPigReimportToast(d));
      void qc.invalidateQueries({ queryKey: ["nhp", "field-dictionaries"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "field-structure"] });
      void qc.invalidateQueries({ queryKey: ["nhp", "fields"] });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "重导入失败"),
  });

  const ensureMissingAtomsMutation = useMutation({
    mutationFn: () => ensureMissingAtomsFromDict(actionSuite || "pig", true),
    onSuccess: (d) => {
      const missing = d.missingAtomDomains ?? [];
      const regenerated = d.atomsRegenerated ?? [];
      const failed = d.atomsFailed ?? [];
      if (missing.length === 0 && regenerated.length === 0) {
        toast.success("【原子缺失检测】当前套有冻结字段的域均已有活跃原子");
      } else {
        toast.success(
          `【原子缺失检测】缺失域 ${missing.length ? missing.join("、") : "无"}` +
            (regenerated.length ? `；已补生成 ${regenerated.join("、")}` : "") +
            (failed.length
              ? `；失败 ${failed.map((f) => `${f.domain || "?"}:${f.message || "未知"}`).join("；")}`
              : ""),
        );
      }
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "原子缺失检测失败"),
  });

  const selectRow = (t: NhpTemplateListItem) => {
    setSelectedKey(t.formKey);
    setPreviewFormId(t.formId);
  };

  const previewOrigin = previewQuery.data?.origin ?? versions.find((v) => v.formId === previewFormId)?.origin;
  const previewVersion = previewQuery.data?.version ?? versions.find((v) => v.formId === previewFormId)?.version;

  const dictOptions = dictListQuery.data ?? [];

  return (
    <div className="aup-app aup-app--workbench nhp-template-admin">
      <div className="aup-wb">
        <div className="aup-wb-hd">
          <div>
            <button type="button" className="btn ghost small" onClick={goBack} style={{ marginBottom: 8 }}>
              ← 返回
            </button>
            <h1>原子 / 组合模板</h1>
            <div className="sub">
              <b>字段字典</b>是父源；本页为呈现层。
              先选<strong> 数据域套</strong>（如猪 / 猴），再管理该套的<strong> 套内数据域</strong>原子。
              猪套 D1–D10 仅属猪套（表码≠填写顺序）。
              <b> 原子可单独发布</b>为独立可填表单；
              <b> 组合</b>为可选能力（钉住多原子快照后再发版）。
              列表头可能是更新后的草稿——若有「已发布 vN」徽标仍可开填。
              {" · "}
              <Link to="/content-manager/nhp-hub" state={nhpNavState(location)} style={{ color: "var(--primary)" }}>
                采集流程
              </Link>
              {" · "}
              <Link to="/content-manager/nhp-field" state={nhpNavState(location)} style={{ color: "var(--primary)" }}>
                字段字典（父）
              </Link>
              {" · "}
              <Link to="/content-manager/nhp-codelist" state={nhpNavState(location)} style={{ color: "var(--primary)" }}>
                码表
              </Link>
            </div>
          </div>
          <div className="aup-wb-actions">
            {tab === "COMPOSITE" && (
              <>
                <button type="button" className="btn primary small" onClick={() => setComposeOpen(true)}>
                  ＋ 从原子组合
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={generateAllCompositeMutation.isPending}
                  title="高级：非整包必填流水线。默认请用「从原子组合」按需勾选。"
                  onClick={async () => {
                    if (
                      await appConfirm(
                        `【高级·非整包流水线】将钉住数据域套「${suiteDisplayName(dictListQuery.data, actionSuite)}」（${actionSuite}）下全部套内数据域原子最新版并写入组合。\n\n这不等于要求填写时走完所有域；开填后仍可只填部分原子对应章节。若该 formKey 已有发布版，会自动升一版草稿。继续？`,
                      )
                    ) {
                      generateAllCompositeMutation.mutate();
                    }
                  }}
                >
                  一键组合本套全部原子（高级）
                </button>
              </>
            )}
            {tab === "ATOM" && (
              <>
                <button type="button" className="btn primary small" onClick={() => setGenDictOpen(true)}>
                  从字典生成
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => {
                    setCreateAtomOpen((v) => !v);
                    setGenDictOpen(false);
                  }}
                >
                  ＋ 空白原子
                </button>
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="btn ghost small">
                  更多 ▾
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={cleanupSeedMutation.isPending}
                  onClick={async () => {
                    if (
                      await appConfirm(
                        "将软删所有「系统种子 / 重组升版」且无填写实例的组合模板版本，从而解除对原子的钉住。有填写实例的会跳过。继续？",
                      )
                    ) {
                      cleanupSeedMutation.mutate();
                    }
                  }}
                >
                  {cleanupSeedMutation.isPending ? "清理中…" : "强制清理无实例种子组合"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={reimportPigMutation.isPending}
                  onClick={async () => {
                    if (
                      await appConfirm(
                        "【字段重导入】将内置猪字段同步进猪字典并冻结字段（便于从字典生成原子；已有字段会计入更新/冻结，不是失败）。" +
                          "不会批量冻结码表——码表种子基线本就是已发布(FROZEN)，改项请「新建版本」。" +
                          "并按字段重建 D1–D10 大纲，清理误种 DD* 空原子，【原子缺失检测】补生成缺失域原子。不改猴套。继续？",
                      )
                    ) {
                      reimportPigMutation.mutate();
                    }
                  }}
                >
                  {reimportPigMutation.isPending ? "重导入中…" : "重导入内置猪字典"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={ensureMissingAtomsMutation.isPending}
                  onClick={async () => {
                    if (
                      await appConfirm(
                        `【原子缺失检测】检查数据域套「${actionSuite}」中有冻结字段却无活跃原子的域，并一键从字典补生成（可复活软删原子，如 D1）。继续？`,
                      )
                    ) {
                      ensureMissingAtomsMutation.mutate();
                    }
                  }}
                >
                  {ensureMissingAtomsMutation.isPending ? "检测中…" : "检测并补生成缺失原子"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="aup-wb-toolbar">
          <div className="nhp-template-tabs" role="tablist">
            {(
              [
                ["COMPOSITE", "组合模板"],
                ["ATOM", "套内数据域原子"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={`nhp-template-tab${tab === k ? " on" : ""}`}
                onClick={() => {
                  setTab(k);
                  setComposeOpen(false);
                  setCreateAtomOpen(false);
                  setGenDictOpen(false);
                  setSelectedKey(null);
                  setPreviewFormId(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            数据域套
            <select
              className="input"
              style={{ width: 180 }}
              value={suiteFilter}
              onChange={(e) => {
                setSuiteFilter(e.target.value);
                setSelectedKey(null);
                setPreviewFormId(null);
              }}
            >
              <option value="">全部套</option>
              {dictOptions.map((d) => (
                <option key={d.dictKey} value={d.dictKey}>
                  {d.name}（{d.dictKey}
                  {d.species ? ` · ${d.species}` : ""}）
                </option>
              ))}
              {dictOptions.length === 0 && <option value="pig">猪字典 pig</option>}
            </select>
          </label>
          <span className="aup-wb-count">
            {suiteFilter ? `套 ${suiteFilter}` : "全部套"} · 共 {templates.length} 个
          </span>
        </div>

        {seedPinBanner && (
          <div
            className="nhp-toolbar-panel"
            style={{
              margin: "0 16px 8px",
              padding: "10px 14px",
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.45,
              color: "#9a3412",
            }}
          >
            <b>系统种子组合钉住原子</b>
            （启动时若库中尚无该 formKey 才会生成；软删后不会复活）：{seedPinBanner}。
            删原子前请先切到「组合模板」
            {suiteFilter ? "（可先选「全部套」）" : ""}
            软删对应组合，或用右上角「更多 → 强制清理无实例种子组合」。
            {seedCompositeQuery.data?.some((t) => (t.origin || "").toUpperCase() === "SEED") && (
              <button
                type="button"
                className="btn small ghost"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  const first =
                    (seedCompositeQuery.data ?? []).find((t) => (t.origin || "").toUpperCase() === "SEED")
                    ?? null;
                  if (first?.formKey) openCompositeInList(first.formKey, first.formId);
                  else {
                    setTab("COMPOSITE");
                    setSuiteFilter("");
                  }
                }}
              >
                打开种子组合
              </button>
            )}
          </div>
        )}

        {tab === "ATOM" && genDictOpen && (
          <div className="nhp-toolbar-panel">
            <div className="nhp-toolbar-panel-title">从字典生成套内数据域原子</div>
            <p className="nhp-toolbar-panel-desc">
              用<strong>当前数据域套里已冻结字段</strong>生成/刷新该域的<strong>原子模板（呈现层）</strong>——与字段字典是同一数据源，不是另一套。
              猪套域码应为 <strong>D1–D10</strong>（单 D）；若列表里出现 DD2 等「系统种子」，那是历史误种，请先「重导入内置猪字典」清理后再对本域生成。
              仅<strong>已冻结（FROZEN）</strong>字段会进入原子；草稿/待校对会被拒绝。
              空套无域可选——猪套 D1–D10 不可套用到其它套。若该域原子已被组合钉住锁定，请先「新建版本」。
            </p>
            <div className="nhp-toolbar-panel-row">
              <label>
                数据域套（父源）
                <select
                  className="input"
                  value={genDictKey}
                  onChange={(e) => {
                    setGenDictKey(e.target.value);
                    setGenDomain("");
                  }}
                >
                  {dictOptions.map((d) => (
                    <option key={d.dictKey} value={d.dictKey}>
                      {d.name}（{d.dictKey}
                      {d.species ? ` · ${d.species}` : ""}）
                    </option>
                  ))}
                  {dictOptions.length === 0 && <option value="pig">猪字典 pig</option>}
                </select>
              </label>
              <label>
                套内数据域
                <select
                  className="input"
                  value={genDomain}
                  onChange={(e) => setGenDomain(e.target.value)}
                  disabled={genStructureQuery.isLoading || suiteDomains.length === 0}
                >
                  {genStructureQuery.isLoading && <option value="">加载域…</option>}
                  {!genStructureQuery.isLoading && suiteDomains.length === 0 && (
                    <option value="">本套暂无数据域</option>
                  )}
                  {suiteDomains.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} · {d.name || d.code}
                      {existingAtomKeys.has(d.code.toUpperCase()) ? "（已有原子）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={
                  generateAtomMutation.isPending || !genDictKey || !genDomain || suiteDomains.length === 0
                }
                onClick={async () => {
                  const tip = existingAtomKeys.has(genDomain.toUpperCase())
                    ? `将用数据域套「${genSuiteName}」（${genDictKey}）的套内域 ${genDomain} 字段写入原子可编辑版本。若已锁定请先「新建版本」。继续？`
                    : `从数据域套「${genSuiteName}」（${genDictKey}）生成套内域原子 ${genDomain}？`;
                  if (await appConfirm(tip)) {
                    generateAtomMutation.mutate({ domain: genDomain, dictKey: genDictKey });
                  }
                }}
              >
                {generateAtomMutation.isPending ? "生成中…" : "生成并打开编辑"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setGenDictOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        )}

        {tab === "ATOM" && createAtomOpen && (
          <div className="nhp-toolbar-panel">
            <div className="nhp-toolbar-panel-title">新建空白套内数据域原子</div>
            <p className="nhp-toolbar-panel-desc">
              归属当前数据域套「{suiteDisplayName(dictListQuery.data, actionSuite)}」（{actionSuite}）。填写套内域编码与标题，创建空壳后再手工加题，或稍后「从字典生成」。
              非猪套会落成 {actionSuite}__Dn 形式。
            </p>
            <div className="nhp-toolbar-panel-row">
              <label>
                套内数据域编码
                <input
                  className="input"
                  style={{ width: 120 }}
                  value={atomKey}
                  onChange={(e) => setAtomKey(e.target.value)}
                  placeholder="如 D1"
                />
              </label>
              <label>
                显示标题
                <input
                  className="input"
                  style={{ width: 220 }}
                  value={atomTitle}
                  onChange={(e) => setAtomTitle(e.target.value)}
                  placeholder={`${suiteName} · D1`}
                />
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={createAtomMutation.isPending}
                onClick={() => createAtomMutation.mutate()}
              >
                创建并打开
              </button>
              <button type="button" className="btn ghost" onClick={() => setCreateAtomOpen(false)}>
                关闭
              </button>
            </div>
          </div>
        )}

        {composeOpen && tab === "COMPOSITE" && (
          <NhpCompositeComposer
            formKey={newKey}
            title={newTitle}
            defaultDictKey={actionSuite}
            onFormKeyChange={setNewKey}
            onTitleChange={setNewTitle}
            confirming={composeMutation.isPending}
            onCancel={() => setComposeOpen(false)}
            onConfirm={(picks) => composeMutation.mutate(picks)}
          />
        )}

        <div className="aup-wb-split aup-wb-split--wide-aside nhp-template-split">
          <aside className="aup-wb-aside">
            {listQuery.isLoading && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载中…</div>
            )}
            {!listQuery.isLoading && templates.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                {tab === "COMPOSITE"
                  ? "暂无组合模板。优先「从原子组合」按需勾选；「一键组合本套全部原子」为高级、非整包必填流水线。"
                  : `数据域套「${suiteName}」暂无原子。用「从字典生成」或「空白原子」创建后可「发布为独立表单」。`}
              </div>
            )}
            {templates.map((t) => {
              const origin = versionOriginLabel(t.origin);
              const on = selectedKey === t.formKey;
              const metaKey = tab === "ATOM" ? atomListMetaKey(t) : t.formKey;
              const rowSuite = (t.dictKey || "").trim() || suiteFilter || "pig";
              return (
                <div
                  key={`${t.formKey}-${t.formId}`}
                  className={`aup-wb-row${on ? " on" : ""}`}
                  style={{ paddingLeft: 14 }}
                  onClick={() => selectRow(t)}
                  title={t.description || t.title}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lbl" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <span className={suiteBadgeClass(rowSuite)}>{suiteBadgeLabel(rowSuite)}</span>
                      <span className="nhp-kind-chip">{kindBadge(tab)}</span>
                      <span>{t.title || t.formKey}</span>
                    </div>
                    <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                      {metaKey} · v{t.version ?? "—"}
                      {origin ? ` · ${origin}` : ""}
                      {tab === "COMPOSITE" && (t.atoms?.length ?? t.atomCount)
                        ? ` · ${t.atoms?.length ?? t.atomCount} 原子`
                        : ""}
                      {t.hasPublished && !isPublished(t.status)
                        ? ` · 已发布 v${t.publishedVersion ?? "?"}`
                        : ""}
                    </div>
                  </div>
                  {tab === "COMPOSITE" ? (
                    <span className="aup-wb-chip muted">
                      {statusLabel(t.status)}
                      {t.hasPublished && !isPublished(t.status) ? "·有发布" : ""}
                    </span>
                  ) : t.locked ? (
                    <span className="aup-wb-chip muted">已锁定</span>
                  ) : isPublished(t.status) ? (
                    <span className="aup-wb-chip" style={{ background: "#e8f7ee", color: "#16a34a" }}>
                      已发布
                    </span>
                  ) : t.hasPublished ? (
                    <span className="aup-wb-chip muted">草稿·有发布</span>
                  ) : (
                    <span className="aup-wb-chip" style={{ background: "#eef2ff", color: "#002FA7" }}>
                      可编辑
                    </span>
                  )}
                </div>
              );
            })}
          </aside>

          <div className="aup-wb-main">
            {!selected && <div className="aup-wb-empty">选左侧模板查看版本与结构预览</div>}

            {selected && (
              <div className="aup-wb-panel nhp-template-detail">
                <div className="aup-wb-panel-hd">
                  <span className="title">{selected.title || selected.formKey}</span>
                  <span className="aup-wb-chip">{kindBadge(tab)}</span>
                  <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
                    {tab === "ATOM" ? atomListMetaKey(selected) : selected.formKey}
                  </span>
                  {previewVersion != null && (
                    <span className="aup-wb-chip muted">预览 v{previewVersion}</span>
                  )}
                  {versionOriginLabel(previewOrigin) && (
                    <span className="aup-wb-chip" style={{ background: "#fff7ed", color: "#c2410c" }}>
                      {versionOriginLabel(previewOrigin)}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => navigate(editPath(selected.formKey), { state: nhpNavState(location) })}
                  >
                    {tab === "ATOM" || selected.status === "DRAFT" ? "编辑 ▸" : "查看 ▸"}
                  </button>
                  {tab === "ATOM" && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={draftMutation.isPending}
                      onClick={async () => {
                        if (
                          await appConfirm(
                            "基于当前最新版克隆新版本（版号自动补位空缺；原子请通过版本演进，勿覆盖已钉住/已发布版本）。确认？",
                          )
                        ) {
                          draftMutation.mutate(selected.formKey);
                        }
                      }}
                    >
                      新建版本
                    </button>
                  )}
                  {tab === "ATOM" && selected.status === "DRAFT" && !selected.locked && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={publishMutation.isPending}
                      onClick={async () => {
                        if (await appConfirm("发布后该原子成为独立可填表单（冻结）。确认？")) {
                          publishMutation.mutate(selected.formKey);
                        }
                      }}
                    >
                      发布为独立表单
                    </button>
                  )}
                  {tab === "COMPOSITE" && selected.status === "DRAFT" && (
                    <button
                      type="button"
                      className="btn small primary"
                      disabled={publishMutation.isPending}
                      onClick={async () => {
                        if (await appConfirm("发布后冻结该组合版本。确认？")) {
                          publishMutation.mutate(selected.formKey);
                        }
                      }}
                    >
                      发布
                    </button>
                  )}
                  {(isPublished(selected.status) || selected.hasPublished) && (
                    <>
                      <button
                        type="button"
                        className="btn small primary"
                        onClick={() =>
                          navigate(`/nhp/fill?formKey=${encodeURIComponent(selected.formKey)}`)
                        }
                      >
                        去门户建实例
                      </button>
                      {isPublished(selected.status) && (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={unfreezeMutation.isPending}
                          title="无活跃填写实例（软删不计）；原子另须无组合钉住"
                          onClick={async () => {
                            if (
                              await appConfirm(
                                `解冻「${selected.formKey}」当前已发布版为草稿？仅当无活跃填写实例${
                                  tab === "ATOM" ? "且无组合钉住" : ""
                                }时允许。确认？`,
                              )
                            ) {
                              unfreezeMutation.mutate(selected.formKey);
                            }
                          }}
                        >
                          解冻
                        </button>
                      )}
                      {tab === "COMPOSITE" && isPublished(selected.status) && (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={draftMutation.isPending}
                          onClick={() => draftMutation.mutate(selected.formKey)}
                        >
                          新建草稿版本
                        </button>
                      )}
                    </>
                  )}
                </div>

                <p className="nhp-template-detail-hint">
                  {tab === "ATOM"
                    ? `下方版本仅属本套内数据域原子${suiteFilter ? `（套 ${suiteFilter}）` : ""}；预览只含该域章节。可「发布为独立表单」开填，或纳入组合。v1「系统种子」来自启动灌库；「从字典生成」会写入可编辑结构。域码是表码不是步骤。`
                    : "组合版本是多原子钉版本后的整表快照（可选能力）。列表头若是草稿但下方有已发布版，开填请用已发布版。系统种子组合仅在库中从未出现过该 formKey 时启动生成；软删后重启不会复活。"}
                </p>

                
                <div className="nhp-template-ver-row">
                  <span className="nhp-template-ver-label">本{tab === "ATOM" ? "原子" : "组合"}版本</span>
                  {versionsQuery.isLoading ? (
                    <span className="muted">加载版本…</span>
                  ) : versions.length === 0 ? (
                    <span className="nhp-ver-chip-wrap">
                      <button
                        type="button"
                        className={`nhp-ver-chip${previewFormId === selected.formId ? " active" : ""}`}
                        onClick={() => setPreviewFormId(selected.formId)}
                      >
                        v{selected.version ?? 1}
                        {versionOriginLabel(selected.origin) ? ` · ${versionOriginLabel(selected.origin)}` : ""}
                      </button>
                    </span>
                  ) : (
                    versions.map((v) => {
                      const ol = versionOriginLabel(v.origin);
                      return (
                        <span key={v.formId} className="nhp-ver-chip-wrap">
                          <button
                            type="button"
                            className={`nhp-ver-chip${previewFormId === v.formId ? " active" : ""}`}
                            onClick={() => setPreviewFormId(v.formId)}
                            title={v.description || statusLabel(v.status)}
                          >
                            v{v.version ?? "?"}
                            {ol ? ` · ${ol}` : ""}
                            {` · ${statusLabel(v.status)}`}
                            {tab === "ATOM" && v.locked ? " · 钉住" : ""}
                          </button>
                          <button
                            type="button"
                            className="nhp-ver-del"
                            title="删除此版本"
                            disabled={deleteVersionMutation.isPending}
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (
                                await appConfirm(
                                  `软删 v${v.version ?? "?"}？若有填写实例引用或原子被组合钉住将拒绝并提示原因。`,
                                )
                              ) {
                                deleteVersionMutation.mutate(v.formId);
                              }
                            }}
                          >
                            删
                          </button>
                        </span>
                      );
                    })
                  )}
                  <button
                    type="button"
                    className="btn small ghost"
                    style={{ marginLeft: 8 }}
                    disabled={deleteAllMutation.isPending || !selected.formKey}
                    onClick={async () => {
                      if (
                        await appConfirm(
                          `软删「${selected.formKey}」下全部活跃版本？被填写实例引用或被组合钉住的版本会跳过并说明原因。`,
                        )
                      ) {
                        deleteAllMutation.mutate(selected.formKey);
                      }
                    }}
                  >
                    {deleteAllMutation.isPending ? "删除中…" : "清理全部版本"}
                  </button>
                </div>

                {tab === "COMPOSITE" && (selected.atoms?.length ?? 0) > 0 && (
                  <div className="nhp-template-atoms-line">
                    钉住原子：
                    {(selected.atoms ?? []).map((a) => `${a.atomCode}@v${a.atomVersion ?? "?"}`).join(" · ")}
                  </div>
                )}

                {tab === "ATOM" &&
                  (() => {
                    const pinSrc =
                      (previewQuery.data?.referencedBy?.length
                        ? previewQuery.data.referencedBy
                        : null) ||
                      versions.find((v) => v.formId === previewFormId)?.referencedBy ||
                      selected.referencedBy;
                    if (!pinSrc?.length) return null;
                    return (
                      <div
                        className="nhp-template-atoms-line"
                        style={{ color: "#9a3412", background: "#fff7ed", padding: "8px 10px", borderRadius: 6 }}
                      >
                        当前版本被组合钉住：{formatPinRefs(pinSrc)}。
                        {pinSrc.map((r) => (
                          <button
                            key={`${r.formKey}-${r.compositeFormId}`}
                            type="button"
                            className="btn small ghost"
                            style={{ marginLeft: 6 }}
                            onClick={() => openCompositeInList(r.formKey, r.compositeFormId)}
                          >
                            打开 {r.formKey}@v{r.version ?? "?"}
                          </button>
                        ))}
                      </div>
                    );
                  })()}

                <div className="nhp-template-preview-box">
                  <div className="nhp-composer-preview-hd">结构预览（当前选中版本）</div>
                  <div className="nhp-composer-preview-body">
                    {!previewFormId ? (
                      <div className="aup-empty small">请选择版本</div>
                    ) : previewQuery.isLoading ? (
                      <div className="aup-empty small">加载预览…</div>
                    ) : previewQuery.isError ? (
                      <div className="aup-empty small">预览加载失败</div>
                    ) : (
                      <NhpTemplateStructurePreview
                        template={previewQuery.data}
                        emptyHint="该版本无结构"
                      />
                    )}
                  </div>
                </div>

                {selected.updatedAt && (
                  <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    更新 {formatDateTimeAsiaShanghaiShort(selected.updatedAt)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

