/**
 * NHP 码表管理页（整表版本 + 本页校对发布）。
 *
 * - 左列表按 code；右栏版本轨 + 项维护 + 引用链
 * - 校对流对齐字段页：提交校对 / 通过并冻结发布 / 驳回
 * - URL ?code=&version=&fromDict=&fieldCode= 保返回状态
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  addNhpCodelistItem,
  addNhpCodelistLink,
  approveNhpCodelistReview,
  createNhpCodelistDraft,
  deleteNhpCodelist,
  deleteNhpCodelistItem,
  deleteNhpCodelistVersion,
  fetchNhpCodelist,
  fetchNhpCodelists,
  fetchNhpCodelistUsage,
  fetchNhpCodelistVersions,
  rejectNhpCodelistReview,
  removeNhpCodelistLink,
  submitNhpCodelistReview,
  unfreezeNhpCodelist,
  unfreezeUnusedNhpCodelists,
  updateNhpCodelistItem,
  type NhpCodelist,
  type NhpCodelistItem,
  type NhpCodelistUsageVersion,
} from "../../api/nhpCodelist.api";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { buildNhpFieldPagePath, sanitizeNhpReturnTo } from "../../utils/nhpAdminNav";
import { compareCodedId } from "../../utils/domainSort";
import { scheduleScrollAsideItem } from "../../utils/scrollAsideItem";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "../../nhp.css";

function statusMeta(status?: string): { text: string; bg: string; color: string } {
  switch ((status ?? "").toUpperCase()) {
    case "FROZEN":
    case "PUBLISHED":
      return { text: "已发布", bg: "#e8f7ee", color: "#16a34a" };
    case "PENDING_REVIEW":
      return { text: "待校对", bg: "#fff7ed", color: "#c2410c" };
    case "DRAFT":
    case "ACTIVE":
      return { text: "草稿", bg: "#eef2ff", color: "#002FA7" };
    case "ARCHIVED":
      return { text: "已归档", bg: "#f1f5f9", color: "#64748b" };
    default:
      return { text: status || "—", bg: "#eef2f7", color: "#64748b" };
  }
}

function codelistDisplayLabel(code: string, name?: string | null, version?: number | null): string {
  const zh = (name ?? "").trim();
  const id = (code ?? "").trim();
  const ver = version != null ? ` · v${version}` : "";
  if (zh && id) return `${zh}（${id}${ver}）`;
  return `${zh || id || "—"}${ver}`;
}

function isEditableStatus(status?: string): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "DRAFT" || s === "ACTIVE";
}

function isPublishedStatus(status?: string): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "FROZEN" || s === "PUBLISHED";
}

interface ItemModal {
  mode: "add" | "edit";
  itemCode: string;
  itemLabel: string;
  itemId?: number;
}

export default function NhpCodelistPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const goBack = useGoBack("/content-manager/nhp-field");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<string | null>(() => searchParams.get("code"));
  const [selectedVersion, setSelectedVersion] = useState<number | null>(() => {
    const v = searchParams.get("version");
    return v ? Number(v) : null;
  });
  const [itemModal, setItemModal] = useState<ItemModal | null>(null);
  const [linkPicker, setLinkPicker] = useState<Record<number, string>>({});
  const asideRef = useRef<HTMLElement>(null);
  const pendingScrollCode = useRef<string | null>(searchParams.get("code"));

  /** URL dictKey：从字段页带入，便于无 returnTo 时回跳 */
  const fromDictKey = (searchParams.get("dictKey") || "").trim();

  const role = authStorage.getRole() || "";
  const canMaintain = hasMinRole(role, "ADMIN");
  const canPiReview = hasMinRole(role, "ADMIN"); // ADMIN-as-PI，对齐字段页

  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      setSelected(code);
      setKeyword("");
      pendingScrollCode.current = code;
    }
    const v = searchParams.get("version");
    if (v) setSelectedVersion(Number(v));
  }, [searchParams]);

  const syncUrl = (code: string | null, version?: number | null) => {
    const next: Record<string, string> = {};
    if (code) next.code = code;
    if (version != null && !Number.isNaN(version)) next.version = String(version);
    if (fromDictKey) next.dictKey = fromDictKey;
    setSearchParams(next, { replace: true });
  };

  const selectCodelist = (code: string) => {
    setSelected(code);
    setSelectedVersion(null);
    syncUrl(code, null);
    pendingScrollCode.current = code;
  };

  const selectVersion = (version: number) => {
    setSelectedVersion(version);
    if (selected) syncUrl(selected, version);
  };

  const listQuery = useQuery({
    queryKey: ["nhp", "codelists"],
    queryFn: fetchNhpCodelists,
  });
  const versionsQuery = useQuery({
    queryKey: ["nhp", "codelist", "versions", selected],
    queryFn: () => fetchNhpCodelistVersions(selected!),
    enabled: !!selected,
  });
  const versions = useMemo(() => {
    const rows = [...(versionsQuery.data ?? [])];
    rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    return rows;
  }, [versionsQuery.data]);

  /** 缺省看开版（草稿/待校对）或最新 */
  useEffect(() => {
    if (!selected || versionsQuery.isLoading) return;
    if (!versions.length) return;
    if (selectedVersion != null && versions.some((v) => v.version === selectedVersion)) return;
    const open = versions.find((v) => isEditableStatus(v.status) || (v.status ?? "").toUpperCase() === "PENDING_REVIEW");
    setSelectedVersion((open ?? versions[0]).version);
  }, [selected, versions, versionsQuery.isLoading, selectedVersion]);

  const detailQuery = useQuery({
    queryKey: ["nhp", "codelist", "detail", selected, selectedVersion],
    queryFn: () => fetchNhpCodelist(selected!, selectedVersion ?? undefined),
    enabled: !!selected && selectedVersion != null,
  });
  const usageQuery = useQuery({
    queryKey: ["nhp", "codelist", "usage", selected],
    queryFn: () => fetchNhpCodelistUsage(selected!),
    enabled: !!selected,
  });

  const codelists = listQuery.data ?? [];
  const linkableCodelists = useMemo(() => {
    return [...codelists].sort((a, b) => {
      const an = (a.name || a.code).trim();
      const bn = (b.name || b.code).trim();
      return an.localeCompare(bn, "zh-CN");
    });
  }, [codelists]);

  const q = keyword.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return codelists;
    return codelists.filter(
      (c) => c.code.toLowerCase().includes(q) || (c.name || "").toLowerCase().includes(q),
    );
  }, [codelists, q]);

  useEffect(() => {
    const code = pendingScrollCode.current;
    if (!code) return;
    const t = window.setTimeout(() => {
      scheduleScrollAsideItem(asideRef.current, `[data-codelist-code="${CSS.escape(code)}"]`);
      pendingScrollCode.current = null;
    }, 60);
    return () => window.clearTimeout(t);
  }, [selected, filtered, listQuery.isSuccess]);

  const detail = detailQuery.data;
  const editable = detail ? isEditableStatus(detail.status) : false;
  const items = useMemo(
    () => [...(detail?.items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [detail?.items],
  );

  const usageByVersion = useMemo(() => {
    const map = new Map<number, NhpCodelistUsageVersion>();
    for (const v of usageQuery.data?.versions ?? []) {
      map.set(v.version, v);
    }
    return map;
  }, [usageQuery.data]);

  const currentUsage = selectedVersion != null ? usageByVersion.get(selectedVersion) : undefined;
  const usageFields = useMemo(() => {
    const raw = currentUsage?.fields ?? [];
    return [...raw].sort((a, b) => compareCodedId(a.fieldCode, b.fieldCode));
  }, [currentUsage]);

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ["nhp", "codelists"] });
    if (selected) {
      void qc.invalidateQueries({ queryKey: ["nhp", "codelist", "detail", selected] });
      void qc.invalidateQueries({ queryKey: ["nhp", "codelist", "versions", selected] });
      void qc.invalidateQueries({ queryKey: ["nhp", "codelist", "usage", selected] });
    }
    void qc.invalidateQueries({ queryKey: ["nhp", "codelist", "published-options"] });
    void qc.invalidateQueries({ queryKey: ["nhp", "fields"] });
  };

  const addMut = useMutation({
    mutationFn: (body: { itemCode: string; itemLabel: string }) => addNhpCodelistItem(selected!, body),
    onSuccess: () => {
      toast.success("已新增项");
      setItemModal(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "新增失败"),
  });

  const updateMut = useMutation({
    mutationFn: ({ itemId, itemLabel }: { itemId: number; itemLabel: string }) =>
      updateNhpCodelistItem(selected!, itemId, { itemLabel }),
    onSuccess: () => {
      toast.success("已修改");
      setItemModal(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "修改失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (itemId: number) => deleteNhpCodelistItem(selected!, itemId),
    onSuccess: () => {
      toast.success("已删除");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 6000 }),
  });

  const deleteCodelistMut = useMutation({
    mutationFn: (code: string) => deleteNhpCodelist(code),
    onSuccess: (d) => {
      const blocked = d.blocked?.length ? `；未删：${d.blocked.join("；")}` : "";
      toast.success(d.message || `已删 ${d.deletedCount} 个版本${blocked}`);
      if ((d.blocked?.length ?? 0) === 0 || d.deletedCount >= (versions.length || 0)) {
        // 若全部删光则清空选中；否则刷新后保留 code、切到剩余最新版
        if (!d.blocked?.length) {
          setSelected(null);
          setSelectedVersion(null);
          setSearchParams({}, { replace: true });
        } else {
          setSelectedVersion(null);
        }
      } else {
        setSelectedVersion(null);
      }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 8000 }),
  });

  const deleteVersionMut = useMutation({
    mutationFn: (id: number) => deleteNhpCodelistVersion(id),
    onSuccess: (d) => {
      toast.success(`已删除 v${d.version ?? ""}`);
      setSelectedVersion(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "删除失败", { duration: 8000 }),
  });

  const linkMut = useMutation({
    mutationFn: ({ itemId, child }: { itemId: number; child: string }) =>
      addNhpCodelistLink(selected!, itemId, child),
    onSuccess: () => {
      toast.success("已加联动");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "联动失败"),
  });

  const unlinkMut = useMutation({
    mutationFn: ({ itemId, linkId }: { itemId: number; linkId: number }) =>
      removeNhpCodelistLink(selected!, itemId, linkId),
    onSuccess: () => invalidateAll(),
    onError: (e: Error) => toast.error(e.message || "移除失败"),
  });

  const submitMut = useMutation({
    mutationFn: () => submitNhpCodelistReview(selected!),
    onSuccess: (row) => {
      toast.success("已提交校对");
      if (row?.version != null) setSelectedVersion(row.version);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "提交失败"),
  });

  const approveMut = useMutation({
    mutationFn: () => approveNhpCodelistReview(selected!),
    onSuccess: (row) => {
      const retained = (row as NhpCodelist & { retainedVersions?: NhpCodelist[] }).retainedVersions ?? [];
      if (retained.length) {
        toast.success(`已冻结发布；保留 ${retained.length} 个仍被引用的历史版本`);
      } else {
        toast.success("已通过并冻结发布");
      }
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "发布失败"),
  });

  const rejectMut = useMutation({
    mutationFn: (comment: string) => rejectNhpCodelistReview(selected!, comment),
    onSuccess: () => {
      toast.success("已驳回为草稿");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "驳回失败"),
  });

  const draftMut = useMutation({
    mutationFn: () => createNhpCodelistDraft(selected!),
    onSuccess: (d) => {
      toast.success(`已新建草稿 v${d.version}`);
      setSelectedVersion(d.version);
      syncUrl(selected, d.version);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "新建版本失败"),
  });

  const unfreezeMut = useMutation({
    mutationFn: () => unfreezeNhpCodelist(selected!),
    onSuccess: (row) => {
      toast.success(`已解冻「${row.code}」@v${row.version} 为草稿`);
      if (row?.version != null) setSelectedVersion(row.version);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "解冻失败", { duration: 9000 }),
  });

  const unfreezeUnusedMut = useMutation({
    mutationFn: () => unfreezeUnusedNhpCodelists(),
    onSuccess: (d) => {
      toast.success(d.message || `已解冻 ${d.unfrozenCount} 个无引用码表`, { duration: 8000 });
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "批量解冻失败"),
  });

  const reorderLocal = async (index: number, dir: -1 | 1) => {
    if (!selected || !editable) return;
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const a = items[index];
    const b = items[j];
    try {
      await updateNhpCodelistItem(selected, a.id, { sortOrder: b.sortOrder });
      await updateNhpCodelistItem(selected, b.id, { sortOrder: a.sortOrder });
      invalidateAll();
    } catch (e) {
      toast.error((e as Error).message || "排序失败");
    }
  };

  const confirmDeleteItem = async (item: NhpCodelistItem) => {
    if (!editable) {
      toast.error("已冻结/待校对不可改项，请先新建版本或驳回");
      return;
    }
    if ((detail?.refCount ?? 0) > 0) {
      toast.error("无法删除码表项：当前版本仍被字段引用。请新建版本后再改。", { duration: 8000 });
      return;
    }
    if (!await appConfirm(`确定删除码表项「${item.itemLabel || item.itemCode}」？`)) return;
    deleteMut.mutate(item.id);
  };

  const confirmDeleteCodelist = async () => {
    if (!detail) return;
    if (
      !await appConfirm(
        `软删码表「${detail.name}」（${detail.code}）下全部活跃版本？被字段引用的版本会跳过并说明原因；未占用版号可被后续「新建版本」补位。`,
      )
    ) {
      return;
    }
    deleteCodelistMut.mutate(detail.code);
  };

  const confirmDeleteVersion = async (v: NhpCodelist) => {
    if (
      !await appConfirm(
        `软删 v${v.version}？若有字段引用将拒绝并列出引用字段；成功后版号可被补位复用。`,
      )
    ) {
      return;
    }
    deleteVersionMut.mutate(v.id);
  };

  const handleBack = () => {
    const rt = sanitizeNhpReturnTo((location.state as { returnTo?: unknown } | null)?.returnTo);
    if (rt) {
      navigate(rt);
      return;
    }
    if (fromDictKey) {
      const fc = (searchParams.get("fieldCode") || "").trim();
      navigate(buildNhpFieldPagePath(fromDictKey, { fieldCode: fc || null }));
      return;
    }
    goBack();
  };

  const row = (label: string, input: ReactNode) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <label style={{ fontSize: 13, color: "var(--muted)", width: 76, flexShrink: 0, paddingTop: 8 }}>{label}</label>
      <div style={{ flex: 1 }}>{input}</div>
    </div>
  );

  const st = statusMeta(detail?.status);

  return (
    <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={handleBack}>
              ← 返回{fromDictKey ? `字段（${fromDictKey}）` : ""}
            </button>
            <h1>NHP 码表</h1>
            <div className="sub">
              整表版本 · 本页校对发布。
              种子码表基线为<strong>已发布(FROZEN)</strong>（便于字段挂接），不是故障；
              改项请「新建版本」再校对，或对无引用码表用「解冻本版 / 批量解冻无引用」。
              「重导入猪字典」只冻结<strong>字段</strong>，不批量冻码表。{" · "}
              <Link to="/content-manager/nhp-template" style={{ color: "var(--primary)" }}>
                CRF 模板
              </Link>
            </div>
          </div>
          <div className="aup-wb-actions">
            {canMaintain && (
              <button
                className="btn ghost small"
                disabled={unfreezeUnusedMut.isPending}
                title="仅解冻未被活跃字段引用的冻结码表；种子/重导入批量冻结后可用"
                onClick={async () => {
                  if (
                    await appConfirm(
                      "批量解冻所有「无活跃字段引用」的已冻结码表？仍有引用的会跳过并说明。软删字段不计占用。继续？",
                    )
                  ) {
                    unfreezeUnusedMut.mutate();
                  }
                }}
              >
                {unfreezeUnusedMut.isPending ? "解冻中…" : "批量解冻无引用"}
              </button>
            )}
            {canMaintain && selected && isPublishedStatus(detail?.status) && (
              <button
                className="btn ghost small"
                disabled={unfreezeMut.isPending}
                title="无活跃字段占用本版时可解冻；否则请新建版本"
                onClick={async () => {
                  if (
                    await appConfirm(
                      `解冻码表「${detail?.name || selected}」当前版为草稿？仅当无活跃字段引用本版时允许。确认？`,
                    )
                  ) {
                    unfreezeMut.mutate();
                  }
                }}
              >
                解冻本版
              </button>
            )}
            {canMaintain && selected && isPublishedStatus(detail?.status) && (
              <button
                className="btn primary small"
                disabled={draftMut.isPending}
                onClick={async () => {
                  if (await appConfirm("基于最新已发布版克隆新草稿（版号自动补位空缺）。占用中的历史版本会保留。确认？")) {
                    draftMut.mutate();
                  }
                }}
              >
                ＋ 新建版本
              </button>
            )}
            <button
              className="btn primary small"
              disabled={!selected || !editable}
              onClick={() => setItemModal({ mode: "add", itemCode: "", itemLabel: "" })}
            >
              ＋ 新增项
            </button>
          </div>
        </div>

        <div className="aup-wb-toolbar">
          <input
            className="input"
            placeholder="搜索码表中文名 / 编码…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword && (
            <button className="btn ghost small" onClick={() => setKeyword("")}>
              清除
            </button>
          )}
          <span className="aup-wb-count">共 {filtered.length} 个码表</span>
        </div>

        <div className="aup-wb-split">
          <aside className="aup-wb-aside" ref={asideRef}>
            {listQuery.isLoading && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>加载码表…</div>
            )}
            {!listQuery.isLoading && filtered.length === 0 && (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                {keyword.trim() ? "无匹配码表" : "暂无码表"}
              </div>
            )}
            {filtered.map((c: NhpCodelist) => {
              const sm = statusMeta(c.status);
              const refN = c.refCount ?? 0;
              return (
                <div
                  key={c.code}
                  data-codelist-code={c.code}
                  className={`aup-wb-row${selected === c.code ? " on" : ""}`}
                  style={{ paddingLeft: 14 }}
                  onClick={() => selectCodelist(c.code)}
                  title={`${c.name}（${c.code}）· v${c.version} · 被 ${refN} 个字段引用`}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="lbl">{c.name}</div>
                    <div className="meta" style={{ marginTop: 2, fontFamily: "ui-monospace, monospace" }}>
                      {c.code} · v{c.version}
                      {(c.versionCount ?? 1) > 1 ? ` · ${c.versionCount} 版` : ""}
                    </div>
                  </div>
                  <span className="aup-wb-chip muted" title={`最新版被 ${refN} 个字段引用`}>
                    {refN}
                  </span>
                  <span className="aup-wb-chip" style={{ background: sm.bg, color: sm.color }}>
                    {sm.text}
                  </span>
                </div>
              );
            })}
          </aside>

          <div className="aup-wb-main">
            {!selected && <div className="aup-wb-empty">选左侧码表维护选项与版本</div>}

            {selected && detailQuery.isLoading && <div className="aup-wb-empty">加载详情…</div>}

            {selected && detail && (
              <div className="aup-wb-panel">
                <div className="aup-wb-panel-hd">
                  <span className="title">{detail.name}</span>
                  <span className="aup-wb-chip" style={{ fontFamily: "ui-monospace, monospace" }}>
                    {detail.code}
                  </span>
                  <span className="aup-wb-chip" style={{ background: st.bg, color: st.color }}>
                    {st.text}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>v{detail.version}</span>
                  {(detail.refCount ?? 0) > 0 && (
                    <span className="aup-wb-chip muted">{detail.refCount} 字段占用本版</span>
                  )}
                  <div style={{ flex: 1 }} />
                  {canMaintain && editable && (
                    <button
                      className="btn small primary"
                      disabled={submitMut.isPending}
                      onClick={async () => {
                        if (await appConfirm("提交校对后进入待校对。校对人可在本页通过或驳回。确认？")) {
                          submitMut.mutate();
                        }
                      }}
                    >
                      提交校对
                    </button>
                  )}
                  {canPiReview && (detail.status ?? "").toUpperCase() === "PENDING_REVIEW" && (
                    <>
                      <button
                        className="btn small primary"
                        disabled={approveMut.isPending}
                        onClick={async () => {
                          if (
                            await appConfirm(
                              "通过并冻结发布？若旧版仍被字段引用将保留占用版本，不会归档删除。",
                            )
                          ) {
                            approveMut.mutate();
                          }
                        }}
                      >
                        通过并冻结发布
                      </button>
                      <button
                        className="btn small danger"
                        disabled={rejectMut.isPending}
                        onClick={async () => {
                          const note = await appPrompt("驳回意见（必填）", "") || "";
                          if (!note.trim()) {
                            toast.error("驳回须填写意见");
                            return;
                          }
                          rejectMut.mutate(note.trim());
                        }}
                      >
                        驳回
                      </button>
                    </>
                  )}
                  {editable && (
                    <button
                      className="btn small primary"
                      onClick={() => setItemModal({ mode: "add", itemCode: "", itemLabel: "" })}
                    >
                      ＋ 新增项
                    </button>
                  )}
                  <button
                    className="btn small danger"
                    disabled={deleteCodelistMut.isPending || !canMaintain}
                    onClick={confirmDeleteCodelist}
                    title="软删本码表全部未占用版本；被字段引用的保留"
                  >
                    {deleteCodelistMut.isPending ? "删除中…" : "清理全部版本"}
                  </button>
                </div>

                {/* 版本轨 */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--bg)",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>版本</span>
                  {versionsQuery.isLoading && (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>加载…</span>
                  )}
                  {versions.map((v) => {
                    const sm = statusMeta(v.status);
                    const on = selectedVersion === v.version;
                    return (
                      <span key={v.id} className="nhp-ver-chip-wrap">
                        <button
                          type="button"
                          className={`nhp-ver-chip${on ? " active" : ""}`}
                          onClick={() => selectVersion(v.version)}
                          title={`id=${v.id} · 引用 ${v.refCount ?? 0}`}
                          style={{
                            borderColor: on ? "var(--primary)" : undefined,
                            background: on ? "var(--primary-weak)" : undefined,
                            fontWeight: on ? 700 : 500,
                          }}
                        >
                          v{v.version}
                          <span style={{ marginLeft: 6, color: sm.color, fontSize: 11 }}>{sm.text}</span>
                          {(v.refCount ?? 0) > 0 && (
                            <span style={{ marginLeft: 4, fontSize: 11, color: "var(--muted)" }}>
                              ·{v.refCount}
                            </span>
                          )}
                        </button>
                        {canMaintain && (
                          <button
                            type="button"
                            className="nhp-ver-del"
                            title="删除此版本"
                            disabled={deleteVersionMut.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmDeleteVersion(v);
                            }}
                          >
                            删
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>

                {!editable && (
                  <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--muted)" }}>
                    {(detail.status ?? "").toUpperCase() === "PENDING_REVIEW"
                      ? "待校对中不可改项；请通过并冻结，或驳回为草稿。"
                      : "已发布版本不可直接改项。无字段占用时可「解冻本版」；否则请「新建版本」后在草稿上修改，再提交校对。"}
                  </div>
                )}

                <div className="aup-wb-table-wrap">
                  <table className="aup-wb-table" style={{ minWidth: 780 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 48 }}>序</th>
                        <th style={{ width: 160 }}>内部值（唯一）</th>
                        <th style={{ width: 180 }}>展示文本</th>
                        <th>子字典联动</th>
                        <th style={{ width: 160 }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={item.id}>
                          <td style={{ color: "var(--muted)" }}>{i + 1}</td>
                          <td>
                            <div className="mono" title={item.itemCode}>
                              {item.itemCode}
                            </div>
                          </td>
                          <td>
                            <div className="clip" title={item.itemLabel}>
                              {item.itemLabel}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                              {item.childLinks.map((l) => {
                                const chipLabel = codelistDisplayLabel(
                                  l.childCodelistCode,
                                  l.childCodelistName,
                                  l.childCodelistVersion,
                                );
                                return (
                                  <span
                                    key={l.linkId}
                                    title={chipLabel}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      background: "var(--primary-weak)",
                                      color: "var(--primary)",
                                      borderRadius: 6,
                                      padding: "2px 8px",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {chipLabel}
                                    {editable && (
                                      <button
                                        type="button"
                                        title="移除联动"
                                        onClick={() => unlinkMut.mutate({ itemId: item.id, linkId: l.linkId })}
                                        style={{
                                          border: "none",
                                          background: "transparent",
                                          cursor: "pointer",
                                          color: "var(--danger)",
                                          padding: 0,
                                          lineHeight: 1,
                                          fontSize: 14,
                                        }}
                                      >
                                        ×
                                      </button>
                                    )}
                                  </span>
                                );
                              })}
                              {editable && (
                                <select
                                  className="select"
                                  style={{ width: "auto", minWidth: 160, padding: "4px 8px", fontSize: 12 }}
                                  value={linkPicker[item.id] ?? ""}
                                  onChange={(e) => {
                                    const child = e.target.value;
                                    setLinkPicker((v) => ({ ...v, [item.id]: child }));
                                    if (child) {
                                      linkMut.mutate({ itemId: item.id, child });
                                      setLinkPicker((v) => ({ ...v, [item.id]: "" }));
                                    }
                                  }}
                                >
                                  <option value="">＋ 联动…</option>
                                  {linkableCodelists
                                    .filter((c) => c.code !== detail.code)
                                    .map((c) => (
                                      <option key={c.code} value={c.code}>
                                        {codelistDisplayLabel(c.code, c.name, c.version)}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </div>
                          </td>
                          <td>
                            {editable ? (
                              <div className="acts">
                                <button className="btn small ghost" title="上移" onClick={() => reorderLocal(i, -1)}>
                                  ↑
                                </button>
                                <button className="btn small ghost" title="下移" onClick={() => reorderLocal(i, 1)}>
                                  ↓
                                </button>
                                <button
                                  className="btn small ghost"
                                  title="编辑"
                                  onClick={() =>
                                    setItemModal({
                                      mode: "edit",
                                      itemCode: item.itemCode,
                                      itemLabel: item.itemLabel,
                                      itemId: item.id,
                                    })
                                  }
                                >
                                  ✎
                                </button>
                                <button className="btn small danger" title="删除" onClick={() => confirmDeleteItem(item)}>
                                  ×
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                            暂无字典项
                            {editable ? "，点击「＋ 新增项」" : ""}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 引用链 */}
                <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                      本版引用链（字段 → 字典套 → 原子 → 组合）
                    </span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {usageQuery.isLoading ? "…" : `${usageFields.length} 个字段`}
                    </span>
                  </div>
                  {usageQuery.isLoading && (
                    <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>加载引用链…</div>
                  )}
                  {!usageQuery.isLoading && usageFields.length === 0 && (
                    <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>
                      本版本暂无字段绑定（字段绑定的是码表版本 id）
                    </div>
                  )}
                  {!usageQuery.isLoading &&
                    usageFields.map((f) => {
                      const dictLabel = f.dictKey
                        ? `${f.dictName || f.dictKey}（${f.dictKey}）`
                        : "未归属字典套";
                      const fieldHref = f.dictKey
                        ? `/content-manager/nhp-field/${encodeURIComponent(f.dictKey)}?fieldCode=${encodeURIComponent(f.fieldCode)}`
                        : `/content-manager/nhp-field?fieldCode=${encodeURIComponent(f.fieldCode)}`;
                      return (
                        <div
                          key={f.fieldId}
                          style={{
                            marginBottom: 12,
                            padding: 10,
                            borderRadius: 8,
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                            <Link to={fieldHref} style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)" }}>
                              {f.nameCn || f.nameEn || f.fieldCode}
                            </Link>
                            <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                              {f.fieldCode}
                            </span>
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>→ 字典套 {dictLabel}</span>
                          </div>
                          {(f.atoms ?? []).length === 0 && (
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                              尚未进入原子/组合模板
                            </div>
                          )}
                          {(f.atoms ?? []).map((atom) => (
                            <div key={atom.formId} style={{ marginTop: 8, paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
                              <div style={{ fontSize: 12 }}>
                                <span style={{ fontWeight: 600 }}>
                                  {atom.kind === "COMPOSITE" ? "组合" : "原子"} {atom.title || atom.formKey}
                                </span>
                                <span className="mono" style={{ marginLeft: 8, color: "var(--muted)" }}>
                                  {atom.formKey}@v{atom.version} · {atom.status}
                                </span>
                              </div>
                              {(atom.composites ?? []).map((c) => (
                                <div key={c.formId} style={{ fontSize: 12, marginTop: 4, paddingLeft: 12, color: "var(--muted)" }}>
                                  └ 组合 {c.title || c.formKey}
                                  <span className="mono" style={{ marginLeft: 6 }}>
                                    {c.formKey}@v{c.version} · {c.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      );
                    })}

                  {/* 其它版本占用摘要 */}
                  {(usageQuery.data?.versions ?? []).filter((v) => v.version !== selectedVersion && (v.fields?.length ?? 0) > 0)
                    .length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>
                        其它版本占用（发布新版时会保留）
                      </div>
                      {(usageQuery.data?.versions ?? [])
                        .filter((v) => v.version !== selectedVersion && (v.fields?.length ?? 0) > 0)
                        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
                        .map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className="btn small ghost"
                            style={{ marginRight: 8, marginBottom: 6 }}
                            onClick={() => selectVersion(v.version)}
                          >
                            v{v.version} · {v.fields.length} 字段 · {statusMeta(v.status).text}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {itemModal && selected && editable && (
        <div className="aup-modal-mask" onClick={() => setItemModal(null)}>
          <div className="aup-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{itemModal.mode === "add" ? "新增码表项" : "编辑码表项"}</h3>
            {row(
              "内部值",
              <input
                className="input"
                placeholder="存储 / 条件比较用（唯一）"
                value={itemModal.itemCode}
                disabled={itemModal.mode === "edit"}
                onChange={(e) => setItemModal({ ...itemModal, itemCode: e.target.value })}
              />,
            )}
            {row(
              "展示文本",
              <input
                className="input"
                placeholder="填表人看到的内容（留空同内部值）"
                value={itemModal.itemLabel}
                onChange={(e) => setItemModal({ ...itemModal, itemLabel: e.target.value })}
              />,
            )}
            <div className="aup-modal-actions">
              <button className="btn ghost" onClick={() => setItemModal(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={!itemModal.itemCode.trim() || addMut.isPending || updateMut.isPending}
                onClick={() => {
                  const label = itemModal.itemLabel.trim() || itemModal.itemCode.trim();
                  if (itemModal.mode === "add") {
                    addMut.mutate({ itemCode: itemModal.itemCode.trim(), itemLabel: label });
                  } else if (itemModal.itemId != null) {
                    updateMut.mutate({ itemId: itemModal.itemId, itemLabel: label });
                  }
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
