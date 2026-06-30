/** 小程序房间详情弹窗（数据来自 wechat-overview occupants） */
import { X } from "lucide-react";
import type { DetailRoom } from "./utils/roomPreviewMeta";

export default function MobileRoomDetailDialog({
  detail,
  onClose,
}: {
  detail: DetailRoom;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 800, background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "#fff", maxHeight: "72vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "#ebedf0" }}
        >
          <span className="text-sm font-bold truncate pr-2" style={{ color: "#323233" }}>
            房间详情
          </span>
          <button type="button" onClick={onClose} className="p-1 rounded-lg shrink-0">
            <X className="size-4" style={{ color: "#94a3b8" }} />
          </button>
        </div>
        <div className="overflow-y-auto px-8 py-5 text-center" style={{ maxHeight: "calc(72vh - 48px)" }}>
          <p className="text-base font-bold mb-4 break-all" style={{ color: "#323233" }}>
            {detail.roomName}
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-5">
            <div
              className="min-w-[100px] px-4 py-3 rounded-xl flex flex-col items-center gap-1"
              style={{ background: "#f7f8fa", border: "1px solid #ebedf0" }}
            >
              <span className="text-[11px]" style={{ color: "#969799" }}>上限</span>
              <span className="text-lg font-bold" style={{ color: "#323233" }}>
                {detail.totalCapacity}
              </span>
            </div>
            <div
              className="min-w-[100px] px-4 py-3 rounded-xl flex flex-col items-center gap-1"
              style={{
                background: "linear-gradient(135deg, #e8f3ff 0%, #f0f7ff 100%)",
                border: "1px solid rgba(25,137,250,0.25)",
              }}
            >
              <span className="text-[11px]" style={{ color: "#969799" }}>当前房间人数</span>
              <span className="text-lg font-bold" style={{ color: "#1989fa" }}>
                {detail.currentRoomCount}
              </span>
            </div>
          </div>
          <p className="text-sm font-semibold mb-3" style={{ color: "#323233" }}>在场人员</p>
          {detail.occupantRows.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "#969799" }}>暂无人员</p>
          ) : (
            <div className="space-y-3 text-left">
              {detail.occupantRows.map((row, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl"
                  style={{
                    background: "#fff",
                    border: "1px solid #ebedf0",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold truncate" style={{ color: "#323233" }}>
                      {row.userName}
                    </span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full shrink-0 font-medium"
                      style={{ color: "#1989fa", background: "#e8f3ff" }}
                    >
                      {row.entryTypeLabel}
                    </span>
                  </div>
                  {row.projectGroup && (
                    <div
                      className="flex justify-between gap-2 pt-1 border-t"
                      style={{ borderColor: "#f2f3f5" }}
                    >
                      <span className="text-xs" style={{ color: "#969799" }}>课题组</span>
                      <span className="text-xs font-medium" style={{ color: "#646566" }}>
                        {row.projectGroup}
                      </span>
                    </div>
                  )}
                  <div
                    className="flex justify-between gap-2 pt-1 border-t"
                    style={{ borderColor: "#f2f3f5" }}
                  >
                    <span className="text-xs" style={{ color: "#969799" }}>进入时间</span>
                    <span className="text-xs font-medium" style={{ color: "#646566" }}>
                      {row.entryTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
