/**
 * 手术实例上下文：以研究对象 + 移植信息聚合（后端尚无独立 transplant 列表 API 时的前端模型）。
 */
import type { NhpSubjectCard } from "../api/nhpSubjectBoard.api";
import type { NhpRecordListItem } from "../api/nhpRecord.api";
import { lifecycleStageLabel } from "../api/nhpSubjectBoard.api";
import { animalTypeLabel } from "./nhpSubjectLabels";

/** 手术实例唯一键（localStorage / 路由） */
export type NhpSurgeryKey = string;

export interface NhpSurgeryContext {
  key: NhpSurgeryKey;
  subjectId: number;
  subjectCode: string;
  subjectType: string;
  species?: string;
  sex?: string;
  lifecycleStage?: string;
  currentTp?: string;
  txDate?: string;
  armCode?: string;
  todoCount?: number;
  overdueCount?: number;
  /** 展示用标签，如「R-001 · 2026-03-15」 */
  label: string;
  /** 副标题 */
  subtitle: string;
}

const SURGERY_KEY_PREFIX = "subject:";

export function surgeryKeyOf(subjectId: number): NhpSurgeryKey {
  return `${SURGERY_KEY_PREFIX}${subjectId}`;
}

export function subjectIdFromSurgeryKey(key: NhpSurgeryKey): number | null {
  if (!key.startsWith(SURGERY_KEY_PREFIX)) return null;
  const id = Number(key.slice(SURGERY_KEY_PREFIX.length));
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function surgeryContextFromCard(card: NhpSubjectCard): NhpSurgeryContext {
  const txPart = card.txDate ? ` · ${card.txDate}` : "";
  const stage = lifecycleStageLabel(card.lifecycleStage);
  return {
    key: surgeryKeyOf(card.id),
    subjectId: card.id,
    subjectCode: card.subjectCode,
    subjectType: card.subjectType,
    species: card.species,
    sex: card.sex,
    lifecycleStage: card.lifecycleStage,
    currentTp: card.currentTp,
    txDate: card.txDate,
    armCode: card.armCode,
    todoCount: card.todoCount,
    overdueCount: card.overdueCount,
    label: `${card.subjectCode}${txPart}`,
    subtitle: [animalTypeLabel(card.subjectType), stage, card.currentTp ? `当前 ${card.currentTp}` : null]
      .filter(Boolean)
      .join(" · "),
  };
}

/** 从实例列表反推手术文件夹（管理端无 board 数据时） */
export function surgeryContextsFromRecords(items: NhpRecordListItem[]): NhpSurgeryContext[] {
  const map = new Map<number, NhpSurgeryContext>();
  for (const row of items) {
    const sub = row.subject;
    if (!sub) continue;
    if (map.has(sub.id)) continue;
    map.set(sub.id, {
      key: surgeryKeyOf(sub.id),
      subjectId: sub.id,
      subjectCode: sub.subjectCode,
      subjectType: sub.subjectType,
      species: sub.species,
      sex: sub.sex,
      label: sub.subjectCode,
      subtitle: animalTypeLabel(sub.subjectType),
    });
  }
  return [...map.values()].sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
}
