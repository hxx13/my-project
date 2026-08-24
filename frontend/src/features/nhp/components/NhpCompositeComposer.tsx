/**
 * 组合模板创建器：按数据域原子分组 → 选原子版本 → 预览结构 → 确认组合。
 * 也可在组合编辑器内复用：添加缺失原子 / 更换某数据域原子版本。
 * create 模式默认只列某一数据域套，避免猪/猴原子混组。
 */
import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchNhpFieldDictionaries } from "../api/nhpFieldDictionary.api";
import {
  fetchNhpAtoms,
  fetchNhpTemplateById,
  fetchNhpTemplateVersions,
  versionOriginLabel,
  type NhpTemplateListItem,
} from "../api/nhpTemplate.api";
import { fetchNhpDictStructure } from "../api/nhpFieldDictionary.api";
import { compareCodedId } from "../utils/domainSort";
import {
  AtomCodeChip,
  AtomPickInline,
  AtomPickList,
  buildDomainNameMap,
  folderDisplayName,
  resolveAtomZhName,
} from "../utils/nhpAtomDisplay";
import { statusLabel } from "../store/editorUtils";
import NhpTemplateStructurePreview from "./NhpTemplateStructurePreview";

export type StagePick = { atomCode: string; atomFormId: number; version?: number; title?: string };

function isPublishedVersion(t?: { status?: string }): boolean {
  const s = (t?.status || "").toUpperCase();
  return s === "PUBLISHED" || s === "FROZEN";
}

/** 钉选默认：优先最新已发布版，否则取列表头（常为最新草稿） */
function preferredPinVersion(
  vers: NhpTemplateListItem[],
  head: NhpTemplateListItem,
): NhpTemplateListItem {
  const published = vers.find((v) => isPublishedVersion(v));
  return published ?? vers[0] ?? head;
}

interface Props {
  formKey: string;
  title: string;
  onFormKeyChange?: (v: string) => void;
  onTitleChange?: (v: string) => void;
  onConfirm: (picks: StagePick[]) => void;
  onCancel: () => void;
  confirming?: boolean;
  /** create=新建组合；edit=编辑器内添加/更换数据域原子 */
  mode?: "create" | "edit";
  /** 编辑器内已钉住的原子（用于预填与「不可重复添加」） */
  initialPicks?: StagePick[];
  /**
   * 已占用数据域码：不可再勾选添加（除非出现在 allowReplaceCodes）。
   * 删除章节后应从该列表移除，即可重新选择。
   */
  occupiedCodes?: string[];
  /** 允许更换的数据域（通常 = 当前 focus 的一个码，或全部 initialPicks） */
  allowReplaceCodes?: string[];
  /** 打开时聚焦某数据域原子（更换流程） */
  focusStage?: string | null;
  confirmLabel?: string;
  /** 隐藏 formKey/标题（编辑已有组合时） */
  hideMeta?: boolean;
  /** 默认只列该数据域套的原子（create / edit 均按套过滤，避免猪猴混组） */
  defaultDictKey?: string;
}

export default function NhpCompositeComposer({
  formKey,
  title,
  onFormKeyChange,
  onTitleChange,
  onConfirm,
  onCancel,
  confirming,
  mode = "create",
  initialPicks,
  occupiedCodes,
  allowReplaceCodes,
  focusStage = null,
  confirmLabel,
  hideMeta,
  defaultDictKey = "pig",
}: Props) {
  const dictListQuery = useQuery({
    queryKey: ["nhp", "field-dictionaries"],
    queryFn: fetchNhpFieldDictionaries,
  });
  const [suiteKey, setSuiteKey] = useState(defaultDictKey);
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [previewAtom, setPreviewAtom] = useState<string | null>(focusStage);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSuiteKey(defaultDictKey || "pig");
    setHydrated(false);
  }, [defaultDictKey]);

  const atomsQuery = useQuery({
    queryKey: ["nhp", "templates", "ATOM", suiteKey],
    queryFn: () => fetchNhpAtoms(suiteKey),
  });

  const structureQuery = useQuery({
    queryKey: ["nhp", "dict-structure", suiteKey],
    queryFn: () => fetchNhpDictStructure(suiteKey),
    enabled: !!suiteKey,
  });

  const domainNameMap = useMemo(
    () => buildDomainNameMap(structureQuery.data?.domains),
    [structureQuery.data],
  );

  const atoms = useMemo(() => {
    const list = [...(atomsQuery.data ?? [])];
    list.sort((a, b) =>
      compareCodedId(a.domainCode || a.formKey, b.domainCode || b.formKey),
    );
    return list;
  }, [atomsQuery.data]);

  const versionQueries = useQueries({
    queries: atoms.map((s) => ({
      queryKey: ["nhp", "templates", "versions", s.formKey],
      queryFn: () => fetchNhpTemplateVersions(s.formKey),
      enabled: atoms.length > 0,
    })),
  });

  const versionsByAtom = useMemo(() => {
    const map = new Map<string, NhpTemplateListItem[]>();
    atoms.forEach((s, i) => {
      const rows = [...(versionQueries[i]?.data ?? [])];
      rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      map.set(s.formKey, rows);
    });
    return map;
  }, [atoms, versionQueries]);

  const occupied = useMemo(() => new Set(occupiedCodes ?? []), [occupiedCodes]);
  const replaceable = useMemo(() => new Set(allowReplaceCodes ?? []), [allowReplaceCodes]);

  useEffect(() => {
    if (!atoms.length || hydrated) return;
    const nextEnabled = new Set<string>();
    const nextPicks: Record<string, number> = {};

    if (initialPicks?.length) {
      for (const p of initialPicks) {
        nextEnabled.add(p.atomCode);
        if (p.atomFormId) nextPicks[p.atomCode] = p.atomFormId;
      }
    } else if (mode === "create") {
      for (const s of atoms) {
        nextEnabled.add(s.formKey);
        const vers = versionsByAtom.get(s.formKey);
        const head = preferredPinVersion(vers ?? [], s);
        if (head?.formId) nextPicks[s.formKey] = head.formId;
      }
    }

    if (focusStage) {
      nextEnabled.add(focusStage);
      if (!nextPicks[focusStage]) {
        const vers = versionsByAtom.get(focusStage);
        const head =
          preferredPinVersion(vers ?? [], atoms.find((s) => s.formKey === focusStage) ?? ({} as NhpTemplateListItem));
        if (head?.formId) nextPicks[focusStage] = head.formId;
      }
      setPreviewAtom(focusStage);
    } else {
      const first = [...nextEnabled][0] ?? null;
      if (first) setPreviewAtom(first);
    }

    setEnabled(nextEnabled);
    setPicks(nextPicks);
    if (mode === "edit" || Object.keys(nextPicks).length > 0 || !atoms.length) {
      setHydrated(true);
    } else if (versionsByAtom.size > 0) {
      setHydrated(true);
    }
  }, [atoms, versionsByAtom, initialPicks, focusStage, mode, hydrated]);

  const previewFormId = previewAtom ? picks[previewAtom] : undefined;
  const previewQuery = useQuery({
    queryKey: ["nhp", "templates", "by-id", previewFormId],
    queryFn: () => fetchNhpTemplateById(previewFormId!),
    enabled: !!previewFormId,
  });

  const canToggle = (code: string): boolean => {
    if (focusStage && code !== focusStage) return false;
    if (occupied.has(code) && !replaceable.has(code) && !enabled.has(code)) {
      return false;
    }
    if (mode === "edit" && occupied.has(code) && enabled.has(code) && !replaceable.has(code) && !focusStage) {
      return false;
    }
    return true;
  };

  const toggleAtom = (code: string) => {
    if (!canToggle(code)) return;
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else {
        next.add(code);
        if (!picks[code]) {
          const vers = versionsByAtom.get(code);
          const head = preferredPinVersion(vers ?? [], atoms.find((s) => s.formKey === code) ?? ({} as NhpTemplateListItem));
          if (head?.formId) setPicks((p) => ({ ...p, [code]: head.formId }));
        }
        setPreviewAtom(code);
      }
      return next;
    });
  };

  const setVersion = (code: string, formId: number) => {
    setPicks((p) => ({ ...p, [code]: formId }));
    setPreviewAtom(code);
  };

  const selectedPicks = useMemo((): StagePick[] => {
    const out: StagePick[] = [];
    for (const s of atoms) {
      if (!enabled.has(s.formKey)) continue;
      const formId = picks[s.formKey];
      if (!formId) continue;
      const vers = versionsByAtom.get(s.formKey) ?? [];
      const hit = vers.find((v) => v.formId === formId) ?? s;
      out.push({
        atomCode: s.formKey,
        atomFormId: formId,
        version: hit.version,
        title: hit.title || s.title,
      });
    }
    return out;
  }, [atoms, enabled, picks, versionsByAtom]);

  const preview = previewQuery.data;
  const showMeta = !hideMeta && mode === "create";
  const suiteLabel =
    (dictListQuery.data ?? []).find((d) => d.dictKey === suiteKey)?.name || suiteKey;
  const atomDomainCode = (s: NhpTemplateListItem) => s.domainCode || s.formKey;

  const titleText =
    mode === "edit"
      ? focusStage
        ? `更换数据域原子 · ${folderDisplayName(focusStage, resolveAtomZhName(focusStage, null, domainNameMap))}`
        : "添加 / 调整数据域原子"
      : `从「${suiteLabel}」套内原子组合`;
  const descText =
    mode === "edit"
      ? focusStage
        ? `为 ${folderDisplayName(focusStage, resolveAtomZhName(focusStage, null, domainNameMap))} 重新选择原子版本并预览；确认后会按全部已选数据域重新快照组合结构。同一数据域不可重复添加。`
        : "已占用数据域不可再勾选。删除左侧章节后可重新选择该域。勾选缺失域 → 选版本 → 预览 → 确认。草稿与已发布版本均可钉住；发布组合前建议优先选已发布版。"
      : "默认只列当前数据域套的原子，避免猪/猴混组。右侧只预览当前选中的那一个原子。草稿与已发布版本均可钉住。";

  return (
    <div className="nhp-composer">
      <div className="nhp-composer-hd">
        <div>
          <div className="nhp-composer-title">{titleText}</div>
          <p className="nhp-composer-desc">{descText}</p>
          {mode === "edit" && hideMeta ? (
            <p className="nhp-composer-desc" style={{ marginTop: 4 }}>
              数据域套：<strong>{suiteLabel}</strong>
              {atomsQuery.isSuccess ? ` · 本套 ${atoms.length} 个可钉原子` : ""}
            </p>
          ) : null}
        </div>
        {showMeta && (
          <div className="nhp-composer-meta">
            <label>
              数据域套
              <select
                className="input"
                value={suiteKey}
                onChange={(e) => {
                  setSuiteKey(e.target.value);
                  setHydrated(false);
                  onTitleChange?.(
                    `${(dictListQuery.data ?? []).find((d) => d.dictKey === e.target.value)?.name || e.target.value} · 组合模板`,
                  );
                }}
              >
                {(dictListQuery.data ?? []).map((d) => (
                  <option key={d.dictKey} value={d.dictKey}>
                    {d.name}（{d.dictKey}）
                  </option>
                ))}
              </select>
            </label>
            <label>
              formKey
              <input
                className="input"
                value={formKey}
                onChange={(e) => onFormKeyChange?.(e.target.value)}
                placeholder="组合 formKey"
              />
            </label>
            <label>
              标题
              <input
                className="input"
                value={title}
                onChange={(e) => onTitleChange?.(e.target.value)}
                placeholder="含套名，如 猪套 · 组合模板"
              />
            </label>
          </div>
        )}
      </div>

      {atomsQuery.isLoading ? (
        <div className="aup-empty small">加载数据域原子…</div>
      ) : atoms.length === 0 ? (
        <div className="aup-empty small">
          「{suiteLabel}」套内尚无原子模板。请先在表单发布页「导入内置种子」或到字段字典「从字典生成」域原子；
          列表默认只显示「已发布」，草稿原子请切到「含草稿」查看。
        </div>
      ) : (
        <div className="nhp-composer-body">
          <div className="nhp-composer-stages">
            {atoms.map((s, i) => {
              const vers = versionsByAtom.get(s.formKey) ?? [];
              const on = enabled.has(s.formKey);
              const selectedId = picks[s.formKey];
              const loadingVers = versionQueries[i]?.isLoading;
              const isOccupied = occupied.has(s.formKey);
              const canChange = canToggle(s.formKey);
              const blocked = isOccupied && !on && !replaceable.has(s.formKey) && !focusStage;
              if (focusStage && s.formKey !== focusStage) {
                return null;
              }
              return (
                <div
                  key={s.formKey}
                  className={`nhp-composer-stage${on ? " on" : ""}${blocked ? " blocked" : ""}${
                    previewAtom === s.formKey ? " previewing" : ""
                  }`}
                >
                  <label className="nhp-composer-stage-hd">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!canChange}
                      onChange={() => toggleAtom(s.formKey)}
                    />
                    <span className="lbl">
                      {folderDisplayName(
                        atomDomainCode(s),
                        resolveAtomZhName(atomDomainCode(s), s.title, domainNameMap),
                      )}
                    </span>
                    {resolveAtomZhName(atomDomainCode(s), s.title, domainNameMap) ? (
                      <AtomCodeChip code={atomDomainCode(s)} />
                    ) : null}
                    <span className="meta">
                      {blocked ? "已占用" : `${statusLabel(s.status)} · 最新 v${s.version ?? 1}`}
                      {versionOriginLabel(s.origin) ? ` · ${versionOriginLabel(s.origin)}` : ""}
                      {s.locked ? " · 已钉住" : ""}
                    </span>
                  </label>
                  {on && (
                    <div className="nhp-composer-vers">
                      {loadingVers && <span className="muted">加载版本…</span>}
                      {!loadingVers && vers.length === 0 && (
                        <button
                          type="button"
                          className={`nhp-ver-chip${selectedId === s.formId ? " active" : ""}`}
                          onClick={() => setVersion(s.formKey, s.formId)}
                        >
                          v{s.version ?? 1}
                          {` · ${statusLabel(s.status)}`}
                          {versionOriginLabel(s.origin) ? ` · ${versionOriginLabel(s.origin)}` : ""}
                        </button>
                      )}
                      {vers.map((v) => {
                        const ol = versionOriginLabel(v.origin);
                        const st = statusLabel(v.status);
                        return (
                          <button
                            key={v.formId}
                            type="button"
                            className={`nhp-ver-chip${selectedId === v.formId ? " active" : ""}`}
                            onClick={() => setVersion(s.formKey, v.formId)}
                            title={
                              (v.referencedBy ?? []).length
                                ? `已被 ${(v.referencedBy ?? []).map((r) => r.formKey).join(", ")} 引用`
                                : v.description || st
                            }
                          >
                            v{v.version ?? "?"}
                            {` · ${st}`}
                            {ol ? ` · ${ol}` : ""}
                            {(v.referencedBy ?? []).length > 0 ? " · 已引用" : ""}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={!selectedId}
                        onClick={() => setPreviewAtom(s.formKey)}
                      >
                        预览本原子
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="nhp-composer-preview">
            <div className="nhp-composer-preview-hd">
              {previewAtom && selectedPicks.find((p) => p.atomCode === previewAtom)
                ? `预览 ${folderDisplayName(
                    previewAtom,
                    resolveAtomZhName(
                      previewAtom,
                      selectedPicks.find((p) => p.atomCode === previewAtom)?.title,
                      domainNameMap,
                    ),
                  )} · v${
                    selectedPicks.find((p) => p.atomCode === previewAtom)?.version ?? "?"
                  }（仅本套内域）`
                : "原子版本预览"}
            </div>
            {!previewAtom || !previewFormId ? (
              <div className="aup-empty small">勾选套内数据域原子并选择版本后，右侧显示该原子详细结构。</div>
            ) : previewQuery.isLoading ? (
              <div className="aup-empty small">加载预览…</div>
            ) : previewQuery.isError ? (
              <div className="aup-empty small">预览加载失败</div>
            ) : (
              <div className="nhp-composer-preview-body">
                <NhpTemplateStructurePreview template={preview} emptyHint="该原子版本无结构" />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="nhp-composer-foot">
        <div className="muted" style={{ fontSize: 12 }}>
          已选 {selectedPicks.length} 个数据域原子
          {selectedPicks.length ? (
            <>
              ：
              <AtomPickList picks={selectedPicks} nameMap={domainNameMap} />
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="btn primary"
            disabled={confirming || !selectedPicks.length}
            onClick={() => onConfirm(selectedPicks)}
          >
            {confirming ? "处理中…" : confirmLabel || (mode === "edit" ? "应用并刷新结构" : "组合并打开编辑")}
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
