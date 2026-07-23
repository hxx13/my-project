import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAccessCleanRuleProfiles, type AccessCleanRuleProfile } from "@/api/domains/accessFusion.api";

type Props = {
  value: number;
  onChange: (id: number) => void;
};

export function StatsTaskCleanRuleProfileSelect({ value, onChange }: Props) {
  const [profiles, setProfiles] = useState<AccessCleanRuleProfile[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setProfiles(await listAccessCleanRuleProfiles());
      } catch {
        setProfiles([]);
      }
    })();
  }, []);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-slate-700">清洗规则方案</span>
      <select
        className="h-9 rounded border px-2 bg-white text-xs"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={0}>标准纳入（推荐）— 未绑定时自动使用</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <p className="text-[10px] text-slate-500 leading-relaxed">
        选择去抖、映射、进出方向等<strong>规则参数</strong>。是否自动入库由下方「拉取后自动清洗」任务开关控制。
        <Link
          to="/console/admin/dahua-swing-tasks?tab=clean&profiles=1"
          className="ml-1 text-indigo-700 underline"
        >
          管理方案
        </Link>
      </p>
    </label>
  );
}
