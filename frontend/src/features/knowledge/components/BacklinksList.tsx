import { useQuery } from "@tanstack/react-query";
import { fetchPageBacklinks } from "@/api/domains/knowledge.api";

interface Props { pageId: number; onSelectPage: (id: number) => void }

export function BacklinksList({ pageId, onSelectPage }: Props) {
  const { data } = useQuery({
    queryKey: ["knowledge", "backlinks", pageId],
    queryFn: () => fetchPageBacklinks(pageId),
    staleTime: 2 * 60 * 1000,
    enabled: !!pageId,
  });
  if (!data?.length) return null;
  return (
    <div className="mt-4 pt-3 border-t border-[var(--app-color-border-default)]">
      <h4 className="text-[10px] font-semibold text-[var(--app-color-text-tertiary)] uppercase tracking-wider mb-2 font-mono">🔗 反向链接 · {data.length}</h4>
      {data.map(bl => (
        <button key={bl.pageId} onClick={() => onSelectPage(bl.pageId)} className="block w-full text-left text-[11px] text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-accent)] py-0.5 truncate font-mono">
          <span className={bl.type === "manual" ? "text-emerald-500" : "text-amber-500"}>●</span> {bl.title}
        </button>
      ))}
    </div>
  );
}
