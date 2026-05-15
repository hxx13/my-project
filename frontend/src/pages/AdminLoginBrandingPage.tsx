import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  fetchAdminLoginBranding,
  putAdminLoginBranding,
  uploadAdminLoginBrandingImage,
} from "@/api/domains/siteAdmin.api";

export default function AdminLoginBrandingPage() {
  const [urlsText, setUrlsText] = useState("");
  const [intervalSec, setIntervalSec] = useState(8);
  const [heroCarouselEnabled, setHeroCarouselEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = await fetchAdminLoginBranding();
        if (!alive) return;
        setUrlsText((b.heroImageUrls || []).join("\n"));
        setIntervalSec(b.intervalSec || 8);
        setHeroCarouselEnabled(b.heroCarouselEnabled !== false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    const urls = urlsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await putAdminLoginBranding({ heroImageUrls: urls, intervalSec, heroCarouselEnabled });
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  const appendUrls = (lines: string[]) => {
    setUrlsText((prev) => {
      const cur = prev
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      return [...cur, ...lines].join("\n");
    });
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
      appendUrls(added);
      toast.success(`已上传 ${added.length} 张，URL 已追加到下方列表，请点「保存」写入数据库`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-slate-900">登录页轮播图</h1>
      <p className="text-sm text-slate-600">
        公开接口 <code className="rounded bg-slate-100 px-1">GET /api/public/login-branding</code> 供登录页读取；静态图通过{" "}
        <code className="rounded bg-slate-100 px-1">GET /api/public/login-branding/files/文件名</code> 提供。目标库须已执行{" "}
        <code className="rounded bg-slate-100 px-1">scripts/login_branding_invite_chat.ddl.sql</code>
        。文件落盘目录由 <code className="rounded bg-slate-100 px-1">application.properties</code> 中{" "}
        <code className="rounded bg-slate-100 px-1">app.login-branding.upload-dir</code> 配置（默认用户目录下，与 JAR 分离）。
      </p>
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">背景轮播</p>
          <p className="text-xs text-slate-500">关闭后登录页不再切换背景图（仍保留底部装饰与主题文案）。</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 self-start sm:self-auto">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={heroCarouselEnabled}
            onChange={(e) => setHeroCarouselEnabled(e.target.checked)}
          />
          <span className="text-sm text-slate-700">启用背景轮播</span>
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-slate-800">上传图片</p>
        <p className="mt-1 text-xs text-slate-500">
          支持 jpg / png / webp / gif，单张不超过 12MB；上传成功后 URL 会追加到下方文本框，需再点「保存」。
        </p>
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
          className="mt-3 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {uploading ? "上传中…" : "选择文件上传"}
        </button>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        图片 URL（一行一个；可与上传混用，亦支持外链 https://…）
        <textarea
          value={urlsText}
          onChange={(e) => setUrlsText(e.target.value)}
          rows={10}
          placeholder="/api/public/login-branding/files/xxxxxxxx.jpg"
          className="mt-1 w-full rounded border border-slate-300 p-2 font-mono text-xs"
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        轮播间隔（秒，最少 3）
        <input
          type="number"
          min={3}
          value={intervalSec}
          onChange={(e) => setIntervalSec(Number(e.target.value) || 8)}
          className="mt-1 w-40 rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <button type="button" onClick={() => void save()} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">
        保存
      </button>
    </div>
  );
}
