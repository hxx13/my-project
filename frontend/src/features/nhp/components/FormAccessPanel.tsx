import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { fetchNhpFormAccessList, setNhpFormAccess, type NhpFormAccess } from "../api/nhpFormAccess.api";

interface FormItem {
  formKey: string;
  title?: string;
}

const DEFAULTS: Omit<NhpFormAccess, "formKey" | "projectId"> = {
  locked: false,
  selfView: true,
  othersView: true,
  selfEdit: true,
  othersEdit: true,
};

type SwitchKey = keyof typeof DEFAULTS;

const SWITCHES: { key: SwitchKey; label: string }[] = [
  { key: "locked", label: "锁定" },
  { key: "selfView", label: "本人查看" },
  { key: "othersView", label: "他人查看" },
  { key: "selfEdit", label: "本人编辑" },
  { key: "othersEdit", label: "他人编辑" },
];

export default function FormAccessPanel({ forms, projectId = 0 }: { forms: FormItem[]; projectId?: number }) {
  const qc = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["nhp", "form-access", projectId],
    queryFn: fetchNhpFormAccessList,
  });
  // 只取当前项目（或全局）的设置；同一 formKey 按项目隔离
  const map = new Map(
    (listQuery.data ?? [])
      .filter((a) => (a.projectId ?? 0) === projectId)
      .map((a) => [a.formKey, a]),
  );

  const toggleMut = useMutation({
    mutationFn: ({ formKey, patch }: { formKey: string; patch: Partial<Omit<NhpFormAccess, "formKey" | "projectId">> }) =>
      setNhpFormAccess(formKey, patch, projectId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["nhp", "form-access", projectId] }),
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const accessOf = (formKey: string): NhpFormAccess => map.get(formKey) ?? { formKey, projectId, ...DEFAULTS };

  return (
    <div className="aup-wb-panel" style={{ marginTop: 12 }}>
      <div className="aup-wb-panel-hd">
        <span className="title">表单权限（锁定 / 查看 / 编辑）</span>
        <span className="aup-wb-chip muted">{projectId === 0 ? "全局默认" : `项目 #${projectId}`} · 本人=创建者/填写人；他人=同团队其它成员</span>
      </div>
      <table className="list-table">
        <thead>
          <tr>
            <th>表单</th>
            {SWITCHES.map((s) => (
              <th key={s.key} style={{ textAlign: "center", width: 80 }}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {forms.map((f) => {
            const acc = accessOf(f.formKey);
            return (
              <tr key={f.formKey}>
                <td className="proj-name">{f.title || f.formKey}</td>
                {SWITCHES.map((s) => (
                  <td key={s.key} style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={acc[s.key] as boolean}
                      onChange={(e) =>
                        toggleMut.mutate({ formKey: f.formKey, patch: { [s.key]: e.target.checked } })
                      }
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
