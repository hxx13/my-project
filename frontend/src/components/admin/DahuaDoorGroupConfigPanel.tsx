import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDahuaDoorGroup,
  deleteDahuaDoorGroup,
  fetchDahuaDeviceOrgs,
  fetchDahuaDoorChannels,
  fetchDahuaDoorGroupsWithDetails,
  updateDahuaDoorGroup,
  type DahuaDoorGroupDetailRow,
} from "@/api/twinApi";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminToolbarSearchField } from "@/components/admin/AdminToolbarSearchField";
import { DahuaChannelListPicker } from "@/components/admin/DahuaChannelListPicker";
import { adminInputClass, adminLabelClass } from "@/features/admin/adminFormUi";
import { appConfirm } from "@/lib/appDialog";
import DataSkeleton from "@/components/ui/DataSkeleton";

interface Draft {
  id: number | null;
  name: string;
  memo: string;
  orgCode: string;
  channelCodes: string[];
}

function draftFrom(row: DahuaDoorGroupDetailRow): Draft {
  return {
    id: row.id,
    name: row.name || "",
    memo: row.memo || "",
    orgCode: row.orgCode || "",
    channelCodes: (row.doorGroupDetail || []).map((c) => c.channelCode).filter(Boolean),
  };
}

/** 门组配置三栏：左侧门组列表，中间可选通道、右侧已配置通道 */
export function DahuaDoorGroupConfigPanel({ className = "" }: { className?: string }) {
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["dahuaDoorGroupsDetail"] as const,
    queryFn: fetchDahuaDoorGroupsWithDetails,
  });
  const orgsQuery = useQuery({
    queryKey: ["dahuaDeviceOrgs"] as const,
    queryFn: fetchDahuaDeviceOrgs,
  });

  const groups = groupsQuery.data ?? [];
  const orgs = orgsQuery.data ?? [];

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return groups;
    return groups.filter((g) =>
      [g.name, g.orgName, g.orgCode, g.memo].some((v) => (v || "").toLowerCase().includes(k))
    );
  }, [groups, keyword]);

  const startCreate = () => {
    const defaultOrg = orgs.find((o) => (o.name || "").includes("门禁设备"))?.code || orgs[0]?.code || "";
    setDraft({ id: null, name: "", memo: "", orgCode: defaultOrg, channelCodes: [] });
  };

  const saveMut = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name.trim(),
        memo: d.memo,
        orgCode: d.orgCode,
        channelCodes: d.channelCodes,
      };
      if (!payload.name) throw new Error("请填写门组名称");
      return d.id == null ? createDahuaDoorGroup(payload) : updateDahuaDoorGroup(d.id, payload);
    },
    onSuccess: async () => {
      toast.success("门组已保存");
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["dahuaDoorGroupsDetail"] });
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDahuaDoorGroup(id),
    onSuccess: async () => {
      toast.success("门组已删除");
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["dahuaDoorGroupsDetail"] });
    },
    onError: (e: Error) => toast.error(e.message || "删除失败"),
  });

  const onDelete = async (d: Draft) => {
    if (d.id == null) return;
    if (!(await appConfirm(`确定删除门组「${d.name}」？平台侧会立即生效。`))) return;
    deleteMut.mutate(d.id);
  };

  return (
    <div className={`flex min-h-0 flex-1 gap-2 ${className}`}>
      <div className="flex w-56 shrink-0 flex-col overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
        <div className="border-b border-[var(--twin-hairline)] p-1.5">
          <AdminToolbarSearchField
            className="w-full"
            placeholder="搜索门组 / 组织"
            value={keyword}
            onChange={setKeyword}
            onSubmit={() => {}}
          />
        </div>
        <div className="border-b border-[var(--twin-hairline)] px-2 py-1 text-[11px] text-[var(--twin-mute)]">
          <div className="flex items-center justify-between gap-1">
            <span>共 {filtered.length} 个门组</span>
            <button
              type="button"
              onClick={startCreate}
              className="shrink-0 rounded px-1 text-[11px] font-semibold text-[var(--twin-primary)] hover:bg-[var(--twin-canvas-soft)]"
            >
              + 新建
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {groupsQuery.isLoading ? (
            <DataSkeleton variant="table" rows={6} />
          ) : (
            filtered.map((g) => {
              const active = draft?.id === g.id;
              const size = (g.doorGroupDetail || []).length;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setDraft(draftFrom(g))}
                  className={`mb-0.5 w-full rounded px-2 py-1.5 text-left ${
                    active ? "bg-[var(--twin-primary-soft,#eef2ff)]" : "hover:bg-[var(--twin-canvas-soft)]"
                  }`}
                >
                  <div className="truncate text-xs font-semibold text-[var(--twin-ink)]">{g.name || `门组 ${g.id}`}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--twin-mute)]">
                    <span className="truncate">{g.orgName || g.orgCode || "未归属组织"}</span>
                    <span className="shrink-0">{size} 门</span>
                  </div>
                </button>
              );
            })
          )}
          {!groupsQuery.isLoading && filtered.length === 0 && (
            <div className="p-4 text-center text-[11px] text-[var(--twin-mute)]">没有匹配的门组</div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2">
        {!draft ? (
          <div className="flex h-full items-center justify-center text-xs text-[var(--twin-mute)]">
            左侧选择门组进行编辑，或点「新建门组」
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="grid shrink-0 grid-cols-1 gap-2 md:grid-cols-3">
              <div>
                <div className={adminLabelClass}>门组名称</div>
                <input
                  className={adminInputClass}
                  value={draft.name}
                  maxLength={64}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div>
                <div className={adminLabelClass}>所属组织</div>
                <select
                  className={adminInputClass}
                  value={draft.orgCode}
                  onChange={(e) => setDraft({ ...draft, orgCode: e.target.value })}
                >
                  <option value="">未指定</option>
                  {orgs.map((o) => (
                    <option key={o.code} value={o.code}>{o.name}（{o.code}）</option>
                  ))}
                </select>
              </div>
              <div>
                <div className={adminLabelClass}>备注</div>
                <input
                  className={adminInputClass}
                  value={draft.memo}
                  maxLength={255}
                  onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                />
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-1 shrink-0 text-xs font-medium text-[var(--twin-body)]">
                门禁通道（已配置 {draft.channelCodes.length}）
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <DahuaChannelListPicker
                  selected={draft.channelCodes}
                  onChange={(codes) => setDraft({ ...draft, channelCodes: codes })}
                  fetchChannels={fetchDahuaDoorChannels}
                  idPrefix="door-group-channel"
                  listMaxHeightClass="max-h-[34vh]"
                  showSelectAll
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-[var(--twin-hairline)] pt-2">
              <AdminButton onClick={() => saveMut.mutate(draft)} loading={saveMut.isPending}>
                保存门组
              </AdminButton>
              <AdminButton tone="ghost" onClick={() => setDraft(null)}>取消</AdminButton>
              {draft.id != null && (
                <AdminButton tone="destructive" className="ml-auto" onClick={() => onDelete(draft)} loading={deleteMut.isPending}>
                  删除门组
                </AdminButton>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
