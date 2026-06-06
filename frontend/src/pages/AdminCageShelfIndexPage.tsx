import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TableProperties, ArrowLeft } from "lucide-react";
import { fetchCageShelfFilterOptions, fetchCageShelfIndexes, type CageShelfFilterOptions } from "@/api/domains/cageShelf.api";
import { AdminFormCard, AdminPageShell, AdminDataTableWrap } from "@/components/admin/AdminPageShell";

export default function AdminCageShelfIndexPage() {
  const navigate = useNavigate();
  const [campusId, setCampusId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>("");
  const [areaName, setAreaName] = useState("");
  const [floorId, setFloorId] = useState<string>("");
  const [floorName, setFloorName] = useState("");
  const [roomId, setRoomId] = useState<string>("");
  const [roomName, setRoomName] = useState("");

  const { data: options = { campuses: [], areas: [], floors: [], rooms: [], shelves: [] } } = useQuery({
    queryKey: ["cageShelfIndexFilterOptions", { campusId, areaId, areaName, floorId, floorName, roomId, roomName }],
    queryFn: () =>
      fetchCageShelfFilterOptions({
        campusId: campusId ? Number(campusId) : undefined,
        areaId: areaId || undefined,
        areaName: areaName || undefined,
        floorId: floorId || undefined,
        floorName: floorName || undefined,
        roomId: roomId || undefined,
        roomName: roomName || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const { data: indexData } = useQuery({
    queryKey: ["cageShelfIndexes", { campusId, areaId, floorId, roomId }],
    queryFn: () =>
      fetchCageShelfIndexes({
        campusId: campusId ? Number(campusId) : undefined,
        areaId: areaId || undefined,
        floorId: floorId || undefined,
        roomId: roomId || undefined,
        page: 1,
        size: 500,
      }),
    placeholderData: (prev) => prev,
  });

  const indexRows = indexData?.rows || [];
  const indexTotal = Number(indexData?.total || 0);

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <button type="button" className="hover:bg-[var(--twin-canvas-soft)] rounded-twin-md p-1 -ml-1 transition" onClick={() => navigate("/admin/cage-shelves")} title="返回笼架信息">
            <ArrowLeft className="h-5 w-5 text-[var(--twin-link-deep)]" />
          </button>
          <TableProperties className="h-6 w-6 shrink-0 text-[var(--twin-link-deep)]" aria-hidden />
          笼架落库索引
        </span>
      }
      description="查看已导入的笼架索引列表，支持按校区—区域—楼层—房间筛选。"
    >
      <div className="space-y-4">
        <AdminFormCard title="位置筛选">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--twin-mute)] text-xs font-medium">校区</span>
            <select
              className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
              value={campusId}
              onChange={(e) => { setCampusId(e.target.value); setAreaId(""); setFloorId(""); setRoomId(""); }}
            >
              <option value="">全部</option>
              {options.campuses.map((c) => (
                <option key={c.campusId} value={String(c.campusId)}>{c.campusName}</option>
              ))}
            </select>
            {campusId && (
              <>
                <span className="text-[var(--twin-mute)]">→</span>
                <span className="text-[var(--twin-mute)] text-xs font-medium">区域</span>
                <select
                  className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
                  value={areaId ? `${areaId}|${areaName}` : ""}
                  onChange={(e) => {
                    const [id, name] = e.target.value.split("|");
                    setAreaId(id); setAreaName(name || ""); setFloorId(""); setRoomId("");
                  }}
                >
                  <option value="">全部</option>
                  {options.areas.map((a) => (
                    <option key={`${a.areaId}-${a.areaName}`} value={`${a.areaId}|${a.areaName}`}>{a.areaName}</option>
                  ))}
                </select>
              </>
            )}
            {areaId && (
              <>
                <span className="text-[var(--twin-mute)]">→</span>
                <span className="text-[var(--twin-mute)] text-xs font-medium">楼层</span>
                <select
                  className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
                  value={floorId ? `${floorId}|${floorName}` : ""}
                  onChange={(e) => {
                    const [id, name] = e.target.value.split("|");
                    setFloorId(id); setFloorName(name || ""); setRoomId("");
                  }}
                >
                  <option value="">全部</option>
                  {options.floors.map((f) => (
                    <option key={`${f.floorId}-${f.floorName}`} value={`${f.floorId}|${f.floorName}`}>{f.floorName}</option>
                  ))}
                </select>
              </>
            )}
            {floorId && (
              <>
                <span className="text-[var(--twin-mute)]">→</span>
                <span className="text-[var(--twin-mute)] text-xs font-medium">房间</span>
                <select
                  className="rounded-twin-md border border-[var(--twin-hairline-strong)] bg-[var(--twin-canvas)] px-2 py-1 text-sm"
                  value={roomId ? `${roomId}|${roomName}` : ""}
                  onChange={(e) => {
                    const [id, name] = e.target.value.split("|");
                    setRoomId(id); setRoomName(name || "");
                  }}
                >
                  <option value="">全部</option>
                  {options.rooms.map((r) => (
                    <option key={`${r.roomId}-${r.roomName}`} value={`${r.roomId}|${r.roomName}`}>{r.roomName}</option>
                  ))}
                </select>
              </>
            )}
          </div>
        </AdminFormCard>

        <AdminFormCard title="索引列表" description={`当前筛选命中 ${indexTotal} 条（展示前 ${indexRows.length} 条）。`}>
          <AdminDataTableWrap scrollable>
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]">
                <tr>
                  <th className="px-2 py-1.5 text-left">校区</th>
                  <th className="px-2 py-1.5 text-left">区域</th>
                  <th className="px-2 py-1.5 text-left">楼层</th>
                  <th className="px-2 py-1.5 text-left">房间</th>
                  <th className="px-2 py-1.5 text-left">架子</th>
                  <th className="px-2 py-1.5 text-left">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {indexRows.map((r) => (
                  <tr key={`${r.shelveId}-${r.roomId}`} className="border-t border-[var(--twin-hairline)]">
                    <td className="px-2 py-1.5">{r.campusName} ({r.campusId})</td>
                    <td className="px-2 py-1.5">{r.areaName} ({r.areaId})</td>
                    <td className="px-2 py-1.5">{r.floorName} ({r.floorId})</td>
                    <td className="px-2 py-1.5">{r.roomName} ({r.roomId})</td>
                    <td className="px-2 py-1.5">{r.shelveName || "-"} ({r.shelveId})</td>
                    <td className="px-2 py-1.5 text-[var(--twin-mute)]">{r.updateTime || "-"}</td>
                  </tr>
                ))}
                {indexRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-4 text-center text-[var(--twin-mute)]" colSpan={6}>
                      暂无落库索引数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminDataTableWrap>
        </AdminFormCard>
      </div>
    </AdminPageShell>
  );
}
