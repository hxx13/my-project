import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import type { SupplyCategory } from "@/api/domains/supplies.api";
import { useUpdateAdminSupplyCategory } from "@/api/hooks/useSupplies";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { webImageSrc } from "@/utils/mediaUrl";

interface SuppliesCategoryEditDialogProps {
  category: SupplyCategory;
  open: boolean;
  onClose: () => void;
}

export default function SuppliesCategoryEditDialog({
  category,
  open,
  onClose,
}: SuppliesCategoryEditDialogProps) {
  const [name, setName] = useState(category?.name || "");
  const [coverUrl, setCoverUrl] = useState(category?.coverUrl || "");
  const [uploading, setUploading] = useState(false);

  const updateMut = useUpdateAdminSupplyCategory();

  useEffect(() => {
    if (!open || !category) return;
    setName(category.name);
    setCoverUrl(category.coverUrl || "");
  }, [open, category]);

  if (!open || !category) return null;

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("请填写分类名称");
      return;
    }
    updateMut.mutate(
      {
        id: category.id,
        body: {
          name: name.trim(),
          coverUrl: coverUrl || "",
          status: category.status,
          sortOrder: category.sortOrder,
        },
      },
      { onSuccess: () => onClose() },
    );
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadSingleImage(file);
      setCoverUrl(result.publicUrl);
    } catch (err: any) {
      toast.error(err?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--twin-canvas)] rounded-twin-xl border border-[var(--twin-hairline)] shadow-twin-level-4 w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-[var(--twin-ink)]">编辑分类</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] text-lg"
          >
            &times;
          </button>
        </div>

        {/* 封面图 */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-[var(--twin-body)]">封面图</span>
          <div className="flex items-center gap-3">
            {coverUrl ? (
              <div className="flex items-center gap-2">
                <img
                  src={webImageSrc(coverUrl) || coverUrl}
                  alt=""
                  className="h-24 w-24 object-cover rounded-lg border"
                />
                <button
                  type="button"
                  className="text-xs text-red-500"
                  onClick={() => setCoverUrl("")}
                >
                  移除
                </button>
              </div>
            ) : (
              <label className={`flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)] hover:border-[var(--twin-link)] hover:text-[var(--twin-link)] transition-colors ${uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                {uploading ? (
                  <span className="text-xs">…</span>
                ) : (
                  <span className="text-2xl leading-none">+</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await handleImageUpload(f);
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {/* 名称 */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--twin-body)]">分类名称</span>
          <input
            className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 text-sm text-[var(--twin-ink)] outline-none focus:ring-2 focus:ring-sky-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="分类名称"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-[var(--twin-hairline)]">
          <button
            type="button"
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-4 py-1.5 text-sm text-[var(--twin-body)]"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-twin-sm bg-[var(--twin-ink)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            onClick={handleSave}
            disabled={updateMut.isPending || uploading}
          >
            {updateMut.isPending ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
