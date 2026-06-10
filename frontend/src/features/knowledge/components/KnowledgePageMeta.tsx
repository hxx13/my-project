import type { KnowledgePage } from "@/features/knowledge/types";

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
}

export function KnowledgePageMeta({ page }: { page: KnowledgePage }) {
  return (
    <div className="mt-8 pt-4 border-t border-[var(--app-color-border-default)] text-[11px] text-[var(--app-color-text-tertiary)] font-mono">
      创建于 {fmt(page.createdAt)} · 最后修改 {fmt(page.updatedAt)} · v{page.version} · {page.author}
    </div>
  );
}
