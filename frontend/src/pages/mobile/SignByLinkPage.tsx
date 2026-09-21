import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { SignaturePad } from "@/components/signature/SignaturePad";
import { SIGNATURE_CANVAS } from "@/components/signature/MySignatureCard";
import {
  fetchSignatureLinkInfo,
  submitSignatureByLink,
  type SignatureLinkInfo,
} from "@/api/domains/signature.api";

/**
 * 手机扫码打开的签名页（**公开、无登录态**）。
 *
 * <p>用途：电脑上没法手写 —— 在电脑上生成限时链接、手机扫码打开这里手写自己的签名。
 * 链接一次性，提交成功即失效。
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
    if (!draft) {
      setError("请先手写签名");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitSignatureByLink(token, draft);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-[var(--student-canvas-soft)] p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4">
        {done ? (
          <div className="py-10 text-center">
            <h1 className="text-xl font-bold text-[var(--twin-ink)]">签名已提交</h1>
            <p className="mt-2 text-sm text-[var(--twin-mute)]">链接已失效，可以关闭此页面。</p>
          </div>
        ) : error && !info ? (
          <div className="py-10 text-center">
            <h1 className="text-xl font-bold text-[var(--twin-ink)]">无法打开</h1>
            <p className="mt-2 text-sm text-[var(--twin-mute)]">{error}</p>
          </div>
        ) : !info ? (
          <div className="py-10 text-center text-sm text-[var(--twin-mute)]">加载中…</div>
        ) : (
          <>
            <h1 className="text-lg font-bold text-[var(--twin-ink)]">手写签名</h1>
            <p className="mt-1 text-sm text-[var(--twin-mute)]">
              为「{info.name || "本人"}」签署。提交后不可更改。
            </p>
            <div className="mt-4">
              <SignaturePad
                value={draft}
                onChange={setDraft}
                outputSize={SIGNATURE_CANVAS}
                format="png"
                height={200}
              />
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || !draft}
              className="mt-4 w-full rounded-lg bg-[var(--student-primary)] py-3 text-base font-medium text-white disabled:opacity-50"
            >
              {busy ? "提交中…" : "提交签名"}
            </button>
            <p className="mt-3 text-center text-xs text-[var(--twin-mute)]">
              提交成功后此链接立即失效
            </p>
          </>
        )}
      </div>
    </div>
  );
}
