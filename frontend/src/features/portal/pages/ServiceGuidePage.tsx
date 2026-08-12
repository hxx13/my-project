import { usePublicContents } from "@/api/hooks/usePortalContent";

export default function ServiceGuidePage() {
  const { data } = usePublicContents({ type: "PAGE", search: "服务指南", size: 1 });
  const page = data?.data?.[0];

  return (
    <div className="min-h-screen bg-[#f7f5f2]">
      <div className="max-w-4xl mx-auto px-5 md:px-12 py-20">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-600 uppercase mb-3">Guide</p>
          <h1 className="text-3xl font-extrabold text-neutral-900">{page?.title || "服务指南"}</h1>
          <p className="mt-4 text-[15px] text-neutral-600 max-w-3xl mx-auto leading-relaxed">
            {page?.summary || "实验动物使用流程与收费标准"}
          </p>
        </div>
        {page?.contentHtml ? (
          <div className="prose prose-neutral max-w-none text-neutral-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: page.contentHtml }} />
        ) : (
          <p className="text-neutral-400 text-center py-8">暂无内容</p>
        )}
      </div>
    </div>
  );
}
