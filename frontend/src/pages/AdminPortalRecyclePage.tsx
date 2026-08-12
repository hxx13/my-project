import { useRecycleContents, useRestoreContent, usePurgeContent } from "@/api/hooks/usePortalContent";
import { RotateCcw, Trash2 } from "lucide-react";

export default function AdminPortalRecyclePage() {
  const { data, isFetching } = useRecycleContents({ page: 1, size: 100 });
  const restoreMut = useRestoreContent();
  const purgeMut = usePurgeContent();
  const rows = data?.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, background: "white", borderBottom: "1px solid #e8e4df", flexShrink: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>🗑 回收站</span>
        <span style={{ color: "#b0a89a", fontSize: 11, marginLeft: 8 }}>共 {data?.total ?? 0} 条 · 7 天后自动清除</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <thead style={{ background: "#fafaf9", position: "sticky", top: 0, zIndex: 2 }}>
            <tr style={{ borderBottom: "2px solid #e8e4df" }}>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", width: 60 }}>ID</th>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase" }}>标题</th>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", width: 140 }}>删除时间</th>
              <th style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8b7355", textTransform: "uppercase", width: 150 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 10, fontFamily: "monospace", color: "#b0a89a" }}>#{row.id}</td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 12, fontWeight: 600, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6", fontSize: 12 }}>{row.updatedAt?.split("T")[0] || ""}</td>
                <td style={{ padding: "12px 14px", borderBottom: "1px solid #f0ece6" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => restoreMut.mutate(row.id)}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid #d4c9b8", background: "white", color: "#666" }}>
                      <RotateCcw className="size-3 inline mr-1" />恢复
                    </button>
                    <button onClick={() => { if (confirm("彻底删除？不可恢复。")) purgeMut.mutate(row.id); }}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer", border: "1px solid #d4c9b8", background: "white", color: "#dc2626" }}>
                      <Trash2 className="size-3 inline mr-1" />彻底删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !isFetching && (
              <tr><td colSpan={4} style={{ padding: 40, textAlign: "center", color: "#b0a89a" }}>回收站为空</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
