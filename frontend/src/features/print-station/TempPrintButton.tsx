import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { PrintDispatchDialog } from "./PrintDispatchDialog";

/**
 * 临时打印：选一个文件 → 填派发选项 → 打完即删。
 *
 * 跟「文件模板库」正相反 —— 那边是长期留档、反复使用；这边是传一次、打一次，
 * 服务端不留文件，也不在模板库列表里出现。
 *
 * 为什么必须先上传：工位是从服务端拉文件来渲染的，没有落地方就没得拉。
 * 所以「不留痕」只能靠打完再删，不能靠不落盘。
 * 上传被放在**确认之后**，用户取消就什么都没产生。
 *
 * 注意：删的只是服务端那份。你本机的打印后台（Spooler）和浏览器缓存里
 * 可能还留着痕迹，那不在我们能管的范围内。
 */
export function TempPrintButton() {
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setFile(f);
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf"
        onChange={onFile}
      />
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)]"
        onClick={() => fileRef.current?.click()}
      >
        <Printer className="h-4 w-4" />
        临时打印
      </button>

      {file ? (
        <PrintDispatchDialog
          open
          onOpenChange={(v) => {
            if (!v) setFile(null);
          }}
          sourceType="ADMIN_FILE"
          sourceId=""
          fileName={file.name}
          pendingFile={file}
        />
      ) : null}
    </>
  );
}

export default TempPrintButton;
