import { useEffect, useState, useMemo } from "react";
import { ArrowRightLeft, Users, Building2, TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { CountUp } from "@/components/count-up";
import { fetchPortalStats, type PortalStats, type PortalLineChart } from "@/api/domains/publicSite.api";
import { cn } from "@/lib/utils";

function AnimateNumber({ value, className }: { value: number; className?: string }) {
  return (
    <CountUp
      from={0}
      to={value}
      separator=","
      direction="up"
      duration={2.2}
      className={cn("tabular-nums", className)}
    />
  );
}

export function PortalStatsSection() {
  const [stats, setStats] = useState<PortalStats | null>(null);

  useEffect(() => {
    fetchPortalStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const pudongTotal = stats?.pudongTotal ?? 0;
  const puxiTotal = stats?.puxiTotal ?? 0;
  const cumulative = stats?.totalEnter ?? 0;
  const lineChart = stats?.lineChart;

  const chartData = useMemo(() => {
    if (!lineChart?.times?.length) return [];
    return lineChart.times.map((t, i) => ({
      time: t,
      浦东: lineChart.pudong?.[i] ?? 0,
      浦西: lineChart.puxi?.[i] ?? 0,
    }));
  }, [lineChart]);

  return (
    <section className="min-h-screen flex items-center relative overflow-hidden bg-gradient-to-b from-white via-amber-50/30 to-white py-24 px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-[3px] rounded-full bg-amber-500/40" />

      <div className="max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 border border-amber-200/60 text-[11px] font-semibold tracking-[0.15em] text-amber-700 uppercase mb-4">
            <ArrowRightLeft className="size-3" />
            今日进出统计
          </div>
        </div>

        {/* Main stat: cumulative */}
        <div className="text-center mb-12">
          <p className="text-sm text-neutral-400 tracking-[0.1em] mb-2">累计进入次数</p>
          <div className="text-6xl font-black text-neutral-900 tracking-tight">
            <AnimateNumber value={cumulative} />
          </div>
        </div>

        {/* Campus split cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-2xl mx-auto mb-12">
          <div className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 hover:shadow-md hover:border-amber-200 transition-all duration-200">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-start gap-4">
              <div className="size-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Building2 className="size-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-[0.1em] text-neutral-400 uppercase">浦东校区</p>
                <div className="mt-1 text-3xl font-bold text-neutral-900">
                  <AnimateNumber value={pudongTotal} />
                </div>
                <p className="mt-1 text-[12px] text-neutral-400 flex items-center gap-1">
                  <Users className="size-3" /> 今日进入人次
                </p>
              </div>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 hover:shadow-md hover:border-amber-200 transition-all duration-200">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-50/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative flex items-start gap-4">
              <div className="size-11 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                <Building2 className="size-5 text-orange-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-[0.1em] text-neutral-400 uppercase">浦西校区</p>
                <div className="mt-1 text-3xl font-bold text-neutral-900">
                  <AnimateNumber value={puxiTotal} />
                </div>
                <p className="mt-1 text-[12px] text-neutral-400 flex items-center gap-1">
                  <Users className="size-3" /> 今日进入人次
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Peak hour line chart */}
        {chartData.length > 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="size-4 text-amber-500" />
              <span className="text-sm font-semibold text-neutral-700">今日进出高峰曲线</span>
              <span className="text-[11px] text-neutral-400 ml-auto">7:00 — 20:00</span>
            </div>
            <div className="flex items-center justify-center gap-5 mb-2 text-[11px] text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-amber-500" /> 浦东
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-orange-500" /> 浦西
              </span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPd" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d97706" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#d97706" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="colorPx" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ea580c" stopOpacity={0.15} />
                    <stop offset="100%" stopColor="#ea580c" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: "#a3a3a3" }} tickLine={false} axisLine={false} interval={3} />
                <YAxis tick={{ fontSize: 10, fill: "#a3a3a3" }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e5e5e5",
                    boxShadow: "0 4px 12px rgba(0,0,0,.06)",
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="浦东" stroke="#d97706" strokeWidth={2} fill="url(#colorPd)" dot={false} activeDot={{ r: 3, fill: "#d97706", stroke: "#fff", strokeWidth: 2 }} />
                <Area type="monotone" dataKey="浦西" stroke="#ea580c" strokeWidth={2} fill="url(#colorPx)" dot={false} activeDot={{ r: 3, fill: "#ea580c", stroke: "#fff", strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
