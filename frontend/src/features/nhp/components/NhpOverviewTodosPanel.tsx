/**
 * 驾驶舱侧栏 · 今日待办列表
 */
import type { NhpTodo } from "../api/nhpWorkbench.api";
import "../nhp.css";

type Props = {
  todos: NhpTodo[];
  loading?: boolean;
  onRecord?: () => void;
};

export default function NhpOverviewTodosPanel({ todos, loading, onRecord }: Props) {
  const open = todos.filter((t) => (t.status ?? "").toUpperCase() !== "DONE").slice(0, 6);

  return (
    <section className="nhp-cockpit-card nhp-cockpit-todos">
      <header className="nhp-cockpit-card-hd">
        <h3 className="nhp-cockpit-card-title">今日待办</h3>
        {onRecord ? (
          <button type="button" className="btn ghost small" onClick={onRecord}>
            记录
          </button>
        ) : null}
      </header>

      {loading ? (
        <div className="nhp-cockpit-card-empty">加载中…</div>
      ) : open.length === 0 ? (
        <div className="nhp-cockpit-card-empty">今日无待办</div>
      ) : (
        <ul className="nhp-cockpit-todo-list">
          {open.map((t) => {
            const overdue = (t.status ?? "").toUpperCase() === "OVERDUE";
            return (
              <li key={t.id} className={"nhp-cockpit-todo-item" + (overdue ? " overdue" : "")}>
                <span className="nhp-cockpit-todo-type">{t.todoType}</span>
                <span className="nhp-cockpit-todo-meta">
                  {t.dueDate ?? "—"}
                  <span className="aup-wb-chip muted">{t.status}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
