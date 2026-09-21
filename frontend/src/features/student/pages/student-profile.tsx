import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import SearchSelect from "@/components/cage/SearchSelect";
import { StudentButton, StudentInput, StudentCard, StudentSelect, showToast } from "../components/ui";
import { useStudentDashboard } from "../hooks/use-student-dashboard";
import { studentQueryKey } from "../utils/studentQueryScope";
import { fetchDepartments, updateMyProfile, type DepartmentDict } from "@/api/domains/admin.api";
import type { DashboardData } from "../api/student.api";

const GENDER_OPTIONS = [
  { value: "0", label: "未知" },
  { value: "1", label: "男" },
  { value: "2", label: "女" },
];

export default function StudentProfilePage() {
  const { data, isLoading, isError, error, refetch } = useStudentDashboard();

  if (isLoading) {
    return <div className="flex min-h-full items-center justify-center text-sm text-[var(--student-mute)]">加载中…</div>;
  }
  if (isError || !data) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[var(--student-mute)]">
            {error instanceof Error ? error.message : "加载档案失败"}
          </p>
          <StudentButton variant="secondary" onClick={() => refetch()} className="mt-3">
            重试
          </StudentButton>
        </div>
      </div>
    );
  }

  return <ProfileForm profile={data.profile} />;
}

function ProfileForm({ profile }: { profile: DashboardData["profile"] }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState(profile.name ?? "");
  const [mobilePhone, setMobilePhone] = useState(profile.mobilePhone ?? "");
  const [gender, setGender] = useState(profile.gender != null ? String(profile.gender) : "0");
  const [departmentName, setDepartmentName] = useState(profile.departmentName ?? "");
  const [depts, setDepts] = useState<DepartmentDict[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; mobilePhone?: string }>({});

  useEffect(() => {
    fetchDepartments()
      .then(setDepts)
      .catch(() => setDepts([]));
  }, []);

  const searchDept = async (kw: string) => {
    const k = kw.trim();
    const list = k ? depts.filter((d) => d.name.includes(k)) : depts;
    return list.map((d) => ({ key: String(d.id), label: d.name }));
  };

  const handleSave = async () => {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "姓名不能为空";
    if (!mobilePhone.trim()) next.mobilePhone = "手机号不能为空";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      setSaving(true);
      await updateMyProfile({
        name: name.trim(),
        mobilePhone: mobilePhone.trim(),
        gender: Number(gender),
        departmentName: departmentName.trim() || undefined,
      });
      qc.invalidateQueries({ queryKey: studentQueryKey("dashboard") });
      showToast("资料已保存", "success");
      navigate("/student/home", { replace: true });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full overflow-y-auto bg-[var(--student-canvas-soft)] p-4">
      <div className="mx-auto w-full max-w-lg">
        <button
          type="button"
          onClick={() => navigate("/student/home")}
          className="mb-3 inline-flex cursor-pointer items-center gap-1 text-sm text-[var(--student-mute)] transition-colors hover:text-[var(--student-ink)]"
        >
          <ArrowLeft className="size-4" /> 返回首页
        </button>

        <StudentCard padding="lg">
          <h1 className="text-xl font-bold text-[var(--student-ink)]">完善资料</h1>
          <p className="mt-1 text-sm text-[var(--student-mute)]">补全你的联系方式，便于通知与识别</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">姓名</label>
              <StudentInput value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">手机号</label>
              <StudentInput value={mobilePhone} onChange={(e) => setMobilePhone(e.target.value)} error={errors.mobilePhone} autoComplete="tel" />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">性别</label>
              <StudentSelect value={gender} onChange={(e) => setGender(e.target.value)} options={GENDER_OPTIONS} />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--student-ink)]">部门</label>
              <SearchSelect search={searchDept} onPick={(opt) => setDepartmentName(opt.label)} placeholder="搜索部门" emptyHint="没有匹配的部门" />
              {departmentName && (
                <p className="mt-1.5 text-xs text-[var(--student-mute)]">已选：{departmentName}</p>
              )}
            </div>

            <StudentButton onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "保存中..." : "保存"}
            </StudentButton>
          </div>
        </StudentCard>
      </div>
    </div>
  );
}
