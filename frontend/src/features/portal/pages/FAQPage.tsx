import { usePublicContents } from "@/api/hooks/usePortalContent";

function parseFaqs(page: { extensionJson?: Record<string, unknown> | null; contentHtml?: string | null } | undefined): { q: string; a: string }[] {
  // 优先 extension_json.faqs
  if (page?.extensionJson) {
    const ext = page.extensionJson as Record<string, unknown>;
    if (Array.isArray(ext.faqs) && ext.faqs.length > 0) {
      return (ext.faqs as Array<{ question: string; answer: string }>).map((f) => ({ q: f.question, a: f.answer }));
    }
  }
  // fallback: 从 contentHtml 中提取 FAQ 条目（h3+p 模式）
  const raw = page?.contentHtml || "";
  const faqs: { q: string; a: string }[] = [];
  const re = /<h3>(.*?)<\/h3>\s*<p>(.*?)<\/p>/gi;
  let m;
  while ((m = re.exec(raw)) !== null) {
    faqs.push({ q: m[1], a: m[2] });
  }
  return faqs;
}

export default function FAQPage() {
  const { data } = usePublicContents({ type: "PAGE", search: "常见问题", size: 1 });
  const page = data?.data?.[0];
  const faqs = parseFaqs(page);

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <div className="max-w-3xl mx-auto px-5 md:px-12 py-20">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-600 uppercase mb-3">FAQ</p>
          <h1 className="text-3xl font-extrabold text-neutral-900">{page?.title || "常见问题"}</h1>
          <p className="mt-4 text-[15px] text-neutral-600">{page?.summary || "使用帮助与常见问题解答"}</p>
        </div>
        {faqs.length > 0 ? (
          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <details key={i} className="group bg-white border border-neutral-200 rounded-2xl overflow-hidden shadow-sm">
                <summary className="px-6 py-5 cursor-pointer font-semibold text-neutral-800 hover:text-amber-600 transition-colors list-none flex items-center justify-between">
                  {faq.q}
                  <span className="text-neutral-300 group-open:rotate-180 transition-transform text-lg">▾</span>
                </summary>
                <div className="px-6 pb-5 text-sm text-neutral-600 leading-relaxed border-t border-neutral-100 pt-4">
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="text-neutral-400 text-sm text-center py-8">暂无常见问题</p>
        )}
      </div>
    </div>
  );
}
