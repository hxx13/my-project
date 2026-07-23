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

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  editing: SwipeAlertRuleRow | null;
  onSaved: () => void;
  onCancel: () => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const OPEN_TYPE_OPTIONS = [
  { value: "52", label: "非法刷卡开门 (openType=52)" },
  { value: "0", label: "刷卡失败 (openResult=0)" },
];

const ROLE_OPTIONS = Object.entries(ROLE_LEVEL_MAP)
  .filter(([, level]) => level >= 3)
  .map(([role, level]) => ({ code: role, level, label: role }));

const TEMPLATE_VARS: { key: string; label: string; example: string }[] = [
  { key: "${dept}", label: "部门名称", example: "物理学院" },
  { key: "${channel}", label: "通道名称", example: "北门-3号通道" },
  { key: "${count}", label: "失败次数", example: "3" },
  { key: "${persons}", label: "涉及人员", example: "赵强、孙伟" },
  { key: "${windowMin}", label: "时间窗口(分钟)", example: "5" },
  { key: "${windowSec}", label: "时间窗口(秒)", example: "300" },
  { key: "${threshold}", label: "阈值次数", example: "3" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const inputBase =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus-visible:border-neutral-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25";

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return raw.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SwipeAlertRuleForm({ editing, onSaved, onCancel }: Props) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [openTypes, setOpenTypes] = useState("52");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [titleTemplate, setTitleTemplate] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [thresholdCount, setThresholdCount] = useState("3");
  const [thresholdWindowSec, setThresholdWindowSec] = useState("300");
  const [bannerDurationSec, setBannerDurationSec] = useState("10");
  const [minRoleLevel, setMinRoleLevel] = useState(4);
  const [cooldownSec, setCooldownSec] = useState("60");
  const [saving, setSaving] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setName(editing.name);
      setEnabled(editing.enabled);
      setOpenTypes(editing.openTypes);
      setSelectedDepts(parseJsonArray(editing.departments));
      setSelectedChannels(parseJsonArray(editing.channels));
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
      setSelectedDepts([]);
      setSelectedChannels([]);
      setTitleTemplate("🚨 刷卡失败告警 · ${dept}");
      setBodyTemplate("过去 ${windowMin} 分钟内 ${count} 次非法刷卡，涉及：${persons}");
      setThresholdCount("3");
      setThresholdWindowSec("300");
      setBannerDurationSec("10");
      setMinRoleLevel(4);
      setCooldownSec("60");
    }
  }, [editing]);

  /* ---- variable insertion ---- */
  const insertVar = (varKey: string, target: "title" | "body") => {
    if (target === "title" && titleRef.current) {
      const el = titleRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + varKey + el.value.slice(end);
      setTitleTemplate(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + varKey.length;
        el.setSelectionRange(pos, pos);
      });
    }
    if (target === "body" && bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const next = el.value.slice(0, start) + varKey + el.value.slice(end);
      setBodyTemplate(next);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + varKey.length;
        el.setSelectionRange(pos, pos);
      });
    }
  };

  /* ---- live preview ---- */
  const previewText = (tmpl: string) =>
    TEMPLATE_VARS.reduce((acc, v) => acc.replaceAll(v.key, v.example), tmpl);

  /* ---- build payload ---- */
  const buildBody = (): SwipeAlertRuleUpsert => ({
    name: name.trim(),
    enabled,
    channels: selectedChannels.length > 0 ? JSON.stringify(selectedChannels) : null,
    departments: selectedDepts.length > 0 ? JSON.stringify(selectedDepts) : null,
    openTypes,
    titleTemplate: titleTemplate.trim() || "🚨 刷卡失败告警",
    bodyTemplate: bodyTemplate.trim() || "",
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
      description="配置刷卡失败检测条件与灵动岛通知内容。点击变量标签插入到标题/正文光标位置。"
    >
      <div className="space-y-5">
        {/* ---- 基本信息 ---- */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-neutral-600">规则名称</label>
            <input
              className={`${inputBase} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：物理学院非法刷卡告警"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <AdminSwitchScaled size="sm" checked={enabled} onChange={setEnabled} />
              启用规则
            </label>
          </div>
        </div>

        {/* ---- 触发条件 ---- */}
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4 space-y-4">
          <p className="text-xs font-semibold text-neutral-700">触发条件</p>

          <div>
            <label className="text-xs font-medium text-neutral-600">开门类型</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {OPEN_TYPE_OPTIONS.map((opt) => {
                const checked = openTypes.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                      checked ? "border-red-300 bg-red-50 text-red-900" : "border-neutral-200 bg-white"
                    }`}
                  >
                    <AdminSwitchScaled
                      size="3.5"
                      checked={checked}
                      onChange={(nextChecked) => {
                        const set = new Set(openTypes.split(",").filter(Boolean));
                        nextChecked ? set.add(opt.value) : set.delete(opt.value);
                        setOpenTypes(Array.from(set).join(",") || "52");
                      }}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600">通道筛选（留空=全部通道）</label>
            <div className="mt-1.5">
              <ChannelMultiSelect selected={selectedChannels} onChange={setSelectedChannels} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600">部门筛选（留空=全部部门）</label>
            <div className="mt-1.5">
              <DepartmentMultiSelect selected={selectedDepts} onChange={setSelectedDepts} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-neutral-600">阈值次数</label>
              <input className={`${inputBase} mt-1`} type="number" min="1" value={thresholdCount} onChange={(e) => setThresholdCount(e.target.value)} />
              <p className="mt-0.5 text-[10px] text-neutral-400">窗口内达到此次数即触发</p>
            </div>
            <div>
              <label className="text-xs font-medium text-neutral-600">时间窗口（秒）</label>
              <input className={`${inputBase} mt-1`} type="number" min="10" value={thresholdWindowSec} onChange={(e) => setThresholdWindowSec(e.target.value)} />
              <p className="mt-0.5 text-[10px] text-neutral-400">如 300 = 5 分钟</p>
            </div>
          </div>
        </div>

        {/* ---- 通知内容 ---- */}
        <div className="rounded-lg border border-neutral-100 bg-neutral-50/50 p-4 space-y-4">
          <p className="text-xs font-semibold text-neutral-700">通知内容配置</p>

          <div>
            <label className="text-xs font-medium text-neutral-600">可用变量（点击插入到光标位置）</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {TEMPLATE_VARS.map((v) => (
                <span
                  key={v.key}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 cursor-pointer hover:bg-blue-100 transition select-none"
                  title={`插入 ${v.key}`}
                  onClick={() => {
                    const target: "title" | "body" =
                      document.activeElement === titleRef.current ? "title" : "body";
                    insertVar(v.key, target);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  {v.label}
                  <span className="font-mono text-[10px] text-blue-400">{v.key}</span>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600">通知标题</label>
            <input
              ref={titleRef}
              className={`${inputBase} mt-1 font-medium`}
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              placeholder="🚨 刷卡失败告警 · ${dept}"
            />
            <p className="mt-1 text-[10px] text-neutral-400">预览：{previewText(titleTemplate) || "（空）"}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-600">通知正文</label>
            <textarea
              ref={bodyRef}
              className={`${inputBase} mt-1 min-h-[88px] resize-y`}
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              placeholder="过去 ${windowMin} 分钟内 ${count} 次非法刷卡，涉及：${persons}"
            />
            <p className="mt-1 text-[10px] text-neutral-400">预览：{previewText(bodyTemplate) || "（空）"}</p>
          </div>
        </div>

        {/* ---- 横幅设置 ---- */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-neutral-600">横幅显示时长（秒，0=不自动消失）</label>
            <input className={`${inputBase} mt-1`} type="number" min="0" value={bannerDurationSec} onChange={(e) => setBannerDurationSec(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">冷却间隔（秒，防重复触发）</label>
            <input className={`${inputBase} mt-1`} type="number" min="0" value={cooldownSec} onChange={(e) => setCooldownSec(e.target.value)} />
          </div>
        </div>

        {/* ---- 通知角色 ---- */}
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
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    active ? "border-violet-300 bg-violet-50 text-violet-900" : "border-neutral-200 bg-white hover:border-violet-200"
                  }`}
                >
                  {opt.label}+
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- 操作 ---- */}
        <div className="flex gap-2 border-t border-neutral-100 pt-4">
          <AdminButton type="button" tone="primary" loading={saving} className="gap-1.5" onClick={() => void save()}>
            <Save className="h-4 w-4" />
            {editing ? "保存修改" : "创建规则"}
          </AdminButton>
          {editing ? <AdminButton type="button" tone="secondary" onClick={onCancel}>取消编辑</AdminButton> : null}
        </div>
      </div>
    </AdminFormCard>
  );
}
