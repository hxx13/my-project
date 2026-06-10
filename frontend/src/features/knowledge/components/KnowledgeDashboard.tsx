import { BookOpen, Folder, Tag, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeStats, TagStats } from "@/features/knowledge/types";

interface Props {
  stats: KnowledgeStats | null;
  tags: TagStats[];
  recentPages: { id: number; title: string; version: number; updatedAt: string }[];
  onSelectPage: (id: number) => void;
  onSelectTag: (tag: string) => void;
  activeTag: string | null;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return `${Math.floor(days / 30)}月前`;
}

export function KnowledgeDashboard({ stats, tags, recentPages, onSelectPage, onSelectTag, activeTag }: Props) {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          icon={<BookOpen className="size-4" />}
          value={stats?.totalPages ?? "-"}
          label="文档总数"
          accent="text-[var(--app-color-accent)]"
        />
        <StatCard
          icon={<Folder className="size-4" />}
          value={stats?.totalCategories ?? "-"}
          label="分类数"
          accent="text-indigo-500"
        />
        <StatCard
          icon={<Tag className="size-4" />}
          value={stats?.totalTags ?? "-"}
          label="标签数"
          accent="text-emerald-500"
        />
        <StatCard
          icon={<Clock className="size-4" />}
          value={stats?.lastUpdated ? formatRelative(stats.lastUpdated) : "-"}
          label="最近更新"
          accent="text-amber-500"
        />
      </div>

      {/* Tag cloud */}
      {tags.length > 0 && (
        <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4">
          <h3 className="text-[11px] font-semibold text-[var(--app-color-text-tertiary)] uppercase tracking-wider mb-3 font-mono">
            标签云
          </h3>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => {
              const size = 10 + Math.min(tag.count / 10, 8);
              const isActive = activeTag === tag.name;
              const opacity = 0.05 + Math.min(tag.count / 100, 0.15);
              return (
                <button
                  key={tag.name}
                  onClick={() => onSelectTag(isActive ? null : tag.name)}
                  className="rounded-full px-2.5 py-0.5 font-mono transition-colors"
                  style={{
                    fontSize: `${size}px`,
                    background: isActive
                      ? "var(--app-color-accent)"
                      : `color-mix(in srgb, var(--app-color-accent) ${Math.round(opacity * 100)}%, transparent)`,
                    color: isActive ? "white" : "var(--app-color-text-secondary)",
                  }}
                >
                  {tag.name}
                  <span className="ml-1 opacity-50 text-[9px]">{tag.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent pages grid */}
      <div>
        <h3 className="text-[11px] font-semibold text-[var(--app-color-text-tertiary)] uppercase tracking-wider mb-3 font-mono">
          最近文档
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {recentPages.map(page => (
            <button
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3 text-left hover:bg-[var(--app-color-surface-hover)] transition-colors"
            >
              <h4 className="text-sm font-medium text-[var(--app-color-text-primary)] truncate">{page.title}</h4>
              <div className="mt-2 flex items-center gap-2 text-[9px] text-[var(--app-color-text-tertiary)] font-mono">
                <span>v{page.version}</span>
                <span>·</span>
                <span>{formatRelative(page.updatedAt)}</span>
              </div>
            </button>
          ))}
          {recentPages.length === 0 && (
            <div className="col-span-3 py-12 text-center text-sm text-[var(--app-color-text-tertiary)]">
              暂无文档，点击上方"新建"开始
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, value, label, accent }: {
  icon: React.ReactNode; value: string | number; label: string; accent: string;
}) {
  return (
    <div className="rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3 text-center">
      <div className={cn("flex justify-center mb-1", accent)}>{icon}</div>
      <div className={cn("text-xl font-bold font-mono", accent)}>{value}</div>
      <div className="text-[10px] text-[var(--app-color-text-tertiary)]">{label}</div>
    </div>
  );
}
