import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import type { SupplyItem, SupplyCategory } from "@/api/domains/supplies.api";
import { useUpdateAdminSupplyItem } from "@/api/hooks/useSupplies";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { webImageSrc } from "@/utils/mediaUrl";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";

type SpecDimension = { name: string; options: string[] };

interface SuppliesItemEditDialogProps {
  item: SupplyItem;
  categories: SupplyCategory[];
  open: boolean;
  onClose: () => void;
}

export default function SuppliesItemEditDialog({ item, categories, open, onClose }: SuppliesItemEditDialogProps) {
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [shelfStatus, setShelfStatus] = useState(item.shelfStatus);
  const [stockMode, setStockMode] = useState(item.stockMode);
  const [coverUrl, setCoverUrl] = useState(item.coverUrl || "");
  const [uploading, setUploading] = useState(false);
  const [independentOrder, setIndependentOrder] = useState(item.independentOrder === 1);

  // Spec
  const [specEnabled, setSpecEnabled] = useState(false);
  const [specDimensions, setSpecDimensions] = useState<SpecDimension[]>([]);
  const [specRequired, setSpecRequired] = useState(false);

  const updateMut = useUpdateAdminSupplyItem();

  useEffect(() => {
    if (!open) return;
    setName(item.name);
    setCategoryId(item.categoryId);
    setShelfStatus(item.shelfStatus);
    setStockMode(item.stockMode);
    setCoverUrl(item.coverUrl || "");
    setIndependentOrder(item.independentOrder === 1);
    if (item.specSchema) {
      try {
        const parsed = JSON.parse(item.specSchema);
        setSpecEnabled(true);
        setSpecDimensions(parsed.dimensions || []);
        setSpecRequired(item.specRequired === 1);
      } catch {
        setSpecEnabled(false);
        setSpecDimensions([]);
        setSpecRequired(false);
      }
    } else {
      setSpecEnabled(false);
      setSpecDimensions([]);
      setSpecRequired(false);
    }
  }, [open, item]);

  if (!open || !item) return null;

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("请填写名称");
      return;
    }
    updateMut.mutate(
      {
        id: item.id,
        body: {
          categoryId,
          name: name.trim(),
          shelfStatus,
          stockMode,
          coverUrl: coverUrl || "",
          specSchema:
            specEnabled && specDimensions.length > 0
              ? JSON.stringify({
                  dimensions: specDimensions.filter(
                    (d) => d.name.trim() && d.options.filter((o) => o.trim()).length >= 2,
                  ),
                })
              : undefined,
          specRequired: specEnabled && specRequired ? 1 : 0,
          independentOrder: independentOrder ? 1 : 0,
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
        className="bg-[var(--twin-canvas)] rounded-twin-xl border border-[var(--twin-hairline)] shadow-twin-level-4 w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-[var(--twin-ink)]">编辑 {item.name}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--twin-mute)] hover:text-[var(--twin-ink)] text-lg"
          >
            &times;
          </button>
        </div>

        {/* 封面图 */}
        <div className="flex items-center gap-3">
          {coverUrl ? (
            <div className="flex items-center gap-2">
              <img
                src={webImageSrc(coverUrl) || coverUrl}
                alt=""
                className="h-16 w-16 object-cover rounded border"
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
            <label className={`rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-xs hover:bg-[var(--twin-canvas-soft)] ${uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
              {uploading ? "上传中…" : "上传封面"}
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

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--twin-mute)]">名称</span>
            <input
              className="w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1.5 text-sm text-[var(--twin-ink)] outline-none focus:ring-2 focus:ring-sky-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--twin-mute)]">分类</span>
            <select
              className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]"
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--twin-mute)]">状态</span>
            <select
              className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]"
              value={shelfStatus}
              onChange={(e) => setShelfStatus(e.target.value)}
            >
              <option value="ON_SHELF">上架</option>
              <option value="OFF_SHELF">下架</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--twin-mute)]">库存模式</span>
            <select
              className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-[var(--twin-ink)]"
              value={stockMode}
              onChange={(e) => setStockMode(e.target.value)}
            >
              <option value="QUANTIFIED">数量型</option>
              <option value="FLAG">有无型</option>
            </select>
          </label>

          {/* 规格配置 */}
          <label className="flex items-center gap-2 col-span-2 pt-2">
            <AdminSwitchScaled
              size="3.5"
              checked={specEnabled}
              onChange={(checked) => setSpecEnabled(checked)}
            />
            <span className="text-xs text-[var(--twin-body)]">启用规格</span>
          </label>
          <label className="flex items-center gap-2 col-span-2">
            <AdminSwitchScaled
              size="3.5"
              checked={independentOrder}
              onChange={(checked) => setIndependentOrder(checked)}
            />
            <span className="text-xs text-[var(--twin-body)]">
              独立下单（不能与其他物资合并下单）
            </span>
          </label>

          {specEnabled && (
            <div className="col-span-2 space-y-2 border border-[var(--twin-hairline)] rounded-twin-md p-3 bg-[var(--twin-canvas)]">
              <label className="flex items-center gap-2">
                <AdminSwitchScaled
                  size="3.5"
                  checked={specRequired}
                  onChange={(checked) => setSpecRequired(checked)}
                />
                <span className="text-xs text-[var(--twin-body)]">强制选择规格</span>
              </label>
              {specDimensions.map((dim, di) => (
                <div key={di} className="flex items-center gap-2 flex-wrap">
                  <input
                    className="w-20 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-xs text-[var(--twin-ink)]"
                    placeholder="维度名"
                    value={dim.name}
                    onChange={(e) => {
                      const next = [...specDimensions];
                      next[di] = { ...next[di], name: e.target.value };
                      setSpecDimensions(next);
                    }}
                  />
                  {dim.options.map((opt, oi) => (
                    <span
                      key={oi}
                      className="inline-flex items-center gap-1 bg-[var(--twin-canvas-soft)] border border-[var(--twin-hairline)] rounded-full px-2 py-0.5 text-xs"
                    >
                      <input
                        className="w-12 border-none bg-transparent text-xs text-[var(--twin-ink)] outline-none"
                        placeholder="选项"
                        value={opt}
                        onChange={(e) => {
                          const next = [...specDimensions];
                          next[di] = { ...next[di], options: [...next[di].options] };
                          next[di].options[oi] = e.target.value;
                          setSpecDimensions(next);
                        }}
                      />
                      <button
                        type="button"
                        className="text-[var(--twin-mute)] hover:text-red-500 leading-none"
                        onClick={() => {
                          const next = [...specDimensions];
                          next[di] = {
                            ...next[di],
                            options: next[di].options.filter((_, i) => i !== oi),
                          };
                          setSpecDimensions(next);
                        }}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-[var(--twin-link-deep)]"
                    onClick={() => {
                      const next = [...specDimensions];
                      next[di] = { ...next[di], options: [...next[di].options, ""] };
                      setSpecDimensions(next);
                    }}
                  >
                    + 选项
                  </button>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:text-red-600"
                    onClick={() => {
                      setSpecDimensions(specDimensions.filter((_, i) => i !== di));
                    }}
                  >
                    删除维度
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-[var(--twin-link-deep)]"
                onClick={() => {
                  setSpecDimensions([
                    ...specDimensions,
                    { name: "", options: ["", ""] },
                  ]);
                }}
              >
                + 添加维度
              </button>
            </div>
          )}
        </div>

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
