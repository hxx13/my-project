import { useCallback, useRef, useState } from "react";
import type { DtWidgetGraphicAsset } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import {
  basenameWithoutExtension,
  defaultPlateForCustomIconImage,
  MAX_WIDGET_GRAPHIC_DATA_URL_LEN,
  measureRasterFromDataUrl,
  mimeFromGraphicFile,
} from "@/features/digital-twin-screen/layout/dtGraphicImport";

export function DtCustomIconImportPanel({
  onImport,
}: {
  onImport: (payload: {
    displayName: string;
    asset: DtWidgetGraphicAsset;
    plate: { nw: number; nh: number };
  }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [pickedMime, setPickedMime] = useState<DtWidgetGraphicAsset["mime"] | null>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [platePreview, setPlatePreview] = useState<{ nw: number; nh: number } | null>(null);

  const resetPicked = useCallback(() => {
    setDisplayName("");
    setPickedMime(null);
    setDataUrl("");
    setSourceFileName("");
    setPlatePreview(null);
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const mime = mimeFromGraphicFile(f);
    if (!mime) {
      window.alert("仅支持 SVG、PNG、JPEG、WebP、GIF");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        const du = String(reader.result || "");
        if (du.length > MAX_WIDGET_GRAPHIC_DATA_URL_LEN) {
          window.alert(
            `文件过大：data URL 超过 ${MAX_WIDGET_GRAPHIC_DATA_URL_LEN} 字符，与场景保存上限一致，请压缩或换较小图片`
          );
          return;
        }
        setPickedMime(mime);
        setDataUrl(du);
        setSourceFileName(f.name);
        const base = basenameWithoutExtension(f.name);
        setDisplayName(base || "自定义图标");
        if (mime === "image/svg+xml") {
          setPlatePreview(defaultPlateForCustomIconImage(0, 0));
        } else {
          const dims = await measureRasterFromDataUrl(du);
          setPlatePreview(
            dims ? defaultPlateForCustomIconImage(dims.w, dims.h) : defaultPlateForCustomIconImage(0, 0)
          );
        }
      })();
    };
    reader.readAsDataURL(f);
  }, []);

  const onAdd = useCallback(() => {
    if (!pickedMime || !dataUrl) {
      window.alert("请先选择图片文件");
      return;
    }
    const nameTrim = displayName.trim();
    if (!nameTrim) {
      window.alert("请填写显示名称");
      return;
    }
    const plate = platePreview ?? defaultPlateForCustomIconImage(0, 0);
    onImport({
      displayName: nameTrim,
      asset: {
        mime: pickedMime,
        dataUrl,
        name: sourceFileName || nameTrim,
      },
      plate,
    });
    resetPicked();
  }, [dataUrl, displayName, onImport, pickedMime, platePreview, resetPicked, sourceFileName]);

  return (
    <div className="pointer-events-auto flex flex-col gap-1 rounded-md border border-slate-600/40 bg-slate-950/55 px-2 py-1.5 text-[10px] text-slate-200 shadow-md sm:text-[11px]">
      <span className="shrink-0 font-semibold text-slate-300">自定义图标</span>
      <span className="shrink-0 text-[9px] leading-tight text-slate-500">
        从本机选择文件，命名后加入画布（新图元，不覆盖内置图库）。加入后可像其他显示框一样选中、缩放、绑定变量。
      </span>
      <input ref={fileRef} type="file" accept=".svg,.png,.jpg,.jpeg,.webp,.gif,image/*" className="hidden" onChange={onFileChange} />
      <button
        type="button"
        className="rounded border border-slate-600 bg-slate-900/80 px-2 py-1 text-left text-slate-200 hover:bg-slate-800/90"
        onClick={() => fileRef.current?.click()}
      >
        {pickedMime ? `已选：${sourceFileName || "文件"}` : "选择图片…"}
      </button>
      {pickedMime ? (
        <>
          <label className="flex flex-col gap-0.5 text-[9px] text-slate-400">
            <span>显示名称（标题 / 便于识别）</span>
            <input
              className="rounded border border-slate-600 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-100"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              placeholder="例如：新风机图标"
            />
          </label>
          {platePreview ? (
            <span className="text-[9px] text-slate-500">
              默认比例约 {platePreview.nw.toFixed(3)} × {platePreview.nh.toFixed(3)}（归一化），落画布后可再拖放调整。
            </span>
          ) : null}
          <button
            type="button"
            className="rounded bg-cyan-900/70 px-2 py-1 font-medium text-cyan-50 hover:bg-cyan-800/80"
            onClick={onAdd}
          >
            加入画布
          </button>
        </>
      ) : null}
    </div>
  );
}
