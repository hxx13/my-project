import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Save } from "lucide-react";
import {
  createSwipeAlertRule,
  updateSwipeAlertRule,
  type SwipeAlertRuleRow,
  type SwipeAlertRuleUpsert,
} from "@/api/domains/swipeAlert.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { ROLE_LEVEL_MAP } from "@/features/auth/roleAccess";
import { DepartmentMultiSelect } from "@/features/swipe-alert/DepartmentMultiSelect";
import { ChannelMultiSelect } from "@/features/swipe-alert/ChannelMultiSelect";

interface Props {
  editing: SwipeAlertRuleRow | null;
  onSaved: () => void;
  onCancel: () => void;
}

const inputBase =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

const labelClass = "text-xs font-medium text-neutral-600";
const sectionClass = "rounded-lg border border-neutral-100 bg-neutral-50/50 p-4 space-y-3";

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; }
  catch { return raw.split(/[,，、]/).map(s => s.trim()).filter(Boolean); }
}

export function SwipeAlertRuleForm({ editing, onSaved, onCancel }: Props) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [openTypes] = useState("52"); // always 52
  const [notifySite, setNotifySite] = useState(true);
  const [notifyPush, setNotifyPush] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [thresholdCount, setThresholdCount] = useState("3");
  const [thresholdWindowSec, setThresholdWindowSec] = useState("300");
  const [bannerDurationSec, setBannerDurationSec] = useState("10");
  const [cooldownSec, setCooldownSec] = useState("60");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setEnabled(editing.enabled);
      setNotifySite(editing.notifySite ?? true);
      setNotifyPush(editing.notifyPush ?? false);
      setSelectedDepts(parseJsonArray(editing.departments));
      setSelectedChannels(parseJsonArray(editing.channels));
      setThresholdCount(String(editing.thresholdCount));
      setThresholdWindowSec(String(editing.thresholdWindowSec));
      setBannerDurationSec(String(editing.bannerDurationSec));
      setCooldownSec(String(editing.cooldownSec));
    } else {
      setName(""); setEnabled(true); setNotifySite(true); setNotifyPush(false);
      setSelectedDepts([]); setSelectedChannels([]);
      setThresholdCount("3"); setThresholdWindowSec("300");
      setBannerDurationSec("10"); setCooldownSec("60");
    }
  }, [editing]);

  const buildBody = (): SwipeAlertRuleUpsert => ({
    name: name.trim(), enabled, openTypes: "52",
    channels: selectedChannels.length > 0 ? JSON.stringify(selectedChannels) : null,
    departments: selectedDepts.length > 0 ? JSON.stringify(selectedDepts) : null,
    titleTemplate: "🚨 刷卡失败告警",
    bodyTemplate: "",
    thresholdCount: Math.max(1, Number(thresholdCount) || 3),
    thresholdWindowSec: Math.max(10, Number(thresholdWindowSec) || 300),
    bannerDurationSec: Math.max(0, Number(bannerDurationSec) || 10),
    minRoleLevel: 4, cooldownSec: Math.max(0, Number(cooldownSec) || 60),
    notifySite, notifyPush,
  });

  const save = async () => {
    if (!name.trim()) { toast.error("请填写规则名称"); return; }
    setSaving(true);
    try {
      const body = buildBody();
      if (editing?.id) { await updateSwipeAlertRule(editing.id, body); toast.success("已更新"); }
      else { await createSwipeAlertRule(body); toast.success("已创建"); }
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "保存失败"); }
    finally { setSaving(false); }
  };

  return (
    <AdminFormCard
      title={editing ? `编辑规则 · ${editing.name}` : "新建告警规则"}
      description="非法刷卡（openType=52）在时间窗口内达到阈值后触发通知"
    >
      <div className="space-y-4">
        {/* 基本信息 */}
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className={labelClass}>规则名称</label>
            <input className={`${inputBase} mt-1`} value={name}
              onChange={e => setName(e.target.value)} placeholder="例：A区主门禁非法刷卡告警" />
          </div>
          <label className="flex items-center gap-2 pb-1">
            <AdminSwitchScaled size="sm" checked={enabled} onChange={setEnabled} />
            <span className="text-xs font-medium text-neutral-600">启用</span>
          </label>
        </div>

        {/* 通知开关 */}
        <div className={sectionClass}>
          <p className="text-xs font-semibold text-neutral-700">通知方式</p>
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <AdminSwitchScaled size="sm" checked={notifySite} onChange={setNotifySite} />
              <span className="text-xs text-neutral-600">站内横幅（灵动岛）</span>
            </label>
            <label className="flex items-center gap-2">
              <AdminSwitchScaled size="sm" checked={notifyPush} onChange={setNotifyPush} />
              <span className="text-xs text-neutral-600">站外推送（邮件/微信）</span>
            </label>
          </div>
        </div>

        {/* 触发条件 */}
        <div className={sectionClass}>
          <p className="text-xs font-semibold text-neutral-700">触发条件</p>
          <div>
            <label className={labelClass}>通道筛选（留空=全部）</label>
            <div className="mt-1"><ChannelMultiSelect selected={selectedChannels} onChange={setSelectedChannels} /></div>
          </div>
          <div>
            <label className={labelClass}>部门筛选（留空=全部）</label>
            <div className="mt-1"><DepartmentMultiSelect selected={selectedDepts} onChange={setSelectedDepts} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>阈值次数</label>
              <input className={`${inputBase} mt-1`} type="number" min="1" value={thresholdCount} onChange={e => setThresholdCount(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>时间窗口（秒）</label>
              <input className={`${inputBase} mt-1`} type="number" min="10" value={thresholdWindowSec} onChange={e => setThresholdWindowSec(e.target.value)} />
            </div>
          </div>
        </div>

        {/* 横幅 + 冷却 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>横幅显示时长（秒，0=不消失）</label>
            <input className={`${inputBase} mt-1`} type="number" min="0" value={bannerDurationSec} onChange={e => setBannerDurationSec(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>冷却间隔（秒）</label>
            <input className={`${inputBase} mt-1`} type="number" min="0" value={cooldownSec} onChange={e => setCooldownSec(e.target.value)} />
          </div>
        </div>

        {/* 操作 */}
        <div className="flex gap-2 border-t border-neutral-100 pt-4">
          <AdminButton type="button" tone="primary" loading={saving} onClick={() => void save()}>
            <Save className="h-4 w-4" />{editing ? "保存修改" : "创建规则"}
          </AdminButton>
          {editing && <AdminButton type="button" tone="secondary" onClick={onCancel}>取消</AdminButton>}
        </div>
      </div>
    </AdminFormCard>
  );
}
