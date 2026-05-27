import {useState} from "react";
import {QRCodeSVG} from "qrcode.react";
import {MoreVertical} from "lucide-react";
import {DebugPersonCardShell} from "./DebugPersonCardShell";
import {resolvePersonnelAvatarUrl} from "@/utils/personnelAvatarUrl";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContactGroup } from "@/api/domains/chat.api";

type Props = {
    person: Record<string, unknown>;
    canStaffChatOps: boolean;
    isSelf: boolean;
    bookmarked: boolean;
    contactGroups: ContactGroup[];
    onAddBookmark: (uid: string) => void;
    onRemoveBookmark: (uid: string) => void;
    onAssignGroup: (uid: string, groupId: string | null) => void;
};

export function DebugPersonnelPersonCard({
    person,
    canStaffChatOps,
    isSelf,
    bookmarked,
    contactGroups,
    onAddBookmark,
    onRemoveBookmark,
    onAssignGroup,
}: Props) {
    const [qrOpen, setQrOpen] = useState(false);
    const uid = String(person.user_id ?? "").trim();
    const name = String(person.name ?? "");
    const exp = Number(person.total_exp ?? 0);
    const level = Math.floor(Math.sqrt(exp / 50.0)) + 1;
    const avatarSrc = resolvePersonnelAvatarUrl(person.head as string | undefined);
    const rawPerm = person.has_official_room_permission ?? person.hasOfficialRoomPermission;
    const hasOfficial = rawPerm === 1 || rawPerm === true || rawPerm === "1";
    const roomsDisplay = String(person.allowed_rooms_display_zh ?? person.allowedRoomsDisplayZh ?? "—");

    return (
        <DebugPersonCardShell
            name={name}
            userId={uid}
            avatarUrl={avatarSrc}
            badges={
                <>
                    <span className="rounded bg-gradient-to-r from-amber-400 to-orange-500 px-1.5 py-0.5 text-[10px] font-black text-white">
                        Lv.{level}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">Exp {exp.toFixed(0)}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-black ${hasOfficial ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                        官方可进 {hasOfficial ? "有" : "无"}
                    </span>
                </>
            }
            headerRight={
                <>
                    {canStaffChatOps && !isSelf && uid ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                                    aria-label="通讯录"
                                >
                                    <MoreVertical className="h-3.5 w-3.5"/>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-[10rem]">
                                {!bookmarked ? (
                                    <DropdownMenuItem onSelect={() => onAddBookmark(uid)}>加入通讯录</DropdownMenuItem>
                                ) : (
                                    <>
                                        <DropdownMenuItem onSelect={() => onRemoveBookmark(uid)} className="text-rose-600 focus:bg-rose-50">
                                            从通讯录移除
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator/>
                                        <DropdownMenuSub>
                                            <DropdownMenuSubTrigger>归入分组</DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                                                <DropdownMenuItem onSelect={() => onAssignGroup(uid, null)}>未分组</DropdownMenuItem>
                                                {contactGroups.map((g) => (
                                                    <DropdownMenuItem key={g.id} onSelect={() => onAssignGroup(uid, g.id)}>
                                                        {g.name}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setQrOpen((v) => !v)}
                        className="rounded border border-slate-200 bg-white p-0.5 shadow-sm"
                        title="模拟二维码"
                    >
                        <QRCodeSVG value={uid} size={qrOpen ? 72 : 40}/>
                    </button>
                </>
            }
        >
            <div className="space-y-1 text-[11px] leading-snug text-slate-600">
                <div className="font-bold text-slate-700">{String(person.user_type_names ?? "—")}</div>
                <div className="truncate" title={String(person.department_name ?? "")}>
                    {String(person.department_name ?? "—")}
                    {person.project_group_name ? (
                        <span className="font-normal text-slate-500"> · {String(person.project_group_name)}</span>
                    ) : null}
                </div>
                <div className="font-mono">{String(person.mobile_phone ?? "—")}</div>
                <div className="line-clamp-2 break-words text-slate-700" title={roomsDisplay}>
                    {roomsDisplay}
                </div>
            </div>
        </DebugPersonCardShell>
    );
}
