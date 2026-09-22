import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-hot-toast";
import { SignatureFullscreenPad } from "@/components/signature/SignatureFullscreenPad";
import {
  fetchSignatureLinkInfo,
  submitSignatureByLink,
  type SignatureLinkInfo,
} from "@/api/domains/signature.api";

/**
 * 手机扫码 / 小程序网页模式打开的签名页（**公开、无登录态**）。
 *
 * <p>用途：电脑上没法手写 —— 在电脑上生成限时链接、手机扫码打开这里手写自己的签名；
 * 小程序「我的 → 电子签名」也走这里，不在小程序里另做手绘区。
 * 链接一次性，提交成功即失效。
 *
 * <p>签名区与手机端「我的」里的入口**共用** {@link SignatureFullscreenPad}：整屏横向、只有三个按钮。
 */
export default function SignByLinkPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [info, setInfo] = useState<SignatureLinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setInfo(await fetchSignatureLinkInfo(token));
      } catch (e) {
        setError(e instanceof Error ? e.message : "链接无效");
      }
    })();
  }, [token]);

  const handleSubmit = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await submitSignatureByLink(token, draft);
      setDone(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  };

  // 能签就整屏横着签（与手机端「我的」入口同一套）；加载中/出错/已提交才回到居中卡片
  if (info && !done) {
    return (
      <SignatureFullscreenPad
        value={draft}
        onChange={setDraft}
        onBack={() => {
          if (window.history.length > 1) window.history.back();
          else toast("可以关闭本页返回", { icon: "ℹ️" });
        }}
        onSubmit={() => void handleSubmit()}
        busy={busy}
        title={`为「${info.name || "本人"}」签署`}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[var(--student-canvas-soft)] p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4">
        {done ? (
          <div className="py-10 text-center">
            <h1 className="text-xl font-bold text-[var(--twin-ink)]">签名已提交</h1>
            <p className="mt-2 text-sm text-[var(--twin-mute)]">链接已失效，返回上一页即可 —— 签名已经记到你名下。</p>
          </div>
        ) : error && !info ? (
          <div className="py-10 text-center">
            <h1 className="text-xl font-bold text-[var(--twin-ink)]">无法打开</h1>
            <p className="mt-2 text-sm text-[var(--twin-mute)]">{error}</p>
          </div>
        ) : !info ? (
          <div className="py-10 text-center text-sm text-[var(--twin-mute)]">加载中…</div>
        ) : null}
      </div>
    </div>
  );
}
