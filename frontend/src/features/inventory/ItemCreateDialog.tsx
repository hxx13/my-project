/**
 * ItemCreateDialog — 新建物品（完整表单）
 *
 * 字段：名称(必填) / RFID 码 / 分类 / 空间 / 粒度 / 数量 / 图标 / 品牌 / 型号 / 规格 / 供应商 / 有效期。
 * 由父级条件渲染（每次打开全新挂载），defaultSpaceId 预填空间。
 */

import { useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import {
  createItem,
  fetchCategoryTree,
  fetchSpaceTree,
  type CategoryNode,
  type SpaceNode,
} from "@/api/domains/inventory.api";
import { Portal } from "@/components/Portal";
import { uploadSingleImage } from "@/api/domains/upload.api";
import IconPicker from "./IconPicker";
import { isUrl } from "./ItemIcon";

function flattenCategory(nodes: CategoryNode[], depth = 0): Array<{ value: number; label: string }> {
  const out: Array<{ value: number; label: string }> = [];
  for (const n of nodes) {
    out.push({ value: n.id, label: `${"　".repeat(depth)}${n.name}` });
    if (n.children?.length) out.push(...flattenCategory(n.children, depth + 1));
  }
  return out;
}

function flattenSpace(nodes: SpaceNode[], depth = 0): Array<{ value: number; label: string }> {
  const out: Array<{ value: number; label: string }> = [];
  for (const n of nodes) {
    out.push({ value: n.id, label: `${"　".repeat(depth)}${n.name}` });
    if (n.children?.length) out.push(...flattenSpace(n.children, depth + 1));
  }
  return out;
}

const fieldClass = "rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]";

export default function ItemCreateDialog(props: {
  defaultSpaceId?: number | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { defaultSpaceId, onClose, onChanged } = props;

  const [name, setName] = useState("");
  const [rfidCode, setRfidCode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [spaceId, setSpaceId] = useState(defaultSpaceId ? String(defaultSpaceId) : "");
  const [granularity, setGranularity] = useState("UNIT");
  const [qty, setQty] = useState("1");
  const [iconValue, setIconValue] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [spec, setSpec] = useState("");
  const [supplier, setSupplier] = useState("");
  const [expireAt, setExpireAt] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [detailImages, setDetailImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const { data: categoryTree } = useQuery({ queryKey: ["inventory", "categories"], queryFn: fetchCategoryTree });
  const { data: spaceTree } = useQuery({ queryKey: ["inventory", "spaces"], queryFn: fetchSpaceTree });
  const categoryOptions = flattenCategory(categoryTree ?? []);
  const spaceOptions = flattenSpace(spaceTree ?? []);

  const submit = async () => {
    const n = name.trim();
    if (!n) {
      toast.error("名称不能为空");
      return;
    }
    setSubmitting(true);
    try {
      const iconValueTrimmed = iconValue.trim();
      await createItem({
        name: n,
        rfidCode: rfidCode.trim() || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        spaceId: spaceId ? Number(spaceId) : undefined,
        granularity: granularity || undefined,
        qty: qty.trim() ? Number(qty) : undefined,
        iconType: iconValueTrimmed ? (isUrl(iconValueTrimmed) ? "upload" : "builtin") : undefined,
        iconValue: iconValueTrimmed || undefined,
        brand: brand.trim() || undefined,
        model: model.trim() || undefined,
        spec: spec.trim() || undefined,
        supplier: supplier.trim() || undefined,
        expireAt: expireAt ? (expireAt.includes("T") ? expireAt : `${expireAt}T00:00:00`) : undefined,
        coverUrl: coverUrl || undefined,
        detailImages: detailImages.length > 0 ? JSON.stringify(detailImages) : undefined,
      });
      toast.success("新增成功");
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "新增失败");
    } finally {
      setSubmitting(false);
    }
  };

  const uploadCover = async (file: File) => {
    try {
      const res = await uploadSingleImage(file);
      setCoverUrl(res.publicUrl || res.url || "");
      toast.success("封面已上传");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  };

  const uploadDetail = async (file: File) => {
    try {
      const res = await uploadSingleImage(file);
      const url = res.publicUrl || res.url || "";
      if (url) setDetailImages((prev) => [...prev, url]);
      toast.success("详情图已上传");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    }
  };

  return (
    <>
      <Portal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-3">
          <div className="mb-3 flex items-center justify-between px-5 pt-5">
            <h3 className="text-base font-semibold text-[var(--twin-ink)]">新增物品</h3>
            <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1 text-sm text-[var(--twin-body)]" onClick={onClose}>
              关闭
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                名称 <span className="text-red-400">*</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="物品名称" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                RFID 码
                <input value={rfidCode} onChange={(e) => setRfidCode(e.target.value)} className={fieldClass} placeholder="可选，扫码枪录入" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                分类
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={fieldClass}>
                  <option value="">未分类</option>
                  {categoryOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                空间
                <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className={fieldClass}>
                  <option value="">未分配</option>
                  {spaceOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                粒度
                <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className={fieldClass}>
                  <option value="UNIT">一物一码</option>
                  <option value="BATCH">一批一码</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                数量（BATCH 用）
                <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className={fieldClass} placeholder="1" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                图标
                <button
                  type="button"
                  onClick={() => setIconPickerOpen(true)}
                  className="flex items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
                >
                  {iconValue ? (
                    isUrl(iconValue) ? (
                      <img src={iconValue} alt="" className="h-5 w-5 object-contain" />
                    ) : (
                      <span className="text-base leading-none">{iconValue}</span>
                    )
                  ) : (
                    <span className="text-[var(--twin-mute)]">选择图标</span>
                  )}
                  <span className="ml-auto text-[var(--twin-mute)]">▾</span>
                </button>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                品牌
                <input value={brand} onChange={(e) => setBrand(e.target.value)} className={fieldClass} placeholder="可选" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                型号
                <input value={model} onChange={(e) => setModel(e.target.value)} className={fieldClass} placeholder="可选" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                规格
                <input value={spec} onChange={(e) => setSpec(e.target.value)} className={fieldClass} placeholder="可选" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                供应商
                <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={fieldClass} placeholder="可选" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                有效期
                <input type="datetime-local" value={expireAt} onChange={(e) => setExpireAt(e.target.value)} className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                封面图
                <span className="flex cursor-pointer items-center justify-center gap-2 rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-mute)] hover:border-[var(--twin-link-deep)]">
                  {coverUrl ? <img src={coverUrl} alt="" className="h-12 w-12 rounded object-cover" /> : "上传封面图"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.currentTarget.value = ""; }} />
                </span>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
                详情图（可多张）
                <span className="flex cursor-pointer items-center justify-center gap-2 rounded-twin-sm border border-dashed border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-mute)] hover:border-[var(--twin-link-deep)]">
                  上传详情图
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) void uploadDetail(f); e.currentTarget.value = ""; }} />
                </span>
                {detailImages.length > 0 && (
                  <span className="flex flex-wrap gap-1.5">
                    {detailImages.map((u, i) => <img key={i} src={u} alt="" className="h-10 w-10 rounded object-cover" />)}
                  </span>
                )}
              </label>
            </div>
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--twin-hairline)] px-5 py-3">
            <button className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)]" onClick={onClose}>
              取消
            </button>
            <button
              disabled={submitting}
              className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)] disabled:opacity-50"
              onClick={() => void submit()}
            >
              {submitting ? "提交中…" : "确认新增"}
            </button>
          </div>
        </div>
        </div>
      </Portal>
      {iconPickerOpen && <IconPicker value={iconValue} onChange={(v) => setIconValue(v)} onClose={() => setIconPickerOpen(false)} />}
    </>
  );
}
