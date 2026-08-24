/**
 * NHP 研究总览（采集侧首页）：驾驶舱布局 — 流水灯时间线 + 手术选择 + 侧栏卡片 + 紧凑可填表单。
 * 路由：/#/nhp/overview
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { PortalHeader } from "@/features/portal/PortalHeader";
import { fetchNhpSubjectBoard } from "../../api/nhpSubjectBoard.api";
import { fetchNhpRecords } from "../../api/nhpRecord.api";
import { fetchNhpTodoBySubject } from "../../api/nhpWorkbench.api";
import NhpOverviewCockpitHeader from "../../components/NhpOverviewCockpitHeader";
import NhpOverviewSubjectCard from "../../components/NhpOverviewSubjectCard";
import NhpOverviewNotificationsPanel from "../../components/NhpOverviewNotificationsPanel";
import NhpOverviewTodosPanel from "../../components/NhpOverviewTodosPanel";
import NhpOverviewFillablePanel from "../../components/NhpOverviewFillablePanel";
import NhpOverviewActivityPanel from "../../components/NhpOverviewActivityPanel";
import { useNhpActiveSurgery } from "../../hooks/useNhpActiveSurgery";
import { surgeryContextFromCard } from "../../utils/nhpSurgeryContext";
import "@/features/aup/aup.css";
import "../../nhp.css";

export default function NhpOverviewPage() {
  const navigate = useNavigate();
  const goBack = useGoBack("/");

  const boardQuery = useQuery({ queryKey: ["nhp", "subject-board"], queryFn: () => fetchNhpSubjectBoard() });
  const surgeries = useMemo(
    () => (boardQuery.data ?? []).map(surgeryContextFromCard),
    [boardQuery.data],
  );
  const { active, activeKey, setActiveKey } = useNhpActiveSurgery(surgeries);

  const recordsQuery = useQuery({
    queryKey: ["nhp", "records", active?.subjectId],
    queryFn: () => fetchNhpRecords({ subjectId: active!.subjectId, page: 1, size: 100 }),
    enabled: Boolean(active?.subjectId),
  });

  const todosQuery = useQuery({
    queryKey: ["nhp", "todos", active?.subjectId],
    queryFn: () => fetchNhpTodoBySubject(active!.subjectId),
    enabled: Boolean(active?.subjectId),
  });

  const loading = boardQuery.isLoading;
  const error = boardQuery.isError;

  return (
    <div className="nhp-cockpit-shell">
      <PortalHeader onOpenLogin={() => navigate("/")} />
      <div className="aup-app aup-app--workbench nhp-cockpit-app">
        <div className="aup-wb nhp-cockpit-wb">
          <NhpOverviewCockpitHeader
            onBack={goBack}
            surgeries={surgeries}
            active={active}
            activeKey={activeKey}
            onSelectSurgery={setActiveKey}
          />

          <div className="nhp-cockpit-body">
            {error ? (
              <div className="aup-wb-empty">加载失败，请刷新重试</div>
            ) : loading ? (
              <div className="aup-wb-empty">加载手术实例…</div>
            ) : active ? (
              <div className="nhp-cockpit-grid">
                <div className="nhp-cockpit-col nhp-cockpit-col--left">
                  <NhpOverviewSubjectCard
                    surgery={active}
                    todoCount={todosQuery.data?.length ?? active.todoCount}
                    overdueCount={active.overdueCount}
                  />
                  {recordsQuery.isLoading ? (
                    <div className="nhp-cockpit-card nhp-cockpit-fillable nhp-cockpit-card-empty">加载实例…</div>
                  ) : (
                    <NhpOverviewFillablePanel
                      surgery={active}
                      records={recordsQuery.data?.items ?? []}
                      mode="portal"
                    />
                  )}
                </div>

                <div className="nhp-cockpit-col nhp-cockpit-col--center">
                  <div className="nhp-cockpit-center-spacer" aria-hidden />
                  <NhpOverviewActivityPanel />
                </div>

                <aside className="nhp-cockpit-col nhp-cockpit-col--right">
                  <NhpOverviewNotificationsPanel />
                  <NhpOverviewTodosPanel
                    todos={todosQuery.data ?? []}
                    loading={todosQuery.isLoading}
                    onRecord={() => navigate(`/nhp/fill?subjectId=${active.subjectId}`)}
                  />
                </aside>
              </div>
            ) : (
              <div className="aup-wb-empty nhp-cockpit-empty">
                <p>暂无参与中的手术</p>
                <button type="button" className="btn primary small" onClick={() => navigate("/nhp/fill")}>
                  前往填报入口
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
