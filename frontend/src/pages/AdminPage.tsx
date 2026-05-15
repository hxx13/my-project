import { LogOut, Shield, UserCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { authStorage } from "@/features/auth/authStorage";

export default function AdminPage() {
  const navigate = useNavigate();
  const role = authStorage.getRole() || "STUDENT";

  const handleLogout = () => {
    authStorage.clear();
    toast.success("已退出登录");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <div className="flex min-h-screen">
        <aside className="w-64 bg-slate-900 text-slate-100 p-5">
          <div className="mb-8 flex items-center gap-2 text-lg font-semibold">
            <Shield className="h-5 w-5 text-blue-400" />
            Admin Console
          </div>
          <nav className="space-y-2">
            <button className="w-full rounded-lg bg-blue-600/20 px-4 py-2 text-left text-sm text-blue-200">
              控制台总览
            </button>
            <button className="w-full rounded-lg px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/10">
              权限管理
            </button>
            <button className="w-full rounded-lg px-4 py-2 text-left text-sm text-slate-300 hover:bg-white/10">
              系统日志
            </button>
          </nav>
        </aside>

        <section className="flex-1 flex flex-col">
          <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
            <h1 className="text-base font-semibold">后台管理</h1>
            <div className="flex items-center gap-4">
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                当前角色: {role}
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                <UserCircle className="h-4 w-4" />
                退出
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="h-full rounded-xl border border-dashed border-slate-300 bg-white p-6">
              <h2 className="text-lg font-semibold">Admin Layout Ready</h2>
              <p className="mt-2 text-sm text-slate-500">
                这里是后台内容区占位，后续可按模块接入管理页面。
              </p>
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
