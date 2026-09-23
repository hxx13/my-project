import { useEffect, useState } from "react";
import {
  fetchMyExperimentRecords,
  type CageExperimentRecordRow,
  type MyExperimentRecordRoom,
  type MyExperimentRecordCage,
} from "@/api/domains/cageShelf.api";
import { displayPosition } from "@/features/cage-shelf/constants";

/**
 * 「我的实验记录」弹窗 —— 学生端（Web / H5 共用）。
 *
 * <p>按**房间**分组列出本人写过的全部实验记录：自己用过的笼位、从建立到
 * 失去权限/笼位归档为止的全部记录都在这里，记录整体已归档的笼位折叠成「已归档」，
 * 但内容仍可翻看 —— 这正是学生找历史实验记录用的。
 */
export default function MyExperimentRecordsDialog({ onClose }: { onClose: () => void }) {
  const [rooms, setRooms] = useState<MyExperimentRecordRoom[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** 「查看」弹窗里那条记录：列表只给 3 行摘要，全文与全部照片放这里 */
  const [viewRecord, setViewRecord] = useState<CageExperimentRecordRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyExperimentRecords()
      .then((r) => { if (!cancelled) setRooms(r); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : "加载失败"); });
    return () => { cancelled = true; };
  }, []);

  const loading = !rooms && !err;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--student-hairline)] bg-[var(--student-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--student-hairline)] px-4 py-3">
          <div>
            <div className="text-[14px] font-semibold text-[var(--student-ink)]">我的实验记录</div>
            <div className="text-[10px] text-[var(--student-mute)]">按房间分组 · 含已失去权限 / 已归档的历史笼位</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-lg leading-none text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && <div className="py-8 text-center text-[12px] text-[var(--student-mute)]">加载中…</div>}
          {err && <div className="py-8 text-center text-[12px] text-[var(--student-error)]">{err}</div>}
          {rooms && rooms.length === 0 && (
            <div className="py-8 text-center text-[12px] text-[var(--student-mute)]">还没有实验记录</div>
          )}
          {rooms?.map((room) => (
            <RoomGroup key={room.roomId || room.roomName} room={room} onPreview={setPreview} onView={setViewRecord} />
          ))}
        </div>
      </div>

      {preview !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={(e) => { e.stopPropagation(); setPreview(null); }}>
          <img src={preview} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}

      {viewRecord && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { e.stopPropagation(); setViewRecord(null); }}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--student-hairline)] bg-[var(--student-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--student-hairline)] px-4 py-3">
              <div>
                <div className="text-[12px] font-semibold tabular-nums text-[var(--student-ink)]">
                  {fmtTime(viewRecord.submittedAt ?? viewRecord.createdAt)}
                </div>
                <div className="text-[10px] text-[var(--student-mute)]">
                  记录人：{viewRecord.authorName}
                  {viewRecord.status === "ARCHIVED" && " · 已归档"}
                </div>
              </div>
              <button
                onClick={() => setViewRecord(null)}
                className="rounded-md p-1 text-lg leading-none text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft)]"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {viewRecord.content ? (
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--student-ink)]">{viewRecord.content}</div>
              ) : (
                <div className="text-[12px] text-[var(--student-mute)]">（本条只有照片）</div>
              )}
              {parseImages(viewRecord.imagesJson).length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {parseImages(viewRecord.imagesJson).map((url, i) => (
                    <img
                      key={`${url}:${i}`}
                      src={url}
                      alt=""
                      onClick={() => setPreview(url)}
                      className="aspect-square w-full cursor-pointer rounded-lg border border-[var(--student-hairline)] object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomGroup({
  room,
  onPreview,
  onView,
}: {
  room: MyExperimentRecordRoom;
  onPreview: (url: string) => void;
  onView: (row: CageExperimentRecordRow) => void;
}) {
  const [open, setOpen] = useState(true);
  const total = room.cages.reduce((n, c) => n + c.records.length, 0);
  const path = dedupePath([room.campusName, room.areaName, room.floorName]);
  return (
    <div className="rounded-lg border border-[var(--student-hairline)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--student-canvas-soft)]"
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[10px] text-[var(--student-mute)]">{open ? "▾" : "▸"}</span>
          <span className="truncate text-[14px] font-semibold text-[var(--student-ink)]">
            {room.roomName || "未知房间"}
          </span>
          {path && <span className="truncate text-[10px] text-[var(--student-mute)]">{path}</span>}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--student-mute)]">
          {room.cages.length} 笼位 · {total} 条
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-2.5 pb-2.5">
          {room.cages.map((cage) => (
            <CageBlock key={String(cage.animalCageId)} cage={cage} onPreview={onPreview} onView={onView} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 笼位是灰底容器、记录是白卡 —— 三级层次：弹窗白 → 房间 → 笼位灰 → 记录白 */
function CageBlock({
  cage,
  onPreview,
  onView,
}: {
  cage: MyExperimentRecordCage;
  onPreview: (url: string) => void;
  onView: (row: CageExperimentRecordRow) => void;
}) {
  const [open, setOpen] = useState(!cage.archived);
  const label = posLabel(cage.positionX, cage.positionY);
  return (
    <div className="rounded-lg bg-[var(--student-canvas-soft)] px-2.5 py-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[9px] text-[var(--student-mute)]">{open ? "▾" : "▸"}</span>
          <span className="truncate text-[12px] font-semibold text-[var(--student-ink)]">笼位 {label}</span>
          {cage.shelveName && <span className="truncate text-[10px] text-[var(--student-mute)]">{cage.shelveName}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {cage.archived && (
            <span className="rounded-full border border-[var(--student-hairline)] bg-[var(--student-surface)] px-1.5 py-px text-[9px] text-[var(--student-mute)]">
              已归档
            </span>
          )}
          <span className="text-[10px] tabular-nums text-[var(--student-mute)]">{cage.records.length} 条</span>
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {cage.records.map((r) => (
            <RecordLine key={r.id} row={r} onPreview={onPreview} onView={onView} />
          ))}
        </div>
      )}
    </div>
  );
}

/** 记录卡：白底 + 1px 描边，与详情面板里的台账卡同一套观感 */
function RecordLine({
  row,
  onPreview,
  onView,
}: {
  row: CageExperimentRecordRow;
  onPreview: (url: string) => void;
  onView: (row: CageExperimentRecordRow) => void;
}) {
  const imgs = parseImages(row.imagesJson);
  const draft = row.status === "DRAFT";
  return (
    <div className="rounded-lg border border-[var(--student-hairline)] bg-[var(--student-surface)] px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold tabular-nums text-[var(--student-ink)]">
          {fmtTime(row.submittedAt ?? row.createdAt)}
        </span>
        <span className="truncate text-[10px] text-[var(--student-mute)]">{row.authorName}</span>
        {draft && <span className="shrink-0 text-[10px] text-[var(--student-mute)]">草稿</span>}
        <button
          type="button"
          onClick={() => onView(row)}
          className="ml-auto shrink-0 rounded border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--student-primary)]"
        >
          查看
        </button>
      </div>
      {row.content && (
        <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--student-ink)]">
          {row.content}
        </div>
      )}
      {imgs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {imgs.slice(0, 6).map((url, i) => (
            <img
              key={`${url}:${i}`}
              src={url}
              alt=""
              onClick={() => onPreview(url)}
              className="h-14 w-14 cursor-pointer rounded border border-[var(--student-hairline)] object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 校区/区域同值时别把「浦东 / 浦东 / 浦东 2F」念两遍 */
function dedupePath(parts: Array<string | undefined>): string {
  const out: string[] = [];
  for (const p of parts) {
    const v = (p || "").trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out.join(" / ");
}


/** 原始坐标 → 网格显示口径的位号（列转字母、行号取反，与网格一致） */
function posLabel(x: number | null, y: number | null): string {
  if (x == null || y == null) return "—";
  return displayPosition(`${String.fromCharCode(64 + x)}-${y}`);
}

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.replace("T", " ").slice(0, 16);
}
