import { AlertOctagon, Briefcase, Phone, ShieldCheck, Users } from "lucide-react";
import type { AnalyzeUserInfo } from "@/api/types/scanner";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import { PROFILE_CARD } from "../scanPopupTheme";

interface ProfileHeaderProps {
    user: AnalyzeUserInfo;
    isAvatarLoaded: boolean;
    globalUserState: number;
    onAvatarError: () => void;
    onOpenRiskModal: () => void;
}

const Field = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between text-xs border-b border-[var(--app-color-border-default)] py-1.5 last:border-b-0">
        <span className="text-[var(--app-color-text-tertiary)]">{label}</span>
        <span className="text-[var(--app-color-text-primary)] font-semibold">{value || "【无数据】"}</span>
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
    <div className={`w-full ${PROFILE_CARD} p-5`}>
        <div className="flex items-center gap-4 border-b border-[var(--app-color-border-default)] pb-4">
            <div
                className="w-16 h-16 rounded-full overflow-hidden bg-[var(--app-color-surface-hover)] border-2 shadow-lg"
                style={{ borderColor: "var(--scan-profile-border, var(--app-color-scan-profile-border))" }}
            >
                {avatarSrc && isAvatarLoaded ? (
                    <img src={avatarSrc} className="w-full h-full object-cover" referrerPolicy="no-referrer" alt="avatar" onError={onAvatarError} />
                ) : (
                    <span className="w-full h-full flex items-center justify-center text-2xl font-black text-[var(--app-color-text-primary)]">
                        {(user.name || "未").charAt(0)}
                    </span>
                )}
            </div>
            <div className="flex flex-col">
                <span className="text-2xl font-black text-[var(--app-color-text-primary)] flex items-center gap-2">
                    {user.name || "未知人员"}
                    <button
                        onClick={onOpenRiskModal}
                        title="查看风控档案"
                        className={`p-1 rounded-full border ${
                            globalUserState === 3
                                ? "bg-[var(--app-color-feedback-danger)]/10 border-[var(--app-color-feedback-danger)]/30 text-[var(--app-color-feedback-danger)]"
                                : "bg-[var(--app-color-feedback-success)]/10 border-[var(--app-color-feedback-success)]/20 text-[var(--app-color-feedback-success)]"
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
