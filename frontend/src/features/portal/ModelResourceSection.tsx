import { cn } from "@/lib/utils";

const MOCK_STRAINS = [
  { name: "C57BL/6", count: 12, desc: "最常用近交系", color: "from-blue-500/20 to-blue-600/10" },
  { name: "BALB/c", count: 8, desc: "免疫学经典模型", color: "from-emerald-500/20 to-emerald-600/10" },
  { name: "免疫缺陷模型", count: 5, desc: "肿瘤移植研究", color: "from-amber-500/20 to-amber-600/10" },
  { name: "人源化模型", count: 3, desc: "临床前药物评价", color: "from-violet-500/20 to-violet-600/10" },
];

export function ModelResourceSection() {
  return (
    <section id="model-resource" className="py-20 px-6 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-[var(--app-color-text-primary)]">模型资源</h2>
        <p className="mt-3 text-[var(--app-color-text-secondary)] max-w-2xl mx-auto">
          涵盖基因编辑、免疫缺陷、人源化等多品系实验动物模型，支撑各类生命科学研究
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {MOCK_STRAINS.map((strain) => (
          <div
            key={strain.name}
            className="group relative overflow-hidden rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-6 hover:shadow-[var(--app-elevation-card)] transition-shadow"
          >
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-30", strain.color)} />
            <div className="relative">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold text-[var(--app-color-text-primary)]">{strain.name}</h3>
                <span className="text-xs font-mono text-[var(--app-color-accent-secondary)] bg-[var(--app-color-surface-page)] px-2 py-0.5 rounded-full">
                  {strain.count} 只
                </span>
              </div>
              <p className="mt-2 text-sm text-[var(--app-color-text-tertiary)]">{strain.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <a
          href="#"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--app-color-accent-secondary)] hover:underline"
        >
          查看全部模型资源 <span aria-hidden>→</span>
        </a>
      </div>
    </section>
  );
}
