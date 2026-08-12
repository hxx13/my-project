import { useMemo } from "react";
import { useAdminContents, useCreateContent, useUpdateContent, useDeleteContent } from "@/api/hooks/usePortalContent";
import type { PortalContentView } from "@/api/domains/portalContent.api";

/** 按 page_key 加载所有版本（DRAFT + PUBLISHED），提供版本管理操作 */
export function usePageVersions(pageKey: string) {
  const { data: pageData, isFetching } = useAdminContents({ type: "PAGE", size: 100 });
  const createMut = useCreateContent();
  const updateMut = useUpdateContent();
  const deleteMut = useDeleteContent();

  const versions = useMemo(() => {
    const all = (pageData?.data ?? []).filter((row) => {
      try {
        const ext = typeof row.extensionJson === "string"
          ? JSON.parse(row.extensionJson)
          : (row.extensionJson as Record<string, unknown> | null);
        return (ext as Record<string, unknown>)?.page_key === pageKey;
      } catch {
        return false;
      }
    });
    // 已发布排最前，然后按更新时间倒序
    return all.sort((a, b) => {
      if (a.status === "PUBLISHED" && b.status !== "PUBLISHED") return -1;
      if (b.status === "PUBLISHED" && a.status !== "PUBLISHED") return 1;
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    });
  }, [pageData, pageKey]);

  const published = versions.find((v) => v.status === "PUBLISHED") ?? null;

  /** 从某个版本复制创建新的草稿 */
  const createDraft = (base: PortalContentView, onDone?: (id: number) => void) => {
    const body = {
      contentType: "PAGE" as const,
      title: base.title,
      summary: base.summary,
      contentHtml: base.contentHtml,
      status: "DRAFT" as const,
      extensionJson: base.extensionJson,
    };
    createMut.mutate(body, {
      onSuccess: (created) => { onDone?.(created.id); },
    });
  };

  /** 发布指定版本（其他同 page_key 版本改为草稿） */
  const publishVersion = (versionId: number) => {
    // 先发布目标
    updateMut.mutate({ id: versionId, body: { status: "PUBLISHED" as const } }, {
      onSuccess: () => {
        // 其他已发布版本改为草稿
        versions.forEach((v) => {
          if (v.id !== versionId && v.status === "PUBLISHED") {
            updateMut.mutate({ id: v.id, body: { status: "DRAFT" as const } });
          }
        });
      },
    });
  };

  /** 删除一个草稿版本 */
  const deleteVersion = (versionId: number) => {
    if (!confirm("确定删除此版本？")) return;
    deleteMut.mutate(versionId);
  };

  return { versions, published, isFetching, createDraft, publishVersion, deleteVersion, createMut, updateMut };
}
