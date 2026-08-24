/**
 * 驾驶舱主区 · 最近动态（来自 overview API，失败时静默隐藏）
 */
import { useQuery } from "@tanstack/react-query";
import { fetchNhpOverview } from "../api/nhpOverview.api";
import "../nhp.css";

export default function NhpOverviewActivityPanel() {
  const overviewQuery = useQuery({
    queryKey: ["nhp", "overview"],
    queryFn: fetchNhpOverview,
    staleTime: 60_000,
    retry: false,
  });

  const activities = overviewQuery.data?.activities ?? [];
  const showEmpty = overviewQuery.isError || activities.length === 0;

  return (
    <section className="nhp-cockpit-card nhp-cockpit-activity">
      <header className="nhp-cockpit-card-hd">
        <h3 className="nhp-cockpit-card-title">最近动态</h3>
      </header>
      {overviewQuery.isLoading ? (
        <div className="nhp-cockpit-card-empty">加载中…</div>
      ) : showEmpty ? (
        <div className="nhp-cockpit-card-empty">暂无动态</div>
      ) : (
        <div className="nhp-cockpit-activity-scroll">
          <ul className="nhp-cockpit-activity-list">
            {activities.slice(0, 6).map((a, i) => (
              <li key={i} className="nhp-cockpit-activity-item">
                <time>{a.time}</time>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
