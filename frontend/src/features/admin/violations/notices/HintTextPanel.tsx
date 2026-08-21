import { useEffect, useState } from "react";
import type { JSX } from "react";
import toast from "react-hot-toast";
import { Save } from "lucide-react";
import { fetchSystemConfigs, updateSystemConfig } from "@/api/domains/notification.api";
import { AdminButton } from "@/components/admin/AdminButton";
import { EditorInspectorLayout } from "../shared/EditorInspectorLayout";
import { InspectorGroup } from "../shared/InspectorGroup";

const HINT_CONFIG_MODULE = "student_violation";
const HINT_CONFIG_KEY = "student.scan.enter.disabled.hint.text";

/**
 * 「文案提示」面板（自包含：自己查、自己存、自己 toast）。
 * 纯文本多行框，一行一条；不渲染「每条停留秒数」「顺序」等尚无后端配置项的字段。
 * 高度链由 EditorInspectorLayout 独占，本组件不注入 h-* / min-h-* / overflow-*。
 */
export function HintTextPanel(): JSX.Element {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSystemConfigs(HINT_CONFIG_MODULE)
      .then((items) => {
        if (cancelled) return;
        const hit = items.find((it) => it.configKey === HINT_CONFIG_KEY);
        if (hit) {
          setConfigId(hit.id);
          setText(hit.configValue ?? "");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (configId == null) {
      toast.error("配置项未找到，请刷新页面后重试");
      return;
    }
    setSaving(true);
    try {
      await updateSystemConfig(configId, { configValue: text });
      toast.success("文案已保存，扫码端将在下次扫码时生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const canvas = (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-[var(--app-color-text-primary)]">提示文案</h2>
        <p className="mt-1 text-xs text-[var(--app-color-text-secondary)]">
          扫码弹窗中「进入房间」按钮被禁用时的帮助提示，一行一条；扫码界面按顺序轮播。
        </p>
      </div>
      {loading ? (
        <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--app-color-text-tertiary)]">
          加载中…
        </div>
      ) : (
        <textarea
          className="w-full min-h-[320px] rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] p-4 text-sm leading-relaxed text-[var(--app-color-text-primary)] outline-none transition resize-y placeholder:text-[var(--app-color-text-tertiary)] focus:border-[var(--app-color-accent)]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="一行一条，例如：请确认已绑定门禁卡"
        />
      )}
    </div>
  );

  const inspector = (
    <InspectorGroup title="说明">
      <p className="text-xs leading-relaxed text-[var(--app-color-text-secondary)]">
        一行一条，扫码界面按顺序轮播。
      </p>
    </InspectorGroup>
  );

  const footer = (
    <div className="flex justify-end">
      <AdminButton
        type="button"
        tone="primary"
        loading={saving}
        disabled={loading || configId == null}
        onClick={() => void handleSave()}
      >
        <Save className="h-3.5 w-3.5 mr-1" />
        保存文案
      </AdminButton>
    </div>
  );

  return <EditorInspectorLayout canvas={canvas} inspector={inspector} footer={footer} />;
}
