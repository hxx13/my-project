import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "react-hot-toast";
import { SignaturePad } from "./SignaturePad";
import {
  createSignatureLink,
  fetchMySignature,
  submitMySignature,
  type MySignature,
} from "@/api/domains/signature.api";

/** 签名画布规范：固定 800×300、白底、PNG。尺寸统一才好贴进文档。 */
export const SIGNATURE_CANVAS = { width: 800, height: 300 };

/**
 * 我的电子签名（学生端与教职工端共用）。
 *
 * <p>签名**一经提交不可更改** —— 提交后这里只读展示；修改的唯一途径是管理员在人员授权页重置。
 * 电脑上没法手写，所以另给一条「生成手机签名链接」：扫码后在手机上画。
 */
export default function MySignatureCard({ className }: { className?: string }) {
  const [sig, setSig] = useState<MySignature | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSig(await fetchMySignature());
    } catch (e) {
      setSig({ hasSignature: false });
      toast.error(e instanceof Error ? e.message : "加载签名失败");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSubmit = async () => {
    if (!draft) {
      toast.error("请先在方框里手写签名");
      return;
    }
    setBusy(true);
    try {
      await submitMySignature(draft);
      toast.success("签名已提交，不可更改");
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setBusy(false);
    }
  };

  const handleMakeLink = async () => {
    setBusy(true);
    try {
      const r = await createSignatureLink();
      setLink(`${window.location.origin}/#/m/sign/${r.token}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成链接失败");
    } finally {
      setBusy(false);
    }
  };

  if (sig === null) {
    return <div className={className}>加载中…</div>;
  }

  if (sig.hasSignature) {
    return (
      <div className={className}>
        <img src={sig.imageData} alt="我的电子签名" className="w-full max-w-[800px] rounded border border-[var(--twin-hairline)] bg-white" />
        <p className="mt-2 text-xs text-[var(--twin-mute)]">
          已提交，不可更改。如需重签，请联系管理员重置。
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="mb-2 text-xs text-[var(--twin-mute)]">
        在方框里手写签名。提交后不可更改；也可以生成链接用手机扫码手写。
      </p>
      <SignaturePad
        value={draft}
        onChange={setDraft}
        outputSize={SIGNATURE_CANVAS}
        format="png"
        height={180}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy || !draft}
          className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          提交签名
        </button>
        <button
          type="button"
          onClick={handleMakeLink}
          disabled={busy}
          className="rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-1.5 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          生成手机签名链接
        </button>
      </div>
      {link && (
        <div className="mt-3 inline-block rounded-md border border-[var(--twin-hairline)] p-3 text-center">
          <QRCodeSVG value={link} size={160} />
          <p className="mt-2 max-w-[220px] break-all text-[10px] text-[var(--twin-mute)]">{link}</p>
        </div>
      )}
    </div>
  );
}
