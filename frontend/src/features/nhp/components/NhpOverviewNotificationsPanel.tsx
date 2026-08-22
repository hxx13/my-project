/**
 * 驾驶舱侧栏 · 待审核通知 + 最近审核消息
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchNhpMyTasks } from "../api/nhpTask.api";
import { fetchNhpNotifications } from "../api/nhpTask.api";
import "../nhp.css";

const TASK_ACTION_ICONS: Record<string, string> = {
  FIELD_REVIEW: "校",
  RECORD_REVIEW: "复",
  SIGN: "签",
  QUESTION: "问",
};

export default function NhpOverviewNotificationsPanel() {
  const navigate = useNavigate();
  const tasksQuery = useQuery({ queryKey: ["nhp", "my-tasks"], queryFn: fetchNhpMyTasks, staleTime: 30_000 });
  const notifQuery = useQuery({ queryKey: ["nhp", "notifications"], queryFn: fetchNhpNotifications, staleTime: 30_000 });

  const tasks = useMemo(() => (tasksQuery.data ?? []).slice(0, 5), [tasksQuery.data]);
  const reviewNotifs = useMemo(
    () => (notifQuery.data ?? []).filter((n) => n.group === "REVIEW" || n.group === "TODO").slice(0, 4),
    [notifQuery.data],
  );

  const loading = tasksQuery.isLoading || notifQuery.isLoading;
  const empty = !loading && tasks.length === 0 && reviewNotifs.length === 0;

  return (
    <section className="nhp-cockpit-card nhp-cockpit-notifs">
      <header className="nhp-cockpit-card-hd">
        <h3 className="nhp-cockpit-card-title">审核与通知</h3>
        <div className="nhp-cockpit-card-actions">
          <button type="button" className="btn ghost small" onClick={() => navigate("/nhp/review-center")}>
            审核中心
          </button>
          <button type="button" className="btn ghost small" onClick={() => navigate("/nhp/notifications")}>
            全部
          </button>
        </div>
      </header>

      {loading ? (
        <div className="nhp-cockpit-card-empty">加载中…</div>
      ) : empty ? (
        <div className="nhp-cockpit-card-empty">暂无待审核或通知</div>
      ) : (
        <ul className="nhp-cockpit-notif-list">
          {tasks.map((t) => (
            <li key={`task-${t.id}`} className="nhp-cockpit-notif-item">
              <span className="nhp-cockpit-notif-icon" data-kind={t.tab}>
                {TASK_ACTION_ICONS[t.tab] ?? "·"}
              </span>
              <div className="nhp-cockpit-notif-body">
                <div className="nhp-cockpit-notif-text">{t.title}</div>
                {t.sub ? <div className="nhp-cockpit-notif-sub">{t.sub}</div> : null}
              </div>
              <button
                type="button"
                className="btn ghost small nhp-cockpit-notif-act"
                onClick={() => navigate("/nhp/review-center")}
              >
                {t.action}
              </button>
            </li>
          ))}
          {reviewNotifs.map((n) => (
            <li key={`notif-${n.id}`} className={"nhp-cockpit-notif-item" + (n.read ? "" : " unread")}>
              <span className="nhp-cockpit-notif-icon" data-kind="REVIEW">
                讯
              </span>
              <div className="nhp-cockpit-notif-body">
                <div className="nhp-cockpit-notif-text">{n.text}</div>
                {n.time ? <div className="nhp-cockpit-notif-sub">{n.time}</div> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
