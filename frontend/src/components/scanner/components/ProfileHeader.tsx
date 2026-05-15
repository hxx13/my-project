import { AlertOctagon, Briefcase, Phone, ShieldCheck, Users } from "lucide-react";
import type { AnalyzeUserInfo } from "@/api/types/scanner";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";

interface ProfileHeaderProps {
    user: AnalyzeUserInfo;
    isAvatarLoaded: boolean;
    globalUserState: number;
    onAvatarError: () => void;
    onOpenRiskModal: () => void;
}

const Field = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between text-xs border-b border-white/10 py-1">
        <span className="text-white/60">{label}</span>
        <span className="text-white font-semibold">{value || "【无数据】"}</span>
    </div>
);

export const ProfileHeader = ({
    user,
    isAvatarLoaded,
    globalUserState,
    onAvatarError,
    onOpenRiskModal,
}: ProfileHeaderProps) => {
    const avatarSrc = resolvePersonnelAvatarUrl(user.head);
    return (
    <div className="w-full bg-[#050A15]/60 backdrop-blur-sm border border-white/5 p-5 rounded-3xl shadow-2xl">
        <div className="flex items-center gap-4 border-b border-white/10 pb-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-[#1e293b] border-2 border-blue-400/50">
                {avatarSrc && isAvatarLoaded ? (
                    <img src={avatarSrc} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="avatar" onError={onAvatarError} />
                ) : (
                    <span className="w-full h-full flex items-center justify-center text-2xl font-black text-white">
                        {(user.name || "未").charAt(0)}
                    </span>
                )}
            </div>
            <div className="flex flex-col">
                <span className="text-2xl font-black text-white flex items-center gap-2">
                    {user.name || "未知人员"}
                    <button
                        onClick={onOpenRiskModal}
                        title="查看风控档案"
                        className={`p-1 rounded-full border ${
                            globalUserState === 3
                                ? "bg-red-500/20 border-red-500/50 text-red-500"
                                : "bg-green-500/10 border-green-500/30 text-green-500"
                        }`}
                    >
                        {globalUserState === 3 ? <AlertOctagon className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                    </button>
                </span>
            </div>
        </div>
        <div className="mt-3 flex flex-col gap-1">
            <Field label="院系" value={user.department_name || ""} />
            <Field label="课题组" value={user.project_group_name || ""} />
            <Field label="手机号" value={user.mobile_phone || ""} />
            <Field label="身份角色" value={user.user_type_names || ""} />
            <div className="hidden">
                <Briefcase /><Users /><Phone /><ShieldCheck />
            </div>
        </div>
    </div>
    );
};
