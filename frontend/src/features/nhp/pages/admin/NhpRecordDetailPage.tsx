/**
 * NHP 手术实例审计详情：阶段摘要 + 分阶段历史表单 + 快照追溯。
 * 路由：/#/content-manager/nhp-records/:subjectId
 */
import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { appConfirm } from "@/lib/appDialog";
import ContentManagerWorkbenchLayout from "@/layouts/ContentManagerWorkbenchLayout";
import { formatDateTimeAsiaShanghaiShort } from "@/lib/formatDateTimeAsiaShanghai";
import {
  advanceNhpStage,
  deleteNhpRecord,
  fetchNhpRecords,
  fetchNhpSubjectDetail,
  type NhpRecordListItem,
} from "../../api/nhpRecord.api";
import {
  fetchNhpSubjectBoard,
  LIFECYCLE_STAGE_OPTIONS,
  lifecycleStageLabel,
} from "../../api/nhpSubjectBoard.api";
import NhpSnapshotDrawer from "../../components/NhpSnapshotDrawer";
import { surgeryContextFromCard } from "../../utils/nhpSurgeryContext";
import { animalTypeLabel } from "../../utils/nhpSubjectLabels";
import { nhpNavState } from "../../utils/nhpAdminNav";
import type { NhpSurgeryContext } from "../../utils/nhpSurgeryContext";
import "@/features/aup/aup.css";
import "../../nhp.css";

function statusLabel(status?: string | null): string {
  const s = (status ?? "").toUpperCase();
  if (s === "LOCKED") return "已锁定";
  if (s === "SIGNED") return "已签署";
  if (s === "COMPLETE") return "已提交";
  if (s === "DRAFT") return "草稿";
  if (s === "DELETED") return "已删除";
  return status || "—";
}

function armCodeLabel(code?: string): string {
  const u = (code ?? "").toUpperCase();
  if (u === "HEART") return "心脏移植臂";
  if (u === "LIVER") return "体外肝灌注臂";
  return code?.trim() || "—";
}

function nextLifecycleStage(stage?: string): string | null {
  const cur = (stage ?? "").toUpperCase();
  const idx = LIFECYCLE_STAGE_OPTIONS.findIndex((o) => o.value === cur);
  if (idx < 0 || idx >= LIFECYCLE_STAGE_OPTIONS.length - 1) return null;
  return LIFECYCLE_STAGE_OPTIONS[idx + 1].value;
}

function NhpRecordDetailStageHeader({ surgery }: { surgery: NhpSurgeryContext }) {
  const queryClient = useQueryClient();
  const next = nextLifecycleStage(surgery.lifecycleStage);
  const advanceMutation = useMutation({
    mutationFn: () => advanceNhpStage(surgery.subjectId, next!),
    onSuccess: () => {
      toast.success("已推进阶段");
      void queryClient.invalidateQueries({ queryKey: ["nhp", "subject-board"] });
      void queryClient.invalidateQueries({ queryKey: ["nhp", "subject", surgery.subjectId] });
    },
    onError: (e) => toast.error((e as Error).message || "推进失败"),
  });

  return (
    <div className="nhp-record-detail-hd">
      <div className="nhp-record-detail-hd-main">
        <div className="nhp-record-detail-hd-copy">
          <h2 className="nhp-record-detail-hd-title">阶段</h2>
          <div className="nhp-record-detail-chips" role="list" aria-label="手术实例阶段信息">
            <span className="nhp-record-detail-chip nhp-record-detail-chip--stage" role="listitem">
              <span className="k">生命周期</span>
              <span className="v">{lifecycleStageLabel(surgery.lifecycleStage)}</span>
            </span>
            <span className="nhp-record-detail-chip" role="listitem">
              <span className="k">当前时点</span>
              <span className="v">{surgery.currentTp ?? "—"}</span>
            </span>
            <span className="nhp-record-detail-chip muted" role="listitem">
              <span className="k">研究臂</span>
              <span className="v">{armCodeLabel(surgery.armCode)}</span>
            </span>
            <span className="nhp-record-detail-chip muted" role="listitem">
              <span className="k">对象编号</span>
              <span className="v">{surgery.subjectCode}</span>
            </span>
            {surgery.txDate ? (
              <span className="nhp-record-detail-chip muted" role="listitem">
                <span className="k">手术日</span>
                <span className="v">{surgery.txDate}</span>
              </span>
            ) : null}
            <span className="nhp-record-detail-chip muted" role="listitem">
              <span className="k">角色</span>
              <span className="v">{animalTypeLabel(surgery.subjectType)}</span>
            </span>
          </div>
        </div>
        {next ? (
          <button
            type="button"
            className="btn ghost small"
            disabled={advanceMutation.isPending}
            onClick={() => advanceMutation.mutate()}
          >
            推进到 {lifecycleStageLabel(next)}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function NhpRecordDetailPage() {
  const { subjectId: subjectIdParam } = useParams<{ subjectId: string }>();
  const subjectId = Number(subjectIdParam);
  const location = useLocation();
  const goBack = useGoBack("/content-manager/nhp-records");
  const queryClient = useQueryClient();

  const [snapshotRecordId, setSnapshotRecordId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const boardQuery = useQuery({ queryKey: ["nhp", "subject-board"], queryFn: () => fetchNhpSubjectBoard() });
  const subjectQuery = useQuery({
    queryKey: ["nhp", "subject", subjectId],
    queryFn: () => fetchNhpSubjectDetail(subjectId),
    enabled: subjectId > 0,
  });
  const recordsQuery = useQuery({
    queryKey: ["nhp", "records", subjectId],
    queryFn: () => fetchNhpRecords({ subjectId, page: 1, size: 200 }),
    enabled: subjectId > 0,
  });
  const surgery = useMemo(() => {
    const card = boardQuery.data?.find((c) => c.id === subjectId);
    if (card) return surgeryContextFromCard(card);
    const sub = subjectQuery.data?.subject;
    if (!sub) return null;
    return {
      key: `subject:${sub.id}`,
      subjectId: sub.id,
      subjectCode: sub.subjectCode,
      subjectType: sub.subjectType,
      species: sub.species,
      sex: sub.sex,
      label: sub.subjectCode,
      subtitle: animalTypeLabel(sub.subjectType),
    };
  }, [boardQuery.data, subjectId, subjectQuery.data]);

  const records = useMemo(
    () => (recordsQuery.data?.items ?? []).filter((row) => (row.record.status ?? "").toUpperCase() !== "DELETED"),
    [recordsQuery.data],
  );

  const onDeleteRecord = async (recordId: number) => {
    if (!(await appConfirm("删除该表单实例？（软删除，状态置为 DELETED，保留审计追溯）"))) return;
    try {
      await deleteNhpRecord(recordId);
      toast.success("已删除实例");
      await Promise.all([
        recordsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["nhp", "records-all"] }),
      ]);
    } catch (e) {
      toast.error((e as Error).message || "删除失败");
    }
  };

  const renderRecordRow = (row: NhpRecordListItem) => {
    const r = row.record;
    return (
      <div key={r.id} className="nhp-record-history-row">
        <div className="meta">
          <strong>{row.formName || row.formCode || `模板 #${r.formId}`}</strong>
          <span>
            实例 #{r.id} · {statusLabel(r.status)}
            {r.updatedAt ? ` · ${formatDateTimeAsiaShanghaiShort(r.updatedAt)}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            to={`/content-manager/nhp-entry/${r.id}`}
            state={nhpNavState(location)}
            className="btn primary small"
            style={{ textDecoration: "none" }}
          >
            审阅
          </Link>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              setSnapshotRecordId(r.id);
              setDrawerOpen(true);
            }}
          >
            快照
          </button>
          <Link to={`/nhp/fill/${r.id}`} className="btn ghost small" style={{ textDecoration: "none" }}>
            门户打开
          </Link>
          <button
            type="button"
            className="btn ghost small"
            style={{ color: "var(--danger)" }}
            onClick={() => void onDeleteRecord(r.id)}
          >
            删除
          </button>
        </div>
      </div>
    );
  };

  if (!subjectId || subjectId <= 0) {
    return (
      <ContentManagerWorkbenchLayout
        onBack={goBack}
        main={<div className="aup-wb-empty">无效的手术实例 ID</div>}
      />
    );
  }

  const loading = boardQuery.isLoading && subjectQuery.isLoading;

  return (
    <ContentManagerWorkbenchLayout
      onBack={goBack}
      backLabel="← 实例列表"
      countText={surgery ? surgery.label : `对象 #${subjectId}`}
      main={
        loading ? (
          <div className="aup-wb-empty">加载手术实例…</div>
        ) : !surgery ? (
          <div className="aup-wb-empty">未找到研究对象 #{subjectId}</div>
        ) : (
          <>
            <NhpRecordDetailStageHeader surgery={surgery} />

            <div className="aup-wb-panel" style={{ marginBottom: 16 }}>
              <div className="aup-wb-panel-hd">
                <span className="title">表单实例</span>
                <span style={{ flex: 1 }} />
                <span className="aup-wb-chip muted">共 {records.length} 条</span>
              </div>
              <div style={{ padding: "12px 16px 16px" }}>
                {records.length === 0 ? (
                  <div className="aup-wb-empty">尚无填写实例</div>
                ) : (
                  records
                    .sort((a, b) => (b.record.updatedAt ?? "").localeCompare(a.record.updatedAt ?? ""))
                    .map(renderRecordRow)
                )}
              </div>
            </div>
          </>
        )
      }
    >
      <NhpSnapshotDrawer
        open={drawerOpen}
        recordId={snapshotRecordId}
        readOnly
        onClose={() => setDrawerOpen(false)}
      />
    </ContentManagerWorkbenchLayout>
  );
}
