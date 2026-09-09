/**
 * PromoteMoveLogDialog — 由地点移动留痕补建转移申请
 *
 * 只读展示该 MOVE 留痕的 从/到/时间/操作人，补充备注与前后照片后落一条正式申请。
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Upload } from "lucide-react";
import { authHttp } from "@/api/core/authHttp";
import { usePromoteAssetTransferLog } from "@/api/hooks/useAsset";

export interface PromoteMoveLogTarget {
  id: string;
  from: string;
  to: string;
  time?: string;
  who?: string;
}

interface Props {
  open: boolean;
  target: PromoteMoveLogTarget | null;
  onClose: () => void;
}

function splitUrls(text: string) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function PromoteMoveLogDialog({ open, target, onClose }: Props) {
  const [remark, setRemark] = useState("");
  const [beforeLines, setBeforeLines] = useState("");
  const [afterLines, setAfterLines] = useState("");
  const [uploadingSlot, setUploadingSlot] = useState<"before" | "after" | null>(null);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);
  const promoteMut = usePromoteAssetTransferLog();

  useEffect(() => {
    if (!open) return;
    setRemark("");
    setBeforeLines("");
    setAfterLines("");
  }, [open, target?.id]);

  if (!open || !target) return null;

  const appendUrl = (slot: "before" | "after", url: string) => {
    const setter = slot === "before" ? setBeforeLines : setAfterLines;
    setter((prev) => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed}\n${url}` : url;
    });
  };

  const handleUpload = async (slot: "before" | "after", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSlot(slot);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authHttp.post<{ success: boolean; data: { publicUrl: string }; message?: string }>(
        "/api/upload",
        form,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (res.data?.success && res.data.data?.publicUrl) {
        appendUrl(slot, res.data.data.publicUrl);
        toast.success("照片已上传");
      } else {
        toast.error(res.data?.message || "上传失败");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploadingSlot(null);
      e.target.value = "";
    }
  };

  const submit = async () => {
    const before = splitUrls(beforeLines);
    const after = splitUrls(afterLines);
    try {
      await promoteMut.mutateAsync({
        logId: target.id,
        payload: {
          remark: remark.trim() || undefined,
          photoUrlsBefore: before.length ? before : undefined,
          photoUrlsAfter: after.length ? after : undefined,
        },
      });
      onClose();
    } catch {
      // 已由 hook toast 透出
    }
  };

  const photoSlot = (slot: "before" | "after", label: string) => {
    const lines = slot === "before" ? beforeLines : afterLines;
    const setLines = slot === "before" ? setBeforeLines : setAfterLines;
    const fileRef = slot === "before" ? beforeRef : afterRef;
    return (
      <label className="flex flex-col gap-1 text-[11.5px] text-[var(--twin-body)]">
        <span className="flex items-center gap-2">
          {label}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => void handleUpload(slot, e)} />
          <button
            type="button"
            disabled={uploadingSlot !== null || promoteMut.isPending}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 text-[10.5px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)] disabled:opacity-50"
          >
            <Upload className="h-3 w-3" />
            {uploadingSlot === slot ? "上传中…" : "上传照片"}
          </button>
        </span>
        <textarea
          value={lines}
          onChange={(e) => setLines(e.target.value)}
          rows={2}
          className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5 font-mono text-[10.5px] text-[var(--twin-ink)] outline-none"
          placeholder="每行一个 URL，或点击「上传照片」"
        />
      </label>
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-[var(--twin-ink)]">补建转移申请</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-0.5 text-[11px] text-[var(--twin-mute)] hover:text-[var(--twin-ink)]"
          >
            关闭
          </button>
        </div>

        <dl className="mb-3 space-y-1 rounded-twin-md bg-[var(--twin-canvas-soft)] px-2.5 py-2 text-[11.5px]">
          {[
            ["从", target.from || "—"],
            ["到", target.to || "—"],
            ["时间", target.time ? String(target.time).replace("T", " ").slice(0, 19) : "—"],
            ["操作人", target.who || "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="w-[46px] shrink-0 text-[var(--twin-mute)]">{label}</dt>
              <dd className="min-w-0 flex-1 break-words text-[var(--twin-ink)]">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-2.5">
          <label className="flex flex-col gap-1 text-[11.5px] text-[var(--twin-body)]">
            备注
            <textarea
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={2}
              className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2 py-1.5 text-[11.5px] text-[var(--twin-ink)] outline-none"
              placeholder="补记本次转移的说明（可选）"
            />
          </label>
          {photoSlot("before", "转移前照片（可选）")}
          {photoSlot("after", "转移后照片（可选）")}
        </div>

        <div className="mt-3.5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-1.5 text-[11.5px] text-[var(--twin-body)] hover:text-[var(--twin-ink)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={promoteMut.isPending}
            onClick={() => void submit()}
            className="rounded-twin-sm bg-[var(--twin-link-deep)] px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-50"
          >
            {promoteMut.isPending ? "提交中…" : "确认补建"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
