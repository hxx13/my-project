/**
 * NHP 通知中心（消息流，按类型分组，对齐 24 §2 / 27 §7）。
 *
 * 被动推送「发生了什么」（审核/质控/待办/版本），点通知跳对应页；正式形态为右滑抽屉，本页为可落地的独立列表。
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import { fetchNhpNotifications } from "../../api/nhpTask.api";
import "@/features/aup/aup.css";
import "../../nhp.css";
import { PortalHeader } from "@/features/portal/PortalHeader";

const GROUP_LABELS: Record<string, string> = {
  REVIEW: "审核",
  QUALITY: "数据质量",
  TODO: "待办",
  VERSION: "版本",
};

const GROUP_ORDER = ["REVIEW", "QUALITY", "TODO", "VERSION"];

export default function NhpNotificationCenterPage() {
  const goBack = useGoBack("/nhp/overview");
  const notifQuery = useQuery({ queryKey: ["nhp", "notifications"], queryFn: fetchNhpNotifications });
  const notifs = useMemo(() => notifQuery.data ?? [], [notifQuery.data]);

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <>
      <PortalHeader onOpenLogin={() => {}} />
      <div className="aup-app aup-app--workbench" style={{ background: "var(--bg)" }}>
      <div className="aup-wb">
        <div className="aup-wb-hd aup-wb-hd--compact">
          <div className="aup-wb-hd-main">
            <button type="button" className="btn ghost small" onClick={goBack}>
              ← 返回
            </button>
            <h1>通知中心</h1>
            <div className="sub">按类型分组的消息流 · {unread} 条未读</div>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {notifQuery.isError ? (
            <div className="aup-wb-empty">加载失败，请刷新重试</div>
          ) : notifQuery.isLoading ? (
            <div className="aup-wb-empty">加载通知…</div>
          ) : notifs.length === 0 ? (
            <div className="aup-wb-empty">暂无通知</div>
          ) : (
            GROUP_ORDER.map((g) => {
              const list = notifs.filter((n) => n.group === g);
              if (list.length === 0) return null;
              return (
                <div className="aup-wb-panel" key={g}>
                  <div className="aup-wb-panel-hd">
                    <span className="title">{GROUP_LABELS[g] ?? g}</span>
                    <span className="aup-wb-chip muted">{list.length}</span>
                  </div>
                  <div style={{ padding: "4px 16px" }}>
                    {list.map((n) => (
                      <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5, position: "relative" }}>
                        {!n.read && <span style={{ position: "absolute", left: -14, width: 6, height: 6, borderRadius: "50%", background: "var(--primary)" }} />}
                        <span style={{ flex: 1, minWidth: 0 }}>{n.text}</span>
                        <span style={{ color: "var(--muted)", fontSize: 11, whiteSpace: "nowrap" }}>{n.time ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </>
  );
}
