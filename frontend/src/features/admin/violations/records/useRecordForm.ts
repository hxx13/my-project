import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  batchCreateStudentViolations, createStudentViolation, listViolationPersonnelByProjectGroup,
  listViolationRules, searchViolationProjectGroups, updateStudentViolation, type StudentViolationRow,
} from "@/api/domains/studentViolation.api";
import {
  createCageStatusViolation,
  getCageStatusViolation,
  updateCageStatusViolation,
} from "@/api/domains/cageStatusViolation.api";
import { fetchSpecialStatusOverview } from "@/api/domains/cageShelf.api";
import { searchPersonnel } from "@/api/twinApi";
import { normalizePersonnelRecord, type PersonnelRecordView } from "@/utils/personnelRecord";
import { contentBodyFromHtml, serializeContentBody, type ContentBodyValue } from "../slots/ContentBodySlot";
import {
  fromDispositionRow,
  toCreateDisposition,
  toUpdateDisposition,
  validateDispositionForCreate,
  type DispositionValue,
} from "../slots/dispositionTypes";
import { parseRowImageUrls } from "./RecordsTable";

import { appConfirm } from "@/lib/appDialog";
export type TicketSource = "manual" | "cage";
export type LockMode = "single" | "batch";
export type RecordEditorMode =
  | { kind: "create"; source?: TicketSource }
  | { kind: "edit"; row: StudentViolationRow };

type PickUser = { userId: string; name: string };

export type CagePick = {
  positionLabel: string; campusName: string; roomName: string;
  shelveId: string; positionX: number; positionY: number; projectPiName: string;
};
export type CageOption = { value: string; label: string; detail: CagePick };

export const CAGE_STATUS_OPTIONS = [
  { value: "COHABITATION", label: "合笼/繁殖" },
  { value: "SPECIAL_FEEDING", label: "特殊饲养" },
  { value: "NEED_DIVIDE", label: "请分笼/密度超标" },
  { value: "HEALTH_ABNORMAL", label: "动物健康异常" },
  { value: "ANIMAL_TRANSFER", label: "动物转移" },
] as const;

const DEFAULT_DISPOSITION: DispositionValue = {
  actions: ["every", "unlock"],
  expiry: { mode: "RELATIVE", days: null },
  strategy: { type: "unset" },
};

/** 提交前归一化处置数值：maxEnterSuccess 小数 floor、负值归 null；到期天数小数 floor（≤0 已在插槽归一为 null）。 */
function normalizeDisposition(d: DispositionValue): DispositionValue {
  if (d.strategy.type === "unset") return d;
  const max = d.strategy.maxEnterSuccess;
  const normMax = max == null ? null : max < 0 ? null : Math.floor(max);
  const expiry =
    d.expiry.mode === "RELATIVE" && d.expiry.days != null
      ? ({ mode: "RELATIVE", days: Math.floor(d.expiry.days) } as const)
      : d.expiry;
  return { ...d, strategy: { ...d.strategy, maxEnterSuccess: normMax }, expiry };
}

export function useRecordForm(mode: RecordEditorMode) {
  const isEdit = mode.kind === "edit";
  const row = mode.kind === "edit" ? mode.row : null;
  const qc = useQueryClient();

  const [source, setSourceState] = useState<TicketSource>(() =>
    isEdit ? (row!.cageViolationId != null ? "cage" : "manual") : (mode.source ?? "manual"));
  const [lockMode, setLockModeState] = useState<LockMode>("single");
  const [personKeyword, setPersonKeyword] = useState("");
  const [searchResult, setSearchResult] = useState<Array<Record<string, unknown>>>([]);
  const personTimer = useRef<number | null>(null);
  const [picked, setPicked] = useState<PickUser | null>(null);
  const [groupKeyword, setGroupKeyword] = useState("");
  const [groupSuggestions, setGroupSuggestions] = useState<string[]>([]);
  const [groupSearching, setGroupSearching] = useState(false);
  const groupTimer = useRef<number | null>(null);
  const groupSearchSeq = useRef(0);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<PersonnelRecordView[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  /** 笼位状态：默认空，开单必选；编辑时从父记录回填 */
  const [cageStatusCode, setCageStatusCodeState] = useState(() =>
    isEdit ? (row!.cageParentStatus ?? "").trim() : "");
  const [cagePick, setCagePick] = useState<CagePick | null>(null);
  const [content, setContent] = useState<ContentBodyValue>(() =>
    isEdit ? contentBodyFromHtml(row!.violationText, parseRowImageUrls(row!)) : contentBodyFromHtml("", []));
  const [disposition, setDisposition] = useState<DispositionValue>(() =>
    isEdit ? fromDispositionRow(row!) : DEFAULT_DISPOSITION);
  const [ruleId, setRuleId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** 点击提交后若校验失败，高亮必填项 */
  const [showValidation, setShowValidation] = useState(false);

  const { data: specialStatus } = useQuery({
    queryKey: ["specialStatusOverview"],
    queryFn: () => fetchSpecialStatusOverview(),
    staleTime: 60_000,
  });

  const { data: rules = [] } = useQuery({
    queryKey: ["violation-rules"],
    queryFn: () => listViolationRules(),
    staleTime: 60_000,
  });

  // 编辑笼架记录：拉取父记录完整笼位坐标，供下拉回显与保存
  useEffect(() => {
    if (!isEdit || !row?.cageViolationId) return;
    let cancelled = false;
    void getCageStatusViolation(row.cageViolationId)
      .then((parent) => {
        if (cancelled || !parent) return;
        setCageStatusCodeState((prev) => prev || (parent.statusCode ?? "").trim());
        if (parent.positionLabel || parent.cageShelveId) {
          setCagePick({
            positionLabel: parent.positionLabel ?? "",
            campusName: parent.campusName ?? "",
            roomName: parent.roomName ?? "",
            shelveId: parent.cageShelveId != null ? String(parent.cageShelveId) : "",
            positionX: parent.positionX ?? 0,
            positionY: parent.positionY ?? 0,
            projectPiName: parent.projectPiName ?? "",
          });
        }
      })
      .catch(() => {
        /* 列表已有 cageParent* 兜底，拉取失败不阻断编辑 */
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, row?.cageViolationId]);

  const cageOptions = useMemo<CageOption[]>(() => {
    if (!cageStatusCode) return [];
    const grp = specialStatus?.groups.find((g) => g.statusCode === cageStatusCode);
    if (!grp) return [];
    return grp.cages.map((c) => {
      const detail: CagePick = {
        positionLabel: c.position, campusName: c.campusName ?? "", roomName: c.roomName ?? "",
        shelveId: c.shelveId ?? "", positionX: c.positionX ?? 0, positionY: c.positionY ?? 0,
        projectPiName: c.projectPiName ?? c.piName ?? "",
      };
      return {
        value: `${c.shelveId}-${c.positionX}-${c.positionY}`,
        label: `${c.position} · ${detail.projectPiName || "未知课题组"} · ${c.roomName || "—"}`,
        detail,
      };
    });
  }, [specialStatus, cageStatusCode]);

  // 选项就绪后：用父记录坐标/标签对齐到当前下拉项（仅在未对齐时写回，避免循环）
  useEffect(() => {
    if (!cagePick || cageOptions.length === 0) return;
    const byCoord = cageOptions.find(
      (o) =>
        o.detail.shelveId === cagePick.shelveId &&
        o.detail.positionX === cagePick.positionX &&
        o.detail.positionY === cagePick.positionY
    );
    const matched = byCoord ?? cageOptions.find((o) => o.detail.positionLabel === cagePick.positionLabel);
    if (!matched) return;
    if (
      matched.detail.shelveId === cagePick.shelveId &&
      matched.detail.positionX === cagePick.positionX &&
      matched.detail.positionY === cagePick.positionY &&
      matched.detail.positionLabel === cagePick.positionLabel
    ) {
      return;
    }
    setCagePick(matched.detail);
  }, [cageOptions, cagePick]);

  const clearPicked = () => { setPicked(null); setPersonKeyword(""); setSearchResult([]); };
  const resetBatchGroup = () => {
    setSelectedGroup(null); setGroupKeyword(""); setGroupSuggestions([]);
    setGroupMembers([]); setBatchSelectedIds(new Set()); setGroupSearching(false);
  };
  const setSource = (s: TicketSource) => {
    if (isEdit) return;
    setSourceState(s); clearPicked(); resetBatchGroup(); setCagePick(null); setCageStatusCodeState("");
  };
  const setLockMode = (m: LockMode) => {
    if (isEdit) return;
    setLockModeState(m); clearPicked(); resetBatchGroup(); setCagePick(null);
  };
  const setCageStatusCode = (v: string) => { setCageStatusCodeState(v); setCagePick(null); };

  const onPersonKeywordChange = (value: string) => {
    setPersonKeyword(value);
    if (personTimer.current) window.clearTimeout(personTimer.current);
    personTimer.current = window.setTimeout(async () => {
      const q = value.trim();
      if (!q) { setSearchResult([]); return; }
      try { const { data: list } = await searchPersonnel(q); setSearchResult(Array.isArray(list) ? list : []); }
      catch { setSearchResult([]); }
    }, 250);
  };
  const pickPerson = (raw: Record<string, unknown>) => {
    const safeId = String(raw.user_id ?? raw.userid ?? raw.userId ?? raw.id ?? "").trim();
    const safeName = String(raw.name ?? raw.username ?? "").trim() || safeId;
    if (!safeId) { toast.error("该记录缺少 user_id"); return; }
    setPicked({ userId: safeId, name: safeName });
    setPersonKeyword(`${safeName} (${safeId})`);
    setSearchResult([]);
  };

  const onGroupKeywordChange = (value: string) => {
    setGroupKeyword(value);
    if (selectedGroup && value !== selectedGroup) {
      setSelectedGroup(null); setGroupMembers([]); setBatchSelectedIds(new Set());
    }
    if (groupTimer.current) window.clearTimeout(groupTimer.current);
    const seq = ++groupSearchSeq.current;
    groupTimer.current = window.setTimeout(async () => {
      const q = value.trim();
      if (!q) {
        if (seq === groupSearchSeq.current) {
          setGroupSuggestions([]);
          setGroupSearching(false);
        }
        return;
      }
      setGroupSearching(true);
      try {
        const list = await searchViolationProjectGroups(q, 30);
        if (seq !== groupSearchSeq.current) return;
        setGroupSuggestions(Array.isArray(list) ? list : []);
      } catch {
        if (seq !== groupSearchSeq.current) return;
        setGroupSuggestions([]);
      } finally {
        if (seq === groupSearchSeq.current) setGroupSearching(false);
      }
    }, 250);
  };
  const loadGroupMembers = async (groupName: string) => {
    const g = groupName.trim();
    if (!g) { setGroupMembers([]); setBatchSelectedIds(new Set()); return; }
    setGroupMembersLoading(true);
    try {
      const rows = await listViolationPersonnelByProjectGroup(g, 500);
      const members = (Array.isArray(rows) ? rows : [])
        .map((r) => normalizePersonnelRecord(r as unknown as Record<string, unknown>))
        .filter((p): p is PersonnelRecordView => p != null && Boolean(p.userId));
      // 选中课题组后默认不勾选成员，由用户显式多选
      setGroupMembers(members); setBatchSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载课题组成员失败");
      setGroupMembers([]); setBatchSelectedIds(new Set());
    } finally {
      setGroupMembersLoading(false);
    }
  };
  const pickProjectGroup = (groupName: string) => {
    const g = groupName.trim();
    if (!g) return;
    setSelectedGroup(g); setGroupKeyword(g); setGroupSuggestions([]); void loadGroupMembers(g);
  };
  const toggleMember = (userId: string, checked: boolean) => {
    setBatchSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId); else next.delete(userId);
      return next;
    });
  };
  const setBatchSelectedMemberIds = (ids: string[]) => {
    setBatchSelectedIds(new Set(ids));
  };
  const selectAllMembers = () => setBatchSelectedIds(new Set(groupMembers.map((m) => m.userId)));
  const clearAllMembers = () => setBatchSelectedIds(new Set());

  const submit = async (): Promise<boolean> => {
    if (!isEdit) {
      if (lockMode === "single" && !picked) {
        setShowValidation(true);
        toast.error("请先选择人员");
        return false;
      }
      if (lockMode === "batch") {
        if (!selectedGroup) {
          setShowValidation(true);
          toast.error("请先检索并选择课题组");
          return false;
        }
        const ids = Array.from(batchSelectedIds);
        if (ids.length === 0) {
          setShowValidation(true);
          toast.error("请至少勾选一名课题组成员");
          return false;
        }
      }
      if (source === "cage" && !cageStatusCode.trim()) {
        setShowValidation(true);
        toast.error("请选择笼位状态");
        return false;
      }
      const dispErr = validateDispositionForCreate(disposition);
      if (dispErr) {
        setShowValidation(true);
        toast.error(dispErr);
        return false;
      }
      if (lockMode === "batch") {
        const ids = Array.from(batchSelectedIds);
        // 批量确认必须在建父记录之前，否则取消会留下孤儿父记录
        if (!await appConfirm(`确认为课题组「${selectedGroup}」下选中的 ${ids.length} 人批量提交违规记录？`)) return false;
      }
    } else if (source === "cage" && !cageStatusCode.trim()) {
      setShowValidation(true);
      toast.error("请选择笼位状态");
      return false;
    }

    setSubmitting(true);
    try {
      const { html, imageUrls, contentJson } = serializeContentBody(content);

      // 笼架来源：先建父记录拿 id，再挂到子记录（只建 1 个父记录）
      let cageViolationId: number | null = null;
      if (!isEdit && source === "cage") {
        const parent = await createCageStatusViolation({
          ruleId, statusCode: cageStatusCode,
          projectGroupName: lockMode === "batch" ? selectedGroup ?? undefined : undefined,
          positionLabel: cagePick?.positionLabel, campusName: cagePick?.campusName, roomName: cagePick?.roomName,
          cageShelveId: cagePick?.shelveId ? Number(cagePick.shelveId) || null : null,
          positionX: cagePick?.positionX ?? null, positionY: cagePick?.positionY ?? null,
          projectPiName: cagePick?.projectPiName,
        });
        cageViolationId = parent.id;
      }

      if (isEdit && row) {
        await updateStudentViolation(row.id, { violationText: html, imageUrls, contentJson: contentJson ?? undefined, ...toUpdateDisposition(normalizeDisposition(disposition)) });
        // 笼架来源：同步更新共享父记录的笼位/状态
        if (source === "cage" && row.cageViolationId != null) {
          await updateCageStatusViolation(row.cageViolationId, {
            statusCode: cageStatusCode,
            positionLabel: cagePick?.positionLabel,
            campusName: cagePick?.campusName,
            roomName: cagePick?.roomName,
            cageShelveId: cagePick?.shelveId ? Number(cagePick.shelveId) || null : null,
            positionX: cagePick?.positionX ?? null,
            positionY: cagePick?.positionY ?? null,
            projectPiName: cagePick?.projectPiName,
          });
        }
        toast.success("已保存修改");
      } else {
        const disp = toCreateDisposition(normalizeDisposition(disposition));
        // 笼架来源 + 关联规则 NOTICE_ONLY：只发公告、不产生强制违规
        if (source === "cage") {
          const linkedRule = rules.find((r) => r.id === ruleId);
          if (linkedRule?.cageTriggerAction === "NOTICE_ONLY") {
            disp.forbidEnter = false;
            disp.interactiveChallenge = undefined;
            disp.interactiveUnlockOnVerify = undefined;
          }
        }
        if (lockMode === "single" && picked) {
          await createStudentViolation({
            targetUserId: picked.userId, ruleId, violationText: html, imageUrls, contentJson: contentJson ?? undefined,
            cageViolationId: cageViolationId ?? undefined, ...disp,
          });
          toast.success("已保存违规记录");
        } else {
          const summary = await batchCreateStudentViolations({
            targetUserIds: Array.from(batchSelectedIds), ruleId, violationText: html, imageUrls, contentJson: contentJson ?? undefined,
            cageViolationId: cageViolationId ?? undefined, ...disp,
          });
          const created = summary?.createdCount ?? 0;
          const failed = summary?.failed?.length ?? 0;
          if (failed > 0) toast.error(`已创建 ${created} 条，${failed} 人失败`);
          else toast.success(`已为 ${created} 人保存违规记录`);
        }
      }

      setShowValidation(false);
      await qc.invalidateQueries({ queryKey: ["studentViolations"] });
      await qc.invalidateQueries({ queryKey: ["cage-status-violations"] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    source, setSource, lockMode, setLockMode,
    personKeyword, onPersonKeywordChange, searchResult, picked, pickPerson, clearPicked,
    resetBatchGroup, groupKeyword, onGroupKeywordChange, groupSuggestions, groupSearching, selectedGroup,
    groupMembers, groupMembersLoading, batchSelectedIds, toggleMember, setBatchSelectedMemberIds, pickProjectGroup,
    selectAllMembers, clearAllMembers, cageStatusCode, setCageStatusCode, cagePick, setCagePick,
    cageOptions, content, setContent, disposition, setDisposition,
    ruleId, setRuleId, rules, submitting, submit, showValidation, setShowValidation,
  };
}
