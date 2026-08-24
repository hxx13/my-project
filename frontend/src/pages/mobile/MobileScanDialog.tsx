/** H5 手机版扫码弹窗：摄像头优先，无摄像头自动拉起文件选择 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, AlertTriangle, Upload } from "lucide-react";

const QR_SCANNER_ID = "mobile-scan-reader";

function detectEnv(): "wechat" | "browser" | "unsupported" {
  if (typeof navigator === "undefined") return "unsupported";
  if (/micromessenger/i.test(navigator.userAgent)) return "wechat";
  if (typeof navigator.mediaDevices?.getUserMedia === "function") return "browser";
  return "unsupported";
}

interface MobileScanDialogProps {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
}

export default function MobileScanDialog({ open, onClose, onResult }: MobileScanDialogProps) {
  const [env, setEnv] = useState<"wechat" | "browser" | "unsupported">("browser");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fileMode, setFileMode] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    if (s) {
      try { await s.stop(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  const decodeFile = useCallback(async (file: File) => {
    setFileMode(true);
    setError(null);
    console.log("[scan-file] 开始识别 name=", file.name, "size=", file.size, "type=", file.type);
    try {
      await stopScanner(); // 先停掉摄像头，避免与相册识别实例冲突
      const html5Qr = new Html5Qrcode(QR_SCANNER_ID, { verbose: false });
      scannerRef.current = html5Qr;
      const text = await html5Qr.scanFile(file, false);
      console.log("[scan-file] 识别文本=", text);
      if (text) {
        onResult(text);
        onClose();
      } else {
        console.log("[scan-file] 识别文本为空");
        setError("未识别到二维码/条形码，请选择其他图片");
        setFileMode(false);
      }
    } catch (e) {
      console.log("[scan-file] 识别失败 error=", e);
      setError("未识别到二维码/条形码，请选择其他图片");
      setFileMode(false);
    }
  }, [onResult, onClose, stopScanner]);

  const handleFilePick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void decodeFile(file);
    // reset so same file can be picked again
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [decodeFile]);

  const startScanner = useCallback(async () => {
    setError(null);
    setFileMode(false);
    try {
      const html5Qr = new Html5Qrcode(QR_SCANNER_ID, { verbose: false });
      scannerRef.current = html5Qr;
      setScanning(true);

      await html5Qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
        (decoded: string) => {
          console.log("[scan-camera] 识别文本=", decoded);
          onResult(decoded);
          stopScanner();
          onClose();
        },
        () => { /* scan tick */ },
      );
    } catch (e: any) {
      setScanning(false);
      const msg = e?.message || String(e);
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        setError("摄像头权限被拒绝");
      } else if (msg.includes("NotFound")) {
        setError("未检测到摄像头");
      } else {
        setError(msg || "无法启动扫码");
      }
      // 无摄像头自动拉起文件选择
      window.setTimeout(() => fileInputRef.current?.click(), 500);
    }
  }, [onResult, onClose, stopScanner]);

  useEffect(() => {
    if (!open) return;
    const e = detectEnv();
    setEnv(e);
    setError(null);
    setFileMode(false);
    if (e === "browser") void startScanner();
    return () => { void stopScanner(); };
  }, [open, startScanner, stopScanner]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] bg-black/70 flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* 隐藏文件选择 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 顶部标题 */}
      <div className="flex items-center px-3 shrink-0 relative z-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}>
        <span className="text-sm font-semibold text-white">
          {fileMode ? "识别图片" : "扫码"}
        </span>
      </div>

      {/* 扫码区域 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
        {env === "wechat" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <Camera className="size-12 text-white/40" />
            <p className="text-sm text-white/80">微信内扫码需公众号配置 JS 安全域名</p>
            <p className="text-xs text-white/50">请在浏览器中打开本页面使用扫码功能</p>
          </div>
        )}

        {env === "unsupported" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CameraOff className="size-12 text-white/40" />
            <p className="text-sm text-white/80">当前环境不支持摄像头扫码</p>
            <p className="text-xs text-white/50">请使用 HTTPS 访问或更换浏览器</p>
            <button type="button" onClick={handleFilePick}
              className="rounded-full px-5 py-2 text-sm font-medium text-white mt-2 active:scale-95"
              style={{ background: "rgba(255,255,255,0.2)" }}>
              <Upload className="size-4 inline mr-1" />选择本地图片
            </button>
          </div>
        )}

        {env === "browser" && error && (
          <div className="flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="size-12 text-amber-400" />
            <p className="text-sm text-white/80">{error}</p>
            <div className="flex gap-3 mt-2">
              <button type="button" onClick={() => { setError(null); void startScanner(); }}
                className="rounded-full px-5 py-2 text-sm font-medium text-white active:scale-95"
                style={{ background: "rgba(255,255,255,0.2)" }}>重试</button>
              <button type="button" onClick={handleFilePick}
                className="rounded-full px-5 py-2 text-sm font-medium text-white active:scale-95"
                style={{ background: "rgba(255,255,255,0.2)" }}>
                <Upload className="size-4 inline mr-1" />选择图片
              </button>
            </div>
          </div>
        )}

        {env === "browser" && (
          <div className="relative">
            <div id={QR_SCANNER_ID} className="rounded-2xl overflow-hidden" style={{ width: 260, height: 260 }} />
            {!error && !scanning && !fileMode && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
                <Camera className="size-8 text-white/60 animate-pulse" />
              </div>
            )}
            {fileMode && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
                <Upload className="size-8 text-white/60" />
              </div>
            )}
            {!error && !fileMode && (
              <svg className="absolute inset-0 pointer-events-none" width="260" height="260" viewBox="0 0 260 260">
                <path d="M 20 60 V 20 H 60" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" />
                <path d="M 200 20 H 240 V 60" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" />
                <path d="M 240 200 V 240 H 200" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" />
                <path d="M 60 240 H 20 V 200" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
          </div>
        )}

        <p className="text-xs text-white/40 mt-4">
          {fileMode ? "正在识别图片…" : "将二维码/条形码对准框内自动识别"}
        </p>
      </div>

      {/* 底部 */}
      <div className="shrink-0 px-6 pb-4 relative z-10" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)" }}>
        {env === "browser" && (
          <button type="button" onClick={handleFilePick}
            className="w-full rounded-2xl py-3 text-sm font-semibold text-white/70 active:scale-[0.98] transition mb-2"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
            <Upload className="size-4 inline mr-1" />从相册选择
          </button>
        )}
        <button type="button" onClick={onClose}
          className="w-full rounded-2xl py-3.5 text-base font-bold text-white active:scale-[0.98] transition"
          style={{ background: "rgba(0,0,0,0.55)", border: "1.5px solid rgba(255,255,255,0.25)", backdropFilter: "blur(4px)" }}>
          取消扫码
        </button>
      </div>
    </div>,
    document.body
  );
}
