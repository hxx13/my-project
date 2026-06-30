/** 小程序房间页同款圆点卡片（含扫码进入权限态） */
import type { CSSProperties } from "react";
import { dotColor, type RoomPreviewMeta } from "./utils/roomPreviewMeta";
import type { MobileRoomAccessMeta } from "./utils/mobileScanRoomAccess";

interface MobileRoomDotCardProps {
  room: RoomPreviewMeta;
  access: MobileRoomAccessMeta;
  onClick: () => void;
}

export default function MobileRoomDotCard({ room, access, onClick }: MobileRoomDotCardProps) {
  const interactive = access.canOpenDetail;

  const shellStyle: CSSProperties = {
    minHeight: 72,
    background: access.dimmed
      ? "linear-gradient(145deg, #e8eaee 0%, #dfe2e8 50%, #d5d9e0 100%)"
      : "linear-gradient(145deg, #ffffff 0%, #f5f7fa 50%, #eef1f6 100%)",
    border: access.dimmed ? "1px solid rgba(30,55,90,0.06)" : "1px solid rgba(30,55,90,0.1)",
    boxShadow: access.dimmed ? "none" : "0 3px 10px rgba(20,40,70,0.07)",
    opacity: access.dimmed ? 0.88 : 1,
  };

  const content = (
    <>
      <div className="w-full min-w-0 flex justify-center overflow-hidden">
        <span
          className="font-semibold whitespace-nowrap inline-block text-center"
          style={{
            color: access.dimmed ? "#8a9199" : "#1a2533",
            fontSize: room.nameFontPx,
            transform: `scale(${room.nameScale})`,
            transformOrigin: "center center",
          }}
        >
          {room.shortName}
        </span>
      </div>
      <div
        className="flex flex-row items-center justify-center flex-nowrap"
        style={{ gap: room.dotGapPx }}
      >
        {room.dotList.map((dot, i) => (
          <div
            key={i}
            className="rounded-full shrink-0"
            style={{
              width: 7,
              height: 7,
              background: access.dimmed
                ? dot.used
                  ? "#b8bcc4"
                  : "#d8dbe0"
                : dotColor(dot.level, dot.used),
            }}
          />
        ))}
      </div>
      {access.reasonShort && (
        <span
          className="text-[10px] leading-tight text-center truncate max-w-full px-2 py-0.5 rounded-full"
          style={{
            color: access.dimmed ? "#969799" : "#646566",
            background: access.dimmed ? "rgba(0,0,0,0.06)" : "rgba(25,137,250,0.08)",
          }}
        >
          {access.reasonShort}
        </span>
      )}
    </>
  );

  if (!interactive) {
    return (
      <div
        className="rounded-[11px] px-2.5 py-3 flex flex-col items-center gap-1.5 cursor-not-allowed"
        style={shellStyle}
        aria-disabled="true"
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[11px] px-2.5 py-3 flex flex-col items-center gap-1.5 active:scale-[0.98] transition-transform"
      style={shellStyle}
    >
      {content}
    </button>
  );
}
