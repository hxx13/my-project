import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Upload, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createIcon, fetchIcons } from "@/api/domains/inventory.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";

function guessMime(url: string): string {
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/*";
}

/**
 * 图标选择弹层：内置 emoji 网格 + 已上传图片 + 上传/粘贴 URL。
 * 选中后通过 onChange 回填值（内置回填 emoji，上传区回填图片 URL），
 * 父组件据此区分 iconType（EMOJI / IMAGE）。
 */
export default function IconPicker(props: {
  value?: string;
  onChange?: (v: string) => void;
  onClose?: () => void;
}) {
  const { value, onChange, onClose } = props;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({
    queryKey: ["inventory", "icons"],
    queryFn: fetchIcons,
  });

  const builtin = data?.builtin ?? [];
  const uploaded = data?.uploaded ?? [];

  const select = (v: string) => {
    onChange?.(v);
    onClose?.();
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["inventory", "icons"] });

  const doUploadFile = async (file: File) => {
    setBusy(true);
    try {
      const res = await uploadSingleImage(file);
      await createIcon({
        name: file.name || "icon",
        url: res.publicUrl || res.url,
        mime: file.type || "image/png",
      });
      toast.success("图标已上传");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const doCreateByUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setBusy(true);
    try {
      const name = url.split("/").pop()?.split("?")[0] || "icon";
      await createIcon({ name, url, mime: guessMime(url) });
      toast.success("图标已添加");
      setUrlInput("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-twin-xl bg-white p-5 shadow-twin-level-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">选择图标</h3>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-accent hover:bg-accent/10 hover:text-slate-600"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-2 text-xs font-semibold text-slate-500">内置图标</div>
          <div className="grid max-h-44 grid-cols-8 gap-2 overflow-y-auto">
            {builtin.map((ic) => {
              const active = value === ic.emoji || value === ic.key;
              return (
                <button
                  key={ic.key}
                  type="button"
                  onClick={() => select(ic.emoji)}
                  title={ic.label}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg border text-2xl transition",
                    active
                      ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/30"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  )}
                >
                  {ic.emoji}
                </button>
              );
            })}
          </div>

          <div className="mb-2 mt-4 text-xs font-semibold text-slate-500">上传图标</div>
          <div className="flex flex-wrap gap-2">
            {uploaded.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => select(u.url)}
                title={u.name}
                className={cn(
                  "h-12 w-12 overflow-hidden rounded-lg border transition",
                  value === u.url
                    ? "border-blue-500 ring-2 ring-blue-500/30"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <img src={u.url} alt={u.name} className="h-full w-full object-cover" />
              </button>
            ))}
            {!uploaded.length && (
              <div className="text-xs text-slate-400">暂无上传图标</div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doUploadFile(f);
                e.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              上传图片
            </button>
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void doCreateByUrl();
              }}
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus-visible:border-slate-300 focus-visible:ring-2 focus-visible:ring-[#0070f3]/25"
              placeholder="或粘贴图片 URL"
            />
            <button
              type="button"
              disabled={busy || !urlInput.trim()}
              onClick={() => void doCreateByUrl()}
              className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
