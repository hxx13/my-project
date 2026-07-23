import { BookOpen, Folder, Tag, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  stats: { totalPages: number; totalCategories: number; totalTags: number; lastUpdated: string | null } | null;
  onSelectPage: (id: number) => void;
}

export function KnowledgeDashboard({ stats, onSelectPage }: Props) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-4 gap-3">
        <Stat icon={<BookOpen className="size-4" />} value={stats?.totalPages ?? "-"} label="文档" accent="text-[var(--app-color-accent)]" />
        <Stat icon={<Folder className="size-4" />} value={stats?.totalCategories ?? "-"} label="分类" accent="text-indigo-500" />
        <Stat icon={<Tag className="size-4" />} value={stats?.totalTags ?? "-"} label="标签" accent="text-emerald-500" />
        <Stat icon={<Clock className="size-4" />} value="-" label="最近更新" accent="text-amber-500" />
      </div>
      <div className="text-center text-sm text-[var(--app-color-text-tertiary)]">
        选择左侧目录浏览文档，或点击上方「新建」开始
      </div>
    </div>
  );
}

function Stat({ icon, value, label, accent }: { icon: React.ReactNode; value: string | number; label: string; accent: string }) {
  return (
    <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 text-center">
      <div className={cn("flex justify-center mb-1", accent)}>{icon}</div>
      <div className={cn("text-2xl font-bold font-mono", accent)}>{value}</div>
      <div className="text-[10px] text-[var(--app-color-text-tertiary)] mt-0.5">{label}</div>
    </div>
  );
}
