import { useState, useEffect, useCallback, useRef } from "react";
import { SystemConfigsPanel } from "@/features/admin/settings/SystemConfigsPanel";
import {
  fetchSystemConfigs,
  fetchConfigDefinitions,
  type SystemConfigRecord,
  type SettingDefinitionRecord,
} from "@/api/domains/notification.api";
import {
  fetchAdminLoginBranding,
  putAdminLoginBranding,
  uploadAdminLoginBrandingImage,
} from "@/api/domains/siteAdmin.api";
import { AdminFormCard } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminToggle } from "@/components/admin/AdminToggle";
import toast from "react-hot-toast";

/* ── helpers ── */

function parseUrlLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ═══════════════════════════════════════════════════════════
   LoginBrandingSection — extracted from AdminLoginBrandingPage
   ═══════════════════════════════════════════════════════════ */

function LoginBrandingSection() {
  const [urlsLightText, setUrlsLightText] = useState("");
  const [urlsDarkText, setUrlsDarkText] = useState("");
  const [intervalSec, setIntervalSec] = useState(8);
  const [heroCarouselEnabled, setHeroCarouselEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<"light" | "dark">("light");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── load branding config on mount ── */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const branding = await fetchAdminLoginBranding();
        if (cancelled) return;
        const light =
          branding.heroImageUrlsLight?.length
            ? branding.heroImageUrlsLight
            : branding.heroImageUrls || [];
        setUrlsLightText(light.join("\n"));
        setUrlsDarkText((branding.heroImageUrlsDark || []).join("\n"));
        setIntervalSec(branding.intervalSec || 8);
        setHeroCarouselEnabled(branding.heroCarouselEnabled !== false);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "读取登录页品牌配置失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── save ── */

  const save = useCallback(async () => {
    const heroImageUrlsLight = parseUrlLines(urlsLightText);
    const heroImageUrlsDark = parseUrlLines(urlsDarkText);
    setSaving(true);
    try {
      await putAdminLoginBranding({
        heroImageUrls: heroImageUrlsLight,
        heroImageUrlsLight,
        heroImageUrlsDark,
        intervalSec,
        heroCarouselEnabled,
      });
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }, [urlsLightText, urlsDarkText, intervalSec, heroCarouselEnabled]);

  /* ── upload helpers ── */

  const appendUrls = useCallback((target: "light" | "dark", lines: string[]) => {
    const setter = target === "light" ? setUrlsLightText : setUrlsDarkText;
    setter((prev) => [...parseUrlLines(prev), ...lines].join("\n"));
  }, []);

  const onFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          `已上传 ${added.length} 张至${uploadTarget === "light" ? "亮色" : "暗色"}列表，请点「保存」写入数据库`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "上传失败");
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [uploadTarget, appendUrls],
  );

  /* ── loading state ── */

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Enable toggle ── */}
      <div className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)] px-4 py-3">
        <AdminToggle
          checked={heroCarouselEnabled}
          onChange={setHeroCarouselEnabled}
          label="启用背景轮播"
          description="关闭后登录页不再切换背景图（仍保留底部装饰与主题文案）。"
        />
      </div>

      {/* ── Upload area ── */}
      <div className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4">
        <p className="text-sm font-medium text-[var(--app-color-text-primary)]">
          上传图片
        </p>
        <p className="mt-1 text-xs text-[var(--app-color-text-tertiary)]">
          支持 jpg / png / webp / gif，单张不超过 12MB；上传成功后 URL 会追加到所选模式列表，需再点「保存」。
        </p>

        {/* target selector pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              uploadTarget === "light"
                ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)]"
                : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:border-[var(--app-color-border-strong)]"
            }`}
            onClick={() => setUploadTarget("light")}
          >
            上传到亮色
          </button>
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              uploadTarget === "dark"
                ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent)] text-[var(--app-color-text-inverse)]"
                : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:border-[var(--app-color-border-strong)]"
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
          className="mt-3 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-primary)] shadow-sm transition-colors hover:bg-[var(--app-color-surface-hover)] hover:border-[var(--app-color-border-strong)] disabled:opacity-50"
        >
          {uploading
            ? "上传中…"
            : `选择文件上传（${uploadTarget === "light" ? "亮色" : "暗色"}）`}
        </button>
      </div>

      {/* ── Light mode URLs ── */}
      <label className="block">
        <span className="text-sm font-medium text-[var(--app-color-text-secondary)]">
          亮色模式图片 URL（一行一个）
        </span>
        <textarea
          value={urlsLightText}
          onChange={(e) => setUrlsLightText(e.target.value)}
          rows={6}
          placeholder="/api/upload/files/20260624/xxxxxxxx.jpg"
          className="mt-1 w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2.5 font-mono text-xs text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)]/30"
        />
      </label>

      {/* ── Dark mode URLs ── */}
      <label className="block">
        <span className="text-sm font-medium text-[var(--app-color-text-secondary)]">
          暗色模式图片 URL（一行一个；可留空，登录页暗色下将回退亮色图）
        </span>
        <textarea
          value={urlsDarkText}
          onChange={(e) => setUrlsDarkText(e.target.value)}
          rows={6}
          placeholder="/api/upload/files/20260624/yyyyyyyy.jpg"
          className="mt-1 w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2.5 font-mono text-xs text-[var(--app-color-text-primary)] placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)]/30"
        />
      </label>

      {/* ── Carousel interval ── */}
      <label className="block">
        <span className="text-sm font-medium text-[var(--app-color-text-secondary)]">
          轮播间隔（秒，最少 3）
        </span>
        <input
          type="number"
          min={3}
          value={intervalSec}
          onChange={(e) => setIntervalSec(Number(e.target.value) || 8)}
          className="mt-1 w-40 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-1.5 text-sm text-[var(--app-color-text-primary)] focus:border-[var(--app-color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--app-color-accent)]/30"
        />
      </label>

      {/* ── Save button ── */}
      <AdminButton tone="primary" loading={saving} onClick={() => void save()}>
        保存
      </AdminButton>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MiniProgramConfigs
   ═══════════════════════════════════════════════════════════ */

function MiniProgramConfigs() {
  const [configs, setConfigs] = useState<SystemConfigRecord[]>([]);
  const [configDefs, setConfigDefs] = useState<SettingDefinitionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, defs] = await Promise.all([
          fetchSystemConfigs("mini_program"),
          fetchConfigDefinitions("mini_program"),
        ]);
        if (cancelled) return;
        setConfigs(cfg);
        setConfigDefs(defs);
      } catch (e) {
        if (!cancelled)
          toast.error(e instanceof Error ? e.message : "读取小程序配置失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-[var(--app-color-text-tertiary)]">
        加载中…
      </div>
    );
  }

  return (
    <SystemConfigsPanel
      moduleKey="mini_program"
      configs={configs}
      configDefs={configDefs}
      onConfigsChange={setConfigs}
      hideSearch
      description="微信小程序订阅消息等推送参数，按中文名称与说明维护。"
    />
  );
}

/* ═══════════════════════════════════════════════════════════
   AppearanceSettings — default export (rendered via Outlet)
   ═══════════════════════════════════════════════════════════ */

export default function AppearanceSettings() {
  return (
    <div className="space-y-6">
      <AdminFormCard
        title="登录页轮播图"
        description="管理登录页背景轮播图的图片、开关和轮播间隔"
      >
        <LoginBrandingSection />
      </AdminFormCard>

      <AdminFormCard
        title="小程序展示配置"
        description="微信小程序订阅消息等推送参数"
      >
        <MiniProgramConfigs />
      </AdminFormCard>
    </div>
  );
}
