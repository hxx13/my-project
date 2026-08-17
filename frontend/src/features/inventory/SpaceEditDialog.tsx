/**
 * SpaceEditDialog — 空间设置弹层（图形视图内）
 *
 * 编辑选中空间的名称 / 类型 / 图标（复用 createSpace/updateSpace 已有接口），
 * 并提供「清除几何」「移到根」两个布局操作。
 * 保存后通过 useQueryClient 失效空间树查询，并回调 onChanged。
 */

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpToLine, Eraser, X } from "lucide-react";
import { updateSpace, type SpaceNode } from "@/api/domains/inventory.api";
import { Portal } from "@/components/Portal";
import ItemIcon from "./ItemIcon";
import IconPicker from "./IconPicker";

export default function SpaceEditDialog(props: {
  space: SpaceNode | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { space, open, onClose, onChanged } = props;
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [icon, setIcon] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // 打开时回填当前空间字段
  useEffect(() => {
    if (open && space) {
      setName(space.name ?? "");
      setType(space.type ?? "");
      setIcon(space.icon ?? "");
    }
  }, [open, space]);

  if (!open || !space) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inventory", "spaces"] });
    onChanged?.();
  };

  const doSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("名称不能为空");
      return;
    }
    setSaving(true);
    try {
      await updateSpace(space.id, {
        name: trimmed,
        type: type.trim() || undefined,
        icon: icon || undefined,
      });
      toast.success("空间已更新");
      refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSaving(false);
    }
  };

  const doClearGeometry = async () => {
    try {
      await updateSpace(space.id, { clearGeometry: true });
      toast.success("已清除几何布局");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "清除几何失败");
    }
  };

  const doMoveToRoot = async () => {
    try {
      await updateSpace(space.id, { moveToRoot: true });
      toast.success("已移到根节点");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "移到根失败");
    }
  };

  const inputClass =
    "rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] outline-none placeholder:text-[var(--twin-mute)] focus:border-[var(--twin-link-deep)]";

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="w-full max-w-sm overflow-hidden rounded-twin-xl bg-[var(--twin-canvas)] shadow-twin-level-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-[var(--twin-hairline)] px-4 py-3">
            <h3 className="truncate text-sm font-semibold text-[var(--twin-ink)]">空间设置 · {space.name}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-twin-sm p-1 text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-[var(--twin-ink)]"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 px-4 py-4">
            <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
              名称
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="空间名称" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
              类型
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={inputClass}
                placeholder="如：楼 / 楼层 / 房间 / 区域"
                list="space-type-suggestions"
              />
              <datalist id="space-type-suggestions">
                <option value="楼" />
                <option value="楼层" />
                <option value="房间" />
                <option value="区域" />
              </datalist>
            </label>
            <div className="flex flex-col gap-1 text-xs text-[var(--twin-body)]">
              图标
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)]">
                  <ItemIcon value={icon} className="text-[18px] leading-none" />
                </span>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-xs text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
                >
                  选择图标
                </button>
                {icon && (
                  <button
                    type="button"
                    onClick={() => setIcon("")}
                    className="text-xs text-[var(--twin-mute)] transition hover:text-[var(--twin-ink)]"
                  >
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 布局操作 */}
          <div className="flex gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
            <button
              type="button"
              onClick={() => void doClearGeometry()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-2 text-xs text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
            >
              <Eraser className="h-3.5 w-3.5" /> 清除几何
            </button>
            <button
              type="button"
              onClick={() => void doMoveToRoot()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-2 text-xs text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
            >
              <ArrowUpToLine className="h-3.5 w-3.5" /> 移到根
            </button>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--twin-hairline)] px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-body)] transition hover:bg-[var(--twin-canvas-soft)]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void doSave()}
              disabled={saving}
              className="rounded-twin-sm bg-[var(--twin-primary)] px-3 py-2 text-sm font-medium text-[var(--twin-on-primary)] transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <IconPicker value={icon} onChange={(v) => setIcon(v)} onClose={() => setPickerOpen(false)} />
      )}
    </Portal>
  );
}
