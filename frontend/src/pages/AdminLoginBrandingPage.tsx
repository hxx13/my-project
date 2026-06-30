import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminLoginBranding,
  putAdminLoginBranding,
  uploadAdminLoginBrandingImage,
} from "@/api/domains/siteAdmin.api";

function parseUrlLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function AdminLoginBrandingPage() {
  const [urlsLightText, setUrlsLightText] = useState("");
  const [urlsDarkText, setUrlsDarkText] = useState("");
  const [intervalSec, setIntervalSec] = useState(8);
  const [heroCarouselEnabled, setHeroCarouselEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<"light" | "dark">("light");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { isLoading, data: branding } = useQuery({
    queryKey: ["adminLoginBranding"] as const,
    queryFn: fetchAdminLoginBranding,
  });

  useEffect(() => {
    if (!branding) return;
    const light = branding.heroImageUrlsLight?.length
      ? branding.heroImageUrlsLight
      : branding.heroImageUrls || [];
    setUrlsLightText(light.join("\n"));
    setUrlsDarkText((branding.heroImageUrlsDark || []).join("\n"));
    setIntervalSec(branding.intervalSec || 8);
    setHeroCarouselEnabled(branding.heroCarouselEnabled !== false);
  }, [branding]);

  const save = async () => {
    const heroImageUrlsLight = parseUrlLines(urlsLightText);
    const heroImageUrlsDark = parseUrlLines(urlsDarkText);
    try {
      const saved = await putAdminLoginBranding({
        heroImageUrls: heroImageUrlsLight,
        heroImageUrlsLight,
        heroImageUrlsDark,
        intervalSec,
        heroCarouselEnabled,
      });
      // 保存后仅合并 query 缓存，禁止整页 load；post-save-no-full-refresh.mdc
      queryClient.setQueryData(["adminLoginBranding"], saved);
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const appendUrls = (target: "light" | "dark", lines: string[]) => {
    const setter = target === "light" ? setUrlsLightText : setUrlsDarkText;
    setter((prev) => [...parseUrlLines(prev), ...lines].join("\n"));
  };

  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const added: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const url = await uploadAdminLoginBrandingImage(files[i]);
        added.push(url);
      }
      appendUrls(uploadTarget, added);
      toast.success(
        `已上传 ${added.length} 张至${uploadTarget === "light" ? "亮色" : "暗色"}列表，请点「保存」写入数据库`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-[var(--twin-mute)]">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--twin-ink)]">登录页轮播图</h1>
      <p className="text-sm text-[var(--twin-body)]">
        公开接口 <code className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-1">GET /api/public/login-branding</code>{" "}
        供登录页与小程序首页读取。上传须走统一{" "}
        <code className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-1">POST /api/upload</code>，保存{" "}
        <code className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-1">/api/upload/files/日期/文件名</code>
        （与物资/报修附图完全相同）。旧链{" "}
        <code className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-1">/api/public/login-branding/files/…</code>{" "}
        小程序不会展示，请重新上传并保存。
      </p>
      <div className="flex flex-col gap-2 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--twin-ink)]">背景轮播</p>
          <p className="text-xs text-[var(--twin-mute)]">关闭后登录页不再切换背景图（仍保留底部装饰与主题文案）。</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 self-start sm:self-auto">
          <input
            type="checkbox"
            className="h-4 w-4 rounded-twin-sm border-[var(--twin-hairline)]"
            checked={heroCarouselEnabled}
            onChange={(e) => setHeroCarouselEnabled(e.target.checked)}
          />
          <span className="text-sm text-[var(--twin-body)]">启用背景轮播</span>
        </label>
      </div>

      <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 shadow-twin-level-1">
        <p className="text-sm font-medium text-[var(--twin-ink)]">上传图片</p>
        <p className="mt-1 text-xs text-[var(--twin-mute)]">
          支持 jpg / png / webp / gif，单张不超过 12MB；上传成功后 URL 会追加到所选模式列表，需再点「保存」。
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              uploadTarget === "light"
                ? "border-[var(--twin-primary)] bg-[var(--twin-primary)] text-[var(--twin-on-primary)]"
                : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)]"
            }`}
            onClick={() => setUploadTarget("light")}
          >
            上传到亮色
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              uploadTarget === "dark"
                ? "border-[var(--twin-primary)] bg-[var(--twin-primary)] text-[var(--twin-on-primary)]"
                : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)]"
            }`}
            onClick={() => setUploadTarget("dark")}
          >
            上传到暗色
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
          multiple
          className="hidden"
          onChange={(e) => void onFileInputChange(e)}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="mt-3 rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-2 text-sm font-medium text-[var(--twin-ink)] shadow-twin-level-1 hover:bg-[var(--twin-canvas-soft)] disabled:opacity-50"
        >
          {uploading ? "上传中…" : `选择文件上传（${uploadTarget === "light" ? "亮色" : "暗色"}）`}
        </button>
      </div>

      <label className="block text-sm font-medium text-[var(--twin-body)]">
        亮色模式图片 URL（一行一个）
        <textarea
          value={urlsLightText}
          onChange={(e) => setUrlsLightText(e.target.value)}
          rows={8}
          placeholder="/api/upload/files/20260624/xxxxxxxx.jpg"
          className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2 font-mono text-xs text-[var(--twin-ink)]"
        />
      </label>

      <label className="block text-sm font-medium text-[var(--twin-body)]">
        暗色模式图片 URL（一行一个；可留空，登录页暗色下将回退亮色图）
        <textarea
          value={urlsDarkText}
          onChange={(e) => setUrlsDarkText(e.target.value)}
          rows={8}
          placeholder="/api/upload/files/20260624/yyyyyyyy.jpg"
          className="mt-1 w-full rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-2 font-mono text-xs text-[var(--twin-ink)]"
        />
      </label>

      <label className="block text-sm font-medium text-[var(--twin-body)]">
        轮播间隔（秒，最少 3）
        <input
          type="number"
          min={3}
          value={intervalSec}
          onChange={(e) => setIntervalSec(Number(e.target.value) || 8)}
          className="mt-1 w-40 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2 py-1 text-sm text-[var(--twin-ink)]"
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-twin-sm bg-[var(--twin-primary)] px-4 py-2 text-sm font-medium text-[var(--twin-on-primary)]"
      >
        保存
      </button>
    </div>
  );
}
