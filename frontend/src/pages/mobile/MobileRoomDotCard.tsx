/** 房间卡：把房间数据映射到铭牌组件（RoomPlateCard），权限态 → 色调/铭牌文案 */
import { dotColor, type RoomPreviewMeta } from "./utils/roomPreviewMeta";
import type { MobileRoomAccessMeta } from "./utils/mobileScanRoomAccess";
import RoomPlateCard, { type RoomPlateTone } from "@/components/ui/RoomPlateCard";

interface MobileRoomDotCardProps {
  room: RoomPreviewMeta;
  access: MobileRoomAccessMeta;
  onClick: () => void;
}

/** 门禁态 → 铭牌色调：可进=金、待激活=琥珀、被拦=陶红、无权限=灰 */
const TONE_BY_STATE: Record<MobileRoomAccessMeta["state"], RoomPlateTone> = {
  allowed: "allowed",
  pending: "pending",
  blocked: "blocked",
  none: "none",
};

export default function MobileRoomDotCard({ room, access, onClick }: MobileRoomDotCardProps) {
  const locked = !access.canOpenDetail;
  const tone = TONE_BY_STATE[access.state];
  const label =
    access.reasonShort ??
    (access.state === "allowed" ? "可进入" : access.state === "pending" ? "待激活" : "无权限");

  return (
    <RoomPlateCard
      code={room.shortName}
      label={label}
      tone={tone}
      locked={locked}
      hasPeople={room.usedCount > 0}
      codeSize={room.nameFontPx}
      codeScale={room.nameScale}
      dots={room.dotList.map((dot) => ({
        used: dot.used,
        color: locked ? "#c4c8ce" : dotColor(dot.level, dot.used),
      }))}
      onClick={onClick}
    />
  );
}
