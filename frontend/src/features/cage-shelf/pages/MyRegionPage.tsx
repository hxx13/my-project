import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import {
  fetchFullTree,
  fetchMyRegion,
  type CageShelfTreeNode,
  type MyRegionEntry,
  type MyRegionMember,
} from "@/api/domains/cageShelf.api";

/**
 * 我的区域 —— 饲养组长看自己负责的区域与组员。**只读**。
 *
 * 组长是**身份**不是角色（role 可能只是 STAFF），所以本页挂在 STAFF 档位、页面内靠数据说话：
 * 不是组长时显示空态而不是报错。
 * 组员的纳入/移出与逐人勾权限属第四期 B，本期不放按钮——避免用户以为功能坏了。
 */

const TYPE_LABEL: Record<string, string> = { CAMPUS: "校区", FLOOR: "楼层", ROOM: "房间" };
const TYPE_ORDER = ["CAMPUS", "FLOOR", "ROOM"];

const card = "rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]";
const muted = "text-[var(--app-color-text-tertiary)]";

export default function MyRegionPage() {
  const [regions, setRegions] = useState<MyRegionEntry[]>([]);
  const [members, setMembers] = useState<MyRegionMember[]>([]);
  const [isLeader, setIsLeader] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyRegion(), fetchFullTree().catch(() => [] as CageShelfTreeNode[])])
      .then(([mine, tree]) => {
        if (cancelled) return;
        setRegions(mine.regions);
        setMembers(mine.members);
        setIsLeader(mine.isLeader);
        // 区域名后端不下发（避免为它多开一个 join），用已有的树在前端解析
        const map: Record<string, string> = {};
        for (const r of tree) {
          if (r.campusId) map[`CAMPUS:${r.campusId}`] = r.campusName;
          if (r.floorId) map[`FLOOR:${r.floorId}`] = `${r.campusName} / ${r.floorName}`;
          if (r.roomId) map[`ROOM:${r.roomId}`] = `${r.floorName} / ${r.roomName}`;
        }
        setNames(map);
      })
      .catch(() => toast.error("加载我的区域失败"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const byType = new Map<string, MyRegionEntry[]>();
    for (const r of regions) {
      if (!byType.has(r.regionType)) byType.set(r.regionType, []);
      byType.get(r.regionType)!.push(r);
    }
    return TYPE_ORDER.filter((t) => byType.has(t)).map((t) => [t, byType.get(t)!] as const);
  }, [regions]);

  const regionLabel = (r: MyRegionEntry) => names[`${r.regionType}:${r.regionId}`] || r.regionId;

  if (loading) {
    return (
      <AdminFullWidthPage>
        <div className={`mx-auto max-w-6xl px-4 py-6 text-[12px] ${muted}`}>加载中…</div>
      </AdminFullWidthPage>
    );
  }

  return (
    <AdminFullWidthPage>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className={`${card} mb-4 p-4 text-[12px] leading-relaxed ${muted}`}>
          这里显示<b className="text-[var(--app-color-text-primary)]">你作为饲养组长负责的区域</b>
          ，以及由你纳入的组员。区域由超级管理员分配；本页当前为只读视图——组员管理与组员权限配置将在后续版本开放。
        </div>

        {!isLeader && (
          <div className={`${card} mb-4 p-6 text-center text-[12px] ${muted}`}>
            你还不是任何区域的负责人。需要被分配区域的话，请联系超级管理员。
          </div>
        )}

        {isLeader && (
          <div className={`${card} mb-4 p-4`}>
            <div className={`mb-3 text-[11px] font-semibold ${muted}`}>我负责的区域（{regions.length}）</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {grouped.map(([type, list]) => (
                <div key={type} className="rounded-md border border-[var(--app-color-border-default)] p-3">
                  <div className={`mb-2 text-[11px] font-semibold ${muted}`}>
                    {TYPE_LABEL[type]}（{list.length}）
                  </div>
                  <ul className="space-y-1">
                    {list.map((r) => (
                      <li key={r.regionId} className="text-[12px] text-[var(--app-color-text-primary)]">
                        {regionLabel(r)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className={`${card} p-4`}>
          <div className={`mb-3 text-[11px] font-semibold ${muted}`}>我的组员（{members.length}）</div>
          {members.length === 0 ? (
            <div className={`py-4 text-center text-[11px] ${muted}`}>还没有组员</div>
          ) : (
            <div className="overflow-hidden rounded-md border border-[var(--app-color-border-default)]">
              <table className="twin-table">
                <thead>
                  <tr>
                    <th>组员</th>
                    <th className="w-28">覆盖区域数</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.memberUserId}>
                      <td className="px-2.5 py-1 text-[12px] text-[var(--app-color-text-primary)]">{m.memberName}</td>
                      <td className="px-2.5 py-1 text-[12px]">{m.regionCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminFullWidthPage>
  );
}
