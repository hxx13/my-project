/**
 * NHP 快照管理 API 层。
 *
 * 对接后端契约（后端未实现，前端按 24 §3.8 先行定义）：
 * - crf_record_snapshot：快照列表 / 字段级对比 / 回滚
 * 经 authHttp（baseURL `/api`）解包 Result<T>。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

/** 快照（crf_record_snapshot 一行；data_json 不可变） */
export interface NhpSnapshot {
  id: number;
  recordId: number;
  version: number;
  /** DRAFT / COMPLETE / LOCKED */
  stage: string;
  /** 业务阶段 donor/recipient/…/lock */
  bizStage?: string;
  createdBy?: string;
  /** 创建人展示名（UserDisplayNameService） */
  createdByName?: string;
  createdAt?: string;
}

/** 字段级 diff（fieldCode → before/after） */
export interface NhpSnapshotDiff {
  fieldCode: string;
  beforeValue?: string | null;
  afterValue?: string | null;
}

export async function fetchNhpSnapshots(opts?: { recordId?: number }): Promise<NhpSnapshot[]> {
  const params: Record<string, string> = {};
  if (opts?.recordId != null) params.recordId = String(opts.recordId);
  return authHttp.get<Result<NhpSnapshot[]>>("/nhp/snapshots", { params }).then(({ data }) => data.data);
}

export async function fetchNhpSnapshotDiff(id: number, otherId: number): Promise<NhpSnapshotDiff[]> {
  return authHttp
    .get<Result<NhpSnapshotDiff[]>>(`/nhp/snapshots/${id}/diff`, { params: { otherId: String(otherId) } })
    .then(({ data }) => data.data);
}
