import { useState } from "react";
import { StudentCard } from "../components/ui/card";
import { StudentInput } from "../components/ui/input";
import { StudentButton } from "../components/ui/button";
import { ThemePicker } from "../components/ui/theme-picker";
import { useStudentTheme } from "../hooks/use-student-theme";
import { changePasswordAfterReset } from "@/api/domains/auth.api";

export default function StudentSettingsPage() {
  const { theme, setTheme } = useStudentTheme();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      setMsg({ type: "error", text: "请填写旧密码和新密码" });
      return;
    }
    try {
      setChanging(true);
      setMsg(null);
      await changePasswordAfterReset(oldPassword, newPassword);
      setMsg({ type: "success", text: "密码修改成功" });
      setOldPassword("");
      setNewPassword("");
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "修改密码失败" });
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      {/* 主题色卡片 */}
      <StudentCard padding="lg">
        <h3 className="text-sm font-semibold text-[var(--student-foreground)] mb-3">
          主题色
        </h3>
        <ThemePicker current={theme} onChange={setTheme} />
      </StudentCard>

      {/* 修改密码卡片 */}
      <StudentCard padding="lg">
        <h3 className="text-sm font-semibold text-[var(--student-foreground)] mb-3">
          修改密码
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--student-mute-foreground)] mb-1">
              旧密码
            </label>
            <StudentInput
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="请输入旧密码"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--student-mute-foreground)] mb-1">
              新密码
            </label>
            <StudentInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="请输入新密码"
            />
          </div>

          {msg && (
            <p
              className="text-xs"
              style={{
                color:
                  msg.type === "success"
                    ? "var(--student-success)"
                    : "var(--student-error)",
              }}
            >
              {msg.text}
            </p>
          )}

          <StudentButton onClick={handleChangePassword} disabled={changing}>
            {changing ? "修改中..." : "修改密码"}
          </StudentButton>
        </div>
      </StudentCard>
    </div>
  );
}
