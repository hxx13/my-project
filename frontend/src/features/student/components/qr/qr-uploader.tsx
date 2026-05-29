import { useState, useRef, type ChangeEvent } from "react";
import { Upload, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { verifyQrCode } from "@/features/student/api/student.api";

interface QrUploaderProps {
  onVerified: (data: {
    userId: string;
    name: string;
    departmentName: string;
    projectGroupName: string;
  }) => void;
}

export function QrUploader({ onVerified }: QrUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Upload area */}
      {!preview ? (
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            "w-full rounded-[var(--student-radius-md)] border-2 border-dashed border-[var(--student-hairline-strong)]",
            "bg-[var(--student-canvas-soft)] p-8",
            "flex flex-col items-center justify-center gap-3",
            "transition-colors hover:border-[var(--student-primary)] hover:bg-[var(--student-primary-soft)]",
            "cursor-pointer"
          )}
        >
          <Upload className="h-8 w-8 text-[var(--student-mute)]" />
          <div className="text-center">
            <p className="text-sm font-medium text-[var(--student-body)]">
              点击上传 QR 码图片
            </p>
            <p className="mt-1 text-xs text-[var(--student-mute)]">
              支持 JPG、PNG 格式
            </p>
          </div>
        </button>
      ) : (
        /* Preview + loading state */
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
      )}

      {/* Error message */}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--student-radius-sm)] bg-[var(--student-error-soft)] p-3 text-[var(--student-error)]">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Retry button when error + preview */}
      {error && preview && (
        <button
          type="button"
          onClick={handleClick}
          className="mt-3 w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-4 py-2 text-sm text-[var(--student-body)] transition-colors hover:bg-[var(--student-canvas-soft)]"
        >
          重新上传
        </button>
      )}
    </div>
  );
}
