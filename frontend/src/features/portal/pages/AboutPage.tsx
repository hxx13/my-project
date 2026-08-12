import { Building2, Users, Globe, BookOpen } from "lucide-react";
import { usePublicContents } from "@/api/hooks/usePortalContent";

const FALLBACK_STATS = [
  { value: "17,602", unit: "m²", label: "建筑面积", icon: Building2 },
  { value: "5.2", unit: "万笼", label: "设计笼位", icon: BookOpen },
  { value: "2,122", unit: "个", label: "基因编辑品系", icon: Users },
  { value: "302", unit: "个", label: "服务课题组", icon: Globe },
];

const ICON_MAP: Record<string, typeof Building2> = { Building2, Users, Globe, BookOpen };

function parseExt(page: { extensionJson?: Record<string, unknown> | null } | undefined): Record<string, unknown> {
  if (!page?.extensionJson) return {};
  return page.extensionJson as Record<string, unknown>;
}

export default function AboutPage() {
  const { data } = usePublicContents({ type: "PAGE", search: "关于我们", size: 1 });
  const page = data?.data?.[0];
  const ext = parseExt(page);

  // 统计数字：优先 extension_json.stats，fallback 到硬编码
  const rawStats = ext.stats as { label: string; value: string; unit: string; icon?: string }[] | undefined;
  const stats: { label: string; value: string; unit: string; icon: typeof Building2 }[] = rawStats?.length
    ? rawStats.map((s, i) => ({
        label: s.label,
        value: s.value,
        unit: s.unit,
        icon: (ICON_MAP[s.icon as string] as typeof Building2) || [Building2, BookOpen, Users, Globe][i] || Building2,
      }))
    : FALLBACK_STATS;

  // 内容分段：优先 extension_json.sections，fallback 到 contentHtml
  const sections: { heading: string; body: string }[] =
    (ext.sections as typeof sections | undefined) || [];

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <div className="max-w-4xl mx-auto px-5 md:px-12 py-20">
        <div className="text-center mb-16">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-600 uppercase mb-3">About Us</p>
          <h1 className="text-3xl font-extrabold text-neutral-900">{page?.title || "实验动物科学部"}</h1>
          <p className="mt-4 text-[15px] text-neutral-600 max-w-3xl mx-auto leading-relaxed">
            {page?.summary || "上海交通大学医学院实验动物科学部"}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="text-center p-6 rounded-2xl border border-neutral-200 bg-white hover:shadow-sm transition-shadow">
                <Icon className="size-5 text-amber-500 mx-auto mb-3" />
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-3xl font-bold text-neutral-900 tabular-nums">{stat.value}</span>
                  <span className="text-base text-neutral-400">{stat.unit}</span>
                </div>
                <p className="mt-1.5 text-sm text-neutral-500">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {sections.length > 0 ? (
          <div className="prose prose-neutral max-w-none space-y-6 text-neutral-600 leading-relaxed">
            {sections.map((sec, i) => (
              <div key={i}>
                <h2 className="text-xl font-bold text-neutral-900">{sec.heading}</h2>
                <p>{sec.body}</p>
              </div>
            ))}
          </div>
        ) : page?.contentHtml ? (
          <div className="prose prose-neutral max-w-none space-y-6 text-neutral-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: page.contentHtml }} />
        ) : (
          <div className="prose prose-neutral max-w-none space-y-6 text-neutral-600 leading-relaxed">
            <h2 className="text-xl font-bold text-neutral-900">依托平台</h2>
            <p>依托胚胎生物技术平台，保有 2,122 个基因编辑动物品系。坚持临床科研一体化，服务 302 个课题组及 13 家附属医院。</p>
            <h2 className="text-xl font-bold text-neutral-900">国际认证</h2>
            <p>全国高校唯一同时拥有 CNAS 和 AAALAC 国际认可的实验动物设施。</p>
          </div>
        )}
      </div>
    </div>
  );
}
