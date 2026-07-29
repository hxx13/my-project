import { useState, useRef, useEffect, useCallback, type ChangeEvent } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Upload, Loader2, XCircle, Camera, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { verifyQrCode, verifyUserId } from "@/features/student/api/student.api";

const QR_SCANNER_ID = "qr-uploader-scanner";

interface QrUploaderProps {
  onVerified: (data: {
    userId: string;
    name: string;
    departmentName: string;
    projectGroupName: string;
  }) => void;
}

export function QrUploader({ onVerified }: QrUploaderProps) {
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    if (s) {
      try { await s.stop(); } catch { /* ignore */ }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { void stopScanner(); };
  }, [stopScanner]);

  /* ---- Camera scan ---- */
  const startCameraScan = async () => {
    setError(null);
    setPreview(null);
    setScanning(true);
    try {
      const html5Qr = new Html5Qrcode(QR_SCANNER_ID, { verbose: false });
      scannerRef.current = html5Qr;

      await html5Qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
        async (decodedText) => {
          // Scan success — stop camera and verify
          await stopScanner();
          setLoading(true);
          try {
            const uid = decodedText.trim();
            if (!uid) {
              setError("未识别到有效的人员编号，请重试");
              return;
            }
            const result = await verifyUserId(uid);
            if (result.verified && result.userId && result.name) {
              onVerified({
                userId: result.userId,
                name: result.name,
                departmentName: result.departmentName || "",
                projectGroupName: result.projectGroupName || "",
              });
            } else {
              setError(result.message || "扫描结果未匹配到人员，请确认二维码正确");
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "验证失败，请重试");
          } finally {
            setLoading(false);
          }
        },
        () => { /* scan failure — ignore */ },
      );
    } catch (err) {
      setScanning(false);
      // Camera not available → fallback hint
      if (err instanceof Error && err.message?.includes("NotAllowedError")) {
        setError("摄像头权限被拒绝，请允许后重试或使用相册上传");
      } else {
        setError("无法启动摄像头，请使用相册上传");
      }
    }
  };

  /* ---- Album upload ---- */
  const handleAlbumClick = () => {
    // Stop camera if scanning
    if (scanning) void stopScanner();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setScanning(false);
    setLoading(true);

    const url = URL.createObjectURL(file);
    setPreview(url);

    try {
      const result = await verifyQrCode(file);
      if (result.verified && result.userId && result.name) {
        onVerified({
          userId: result.userId,
          name: result.name,
          departmentName: result.departmentName || "",
          projectGroupName: result.projectGroupName || "",
        });
      } else {
        setError(result.message || "QR 码验证失败，请确认图片中包含有效的身份 QR 码");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "QR 码验证失败，请重试");
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Camera viewport */}
      {scanning ? (
        <div className="overflow-hidden rounded-[var(--student-radius-md)] border border-[var(--student-hairline)]">
          <div id={QR_SCANNER_ID} className="w-full aspect-square bg-black" />
          <div className="flex items-center justify-center gap-2 p-3 text-sm text-[var(--student-mute)]">
            <Camera className="h-4 w-4" />
            将二维码对准取景框
          </div>
        </div>
      ) : preview ? (
        /* Album preview */
        <div className="overflow-hidden rounded-[var(--student-radius-md)] border border-[var(--student-hairline)]">
          <img
            src={preview}
            alt="QR 码预览"
            className="h-48 w-full bg-[var(--student-canvas-soft)] object-contain"
          />
          {loading && (
            <div className="flex items-center justify-center gap-2 p-4 text-[var(--student-mute)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">正在验证 QR 码...</span>
            </div>
          )}
        </div>
      ) : (
        /* Initial state: scan + album buttons */
        <div className="space-y-3">
          {/* Primary: scan */}
          <button
            type="button"
            onClick={startCameraScan}
            disabled={loading}
            className={cn(
              "w-full rounded-[var(--student-radius-md)] border-2 border-[var(--student-primary)]",
              "bg-[var(--student-primary-soft)] p-6",
              "flex flex-col items-center justify-center gap-3",
              "transition-colors hover:bg-[var(--student-primary)]/15",
              "cursor-pointer disabled:opacity-50",
            )}
          >
            <Camera className="h-10 w-10 text-[var(--student-primary)]" />
            <div className="text-center">
              <p className="text-base font-semibold text-[var(--student-primary)]">
                扫码验证
              </p>
              <p className="mt-1 text-xs text-[var(--student-mute)]">
                将 ARO 系统二维码对准摄像头
              </p>
            </div>
          </button>

          {/* Secondary: album */}
          <button
            type="button"
            onClick={handleAlbumClick}
            disabled={loading}
            className={cn(
              "w-full rounded-[var(--student-radius-md)] border border-dashed border-[var(--student-hairline-strong)]",
              "bg-[var(--student-canvas-soft)] px-4 py-3",
              "flex items-center justify-center gap-2",
              "transition-colors hover:border-[var(--student-primary)] hover:bg-[var(--student-primary-soft)]",
              "cursor-pointer disabled:opacity-50",
            )}
          >
            <Image className="h-5 w-5 text-[var(--student-mute)]" />
            <span className="text-sm text-[var(--student-body)]">从相册选择</span>
          </button>
        </div>
      )}

      {/* Loading overlay during camera→verify transition */}
      {loading && !preview && !scanning && (
        <div className="mt-4 flex items-center justify-center gap-2 text-[var(--student-mute)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">正在验证身份...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--student-radius-sm)] bg-[var(--student-error-soft)] p-3 text-[var(--student-error)]">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Retry / re-upload after error */}
      {error && (preview || !scanning) && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={startCameraScan}
            className="flex-1 rounded-[var(--student-radius-sm)] border border-[var(--student-primary)] bg-[var(--student-canvas)] px-4 py-2 text-sm text-[var(--student-primary)] transition-colors hover:bg-[var(--student-primary-soft)]"
          >
            <Camera className="inline h-4 w-4 mr-1" />
            重新扫码
          </button>
          <button
            type="button"
            onClick={handleAlbumClick}
            className="flex-1 rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-4 py-2 text-sm text-[var(--student-body)] transition-colors hover:bg-[var(--student-canvas-soft)]"
          >
            <Image className="inline h-4 w-4 mr-1" />
            重新上传
          </button>
        </div>
      )}
    </div>
  );
}
