const STATS = [
  { value: "2006", unit: "年", label: "成立时间" },
  { value: "16,563", unit: "+", label: "引用文献" },
  { value: "10,700", unit: "+", label: "客户单位" },
  { value: "100", unit: "+", label: "合作国家和地区" },
];

export function AboutSection() {
  return (
    <section id="about" className="py-20 px-6 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-[var(--app-color-text-primary)]">关于我们</h2>
        <p className="mt-3 text-[var(--app-color-text-secondary)] max-w-3xl mx-auto">
          上海交通大学医学院实验动物科学部致力于为科研人员提供高质量的实验动物模型与技术服务，
          依托AI驱动的数字化孪生平台，实现从模型资源、笼架管理到数据统计的全链条数字化。
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-3xl mx-auto">
        {STATS.map((stat) => (
          <div key={stat.label} className="text-center p-6">
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-3xl font-bold text-[var(--app-color-text-primary)]">{stat.value}</span>
              <span className="text-lg text-[var(--app-color-text-tertiary)]">{stat.unit}</span>
            </div>
            <p className="mt-1 text-sm text-[var(--app-color-text-tertiary)]">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <a
          href="#"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--app-color-accent-secondary)] hover:underline"
        >
          查看详情 <span aria-hidden>→</span>
        </a>
      </div>
    </section>
  );
}
