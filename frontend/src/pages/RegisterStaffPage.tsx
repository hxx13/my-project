import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { registerStaff } from "@/api/domains/auth.api";
import { authStorage } from "@/features/auth/authStorage";

export default function RegisterStaffPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || !inviteCode.trim()) {
      toast.error("请输入账号、密码与推荐码");
      return;
    }
    if (password.length < 6) {
      toast.error("密码至少 6 位");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次密码不一致");
      return;
    }
    try {
      setSubmitting(true);
      const data = await registerStaff(username.trim(), password, inviteCode.trim());
      authStorage.setAuth(data.token, data.role, data.userInfo);
      toast.success("注册成功");
      navigate("/", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "注册失败";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl p-8 shadow-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">教职工注册</h1>
          <p className="mt-2 text-sm text-slate-400">需管理员发放的推荐码；账号与密码由本人设置</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm text-slate-300">注册推荐码</label>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800/70 px-4 py-3 text-sm outline-none focus:border-blue-400"
              placeholder="由管理员或教职工本人发放的短期码"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">系统账号</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800/70 px-4 py-3 text-sm outline-none focus:border-blue-400"
              placeholder="请输入账号"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">系统密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800/70 px-4 py-3 text-sm outline-none focus:border-blue-400"
              placeholder="请输入密码"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-800/70 px-4 py-3 text-sm outline-none focus:border-blue-400"
              placeholder="请再次输入密码"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "注册中..." : "注 册"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          已有账号？
          <Link to="/login" className="ml-1 text-blue-400 hover:text-blue-300">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
