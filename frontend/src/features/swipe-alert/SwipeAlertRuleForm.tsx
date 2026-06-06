import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Save } from "lucide-react";
import {
  createSwipeAlertRule,
  updateSwipeAlertRule,
  type SwipeAlertRuleRow,
  type SwipeAlertRuleUpsert,
} from "@/api/domains/swipeAlert.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { ROLE_LEVEL_MAP } from "@/features/auth/roleAccess";

interface Props {
  editing: SwipeAlertRuleRow | null;
  onSaved: () => void;
  onCancel: () => void;
}

const OPEN_TYPE_OPTIONS = [
  { value: "52", label: "非法刷卡开门 (openType=52)" },
  { value: "0", label: "刷卡失败 (openResult=0)" },
];

const inputBase =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

const ROLE_OPTIONS = Object.entries(ROLE_LEVEL_MAP)
  .filter(([, level]) => level >= 3)
  .map(([role, level]) => ({ code: role, level, label: role }));

export function SwipeAlertRuleForm({ editing, onSaved, onCancel }: Props) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [openTypes, setOpenTypes] = useState("52");
  const [departments, setDepartments] = useState("");
  const [titleTemplate, setTitleTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [thresholdCount, setThresholdCount] = useState("3");
  const [thresholdWindowSec, setThresholdWindowSec] = useState("300");
  const [bannerDurationSec, setBannerDurationSec] = useState("10");
  const [minRoleLevel, setMinRoleLevel] = useState(4);
  const [cooldownSec, setCooldownSec] = useState("60");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setEnabled(editing.enabled);
      setOpenTypes(editing.openTypes);
      setDepartments(
        editing.departments ? (() => { try { return JSON.parse(editing.departments).join("、"); } catch { return editing.departments; } })() : ""
      );
      setTitleTemplate(editing.titleTemplate);
      setBodyTemplate(editing.bodyTemplate);
      setThresholdCount(String(editing.thresholdCount));
      setThresholdWindowSec(String(editing.thresholdWindowSec));
      setBannerDurationSec(String(editing.bannerDurationSec));
      setMinRoleLevel(editing.minRoleLevel);
      setCooldownSec(String(editing.cooldownSec));
    } else {
      setName("");
      setEnabled(true);
      setOpenTypes("52");
      setDepartments("");
      setTitleTemplate("🚨 刷卡失败告警 · ${dept}");
      setBodyTemplate("过去 ${windowMin} 分钟内 ${count} 次非法刷卡，涉及：${persons}");
      setThresholdCount("3");
      setThresholdWindowSec("300");
      setBannerDurationSec("10");
      setMinRoleLevel(4);
      setCooldownSec("60");
    }
  }, [editing]);

  const buildBody = (): SwipeAlertRuleUpsert => ({
    name: name.trim(),
    enabled,
    channels: null,
    departments: departments.trim()
      ? JSON.stringify(departments.split(/[、,，]/).map((s) => s.trim()).filter(Boolean))
      : null,
    openTypes,
    titleTemplate: titleTemplate.trim() || "🚨 刷卡失败告警 · ${dept}",
    bodyTemplate: bodyTemplate.trim() || "过去 ${windowMin} 分钟内 ${count} 次非法刷卡",
    thresholdCount: Math.max(1, Number(thresholdCount) || 3),
    thresholdWindowSec: Math.max(10, Number(thresholdWindowSec) || 300),
    bannerDurationSec: Math.max(0, Number(bannerDurationSec) || 10),
    minRoleLevel,
    cooldownSec: Math.max(0, Number(cooldownSec) || 60),
  });

  const save = async () => {
    if (!name.trim()) { toast.error("请填写规则名称"); return; }
    setSaving(true);
    try {
      const body = buildBody();
      if (editing?.id) {
        await updateSwipeAlertRule(editing.id, body);
        toast.success("规则已更新");
      } else {
        await createSwipeAlertRule(body);
        toast.success("规则已创建");
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormCard
      title={editing ? `编辑规则 · ${editing.name}` : "新建告警规则"}
      description={`配置刷卡失败检测条件与灵动岛通知内容。模板变量：\${count} \${dept} \${channel} \${persons} \${windowSec} \${windowMin} \${threshold}`}
    >
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="text-xs font-medium text-neutral-600">规则名称</label>
          <input className={`${inputBase} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：物理学院非法刷卡告警" />
        </div>

        {/* Enabled */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          启用规则
        </label>

        {/* Departments */}
        <div>
          <label className="text-xs font-medium text-neutral-600">部门筛选（逗号或顿号分隔，留空=全部）</label>
          <input className={`${inputBase} mt-1`} value={departments} onChange={(e) => setDepartments(e.target.value)} placeholder="例如：物理学院、计算机学院" />
        </div>

        {/* Open types */}
        <div>
          <label className="text-xs font-medium text-neutral-600">触发开门类型</label>
          <div className="mt-1.5 flex gap-3">
            {OPEN_TYPE_OPTIONS.map((opt) => {
              const checked = openTypes.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${checked ? "border-red-300 bg-red-50 text-red-900" : "border-neutral-200 bg-white"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const set = new Set(openTypes.split(",").filter(Boolean));
                      e.target.checked ? set.add(opt.value) : set.delete(opt.value);
                      setOpenTypes(Array.from(set).join(",") || "52");
                    }}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </div>

        {/* Threshold */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600">阈值次数</label>
            <input className={`${inputBase} mt-1`} type="number" min="1" value={thresholdCount} onChange={(e) => setThresholdCount(e.target.value)} />
            <p className="mt-0.5 text-[10px] text-neutral-400">窗口内达到此次数即触发</p>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">时间窗口（秒）</label>
            <input className={`${inputBase} mt-1`} type="number" min="10" value={thresholdWindowSec} onChange={(e) => setThresholdWindowSec(e.target.value)} />
            <p className="mt-0.5 text-[10px] text-neutral-400">滑动窗口，如 300 = 5 分钟</p>
          </div>
        </div>

        {/* Banner duration */}
        <div>
          <label className="text-xs font-medium text-neutral-600">横幅显示时长（秒，0=不自动消失）</label>
          <input className={`${inputBase} mt-1`} type="number" min="0" value={bannerDurationSec} onChange={(e) => setBannerDurationSec(e.target.value)} />
        </div>

        {/* Title template */}
        <div>
          <label className="text-xs font-medium text-neutral-600">通知标题模板</label>
          <input className={`${inputBase} mt-1`} value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} />
        </div>

        {/* Body template */}
        <div>
          <label className="text-xs font-medium text-neutral-600">通知正文模板</label>
          <textarea className={`${inputBase} mt-1 min-h-[80px] resize-y`} value={bodyTemplate} onChange={(e) => setBodyTemplate(e.target.value)} />
        </div>

        {/* Min role */}
        <div>
          <label className="text-xs font-medium text-neutral-600">最低通知角色</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((opt) => {
              const active = opt.level === minRoleLevel;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setMinRoleLevel(opt.level)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${active ? "border-violet-300 bg-violet-50 text-violet-900" : "border-neutral-200 bg-white hover:border-violet-200"}`}
                >
                  {opt.label}+
                </button>
              );
            })}
          </div>
        </div>

        {/* Cooldown */}
        <div>
          <label className="text-xs font-medium text-neutral-600">冷却间隔（秒，防止重复触发）</label>
          <input className={`${inputBase} mt-1`} type="number" min="0" value={cooldownSec} onChange={(e) => setCooldownSec(e.target.value)} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-neutral-100 pt-4">
          <AdminButton type="button" tone="primary" loading={saving} className="gap-1.5" onClick={() => void save()}>
            <Save className="h-4 w-4" />
            {editing ? "保存修改" : "创建规则"}
          </AdminButton>
          {editing ? (
            <AdminButton type="button" tone="secondary" onClick={onCancel}>取消编辑</AdminButton>
          ) : null}
        </div>
      </div>
    </AdminFormCard>
  );
}
