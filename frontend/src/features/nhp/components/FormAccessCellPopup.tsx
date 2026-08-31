import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchNhpFormAccess, setNhpFormAccess, type NhpFormAccess } from "../api/nhpFormAccess.api";

type SwitchKey = keyof Omit<NhpFormAccess, "formKey" | "projectId" | "eventId">;

const SWITCHES: { key: SwitchKey; label: string }[] = [
  { key: "locked", label: "锁定" },
  { key: "selfView", label: "本人查看" },
  { key: "othersView", label: "他人查看" },
  { key: "selfEdit", label: "本人编辑" },
  { key: "othersEdit", label: "他人编辑" },
];

export default function FormAccessCellPopup({
  projectId,
  eventId,
  formKey,
  onClose,
}: {
  projectId: number;
  eventId: number;
  formKey: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const accessQuery = useQuery({
    queryKey: ["nhp", "form-access", projectId, eventId, formKey],
    queryFn: () => fetchNhpFormAccess(formKey, projectId, eventId),
  });
  const acc = accessQuery.data;

  const setMut = useMutation({
    mutationFn: (patch: Partial<Omit<NhpFormAccess, "formKey" | "projectId" | "eventId">>) =>
      setNhpFormAccess(formKey, patch, projectId, eventId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nhp", "form-access", projectId, eventId, formKey] }),
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  return (
    <div className="aup-modal-mask" onClick={onClose}>
      <div className="aup-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3>表单权限（该事件/阶段）</h3>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0" }}>
          表单「{formKey}」 · 阶段 #{eventId}（未单独配置的项回退表单级/全局默认）
        </p>
        {!acc ? (
          <div style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}>加载中…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SWITCHES.map((s) => (
              <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={acc[s.key]}
                  onChange={(e) => setMut.mutate({ [s.key]: e.target.checked } as Partial<Omit<NhpFormAccess, "formKey" | "projectId" | "eventId">>)}
                />
                {s.label}
              </label>
            ))}
          </div>
        )}
        <div className="aup-modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
