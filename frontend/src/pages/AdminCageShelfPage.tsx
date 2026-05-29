import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Upload } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  fetchCageShelfDetail,
  fetchCageShelfFilterOptions,
  fetchCageShelfIndexes,
  importCageShelfCsv,
  type CageShelfCell,
  type CageShelfDetail,
  type CageShelfFilterOptions,
  type CageShelfIndexRow,
} from "@/api/domains/cageShelf.api";
import { AdminFormCard, AdminPageShell, AdminDataTableWrap } from "@/components/admin/AdminPageShell";
import { AdminButton } from "@/components/admin/AdminButton";
import { adminLabelClass } from "@/features/admin/adminFormUi";
import DataSkeleton from "@/components/ui/DataSkeleton";

const CAGE_BOX_INFO_FIELD_ORDER = [
  "AnimalCageType", "PositionX", "PositionY", "AreaId", "DepartmentName",
  "floorId", "RoomName", "ShelveName", "ProjectPiName", "MobilePhone",
  "AupNumber", "CageBoxQrCode", "createAdmin", "CreateTime", "UpdateTime",
  "SpecialBreedingName", "specialBreedingDescription", "State", "StateName", "HasPhysicalBox",
] as const;

const CAGE_BOX_INFO_LABEL: Record<string, string> = {
  AnimalCageType: "笼位类型", PositionX: "X 坐标", PositionY: "Y 坐标",
  AreaId: "区域 ID", DepartmentName: "部门", floorId: "楼层 ID",
  RoomName: "房间名称", ShelveName: "笼架名称", ProjectPiName: "课题 PI",
  MobilePhone: "手机号", AupNumber: "AUP 编号", CageBoxQrCode: "笼盒卡号",
  createAdmin: "创建人", CreateTime: "创建时间", UpdateTime: "更新时间",
  SpecialBreedingName: "特殊繁育名称", specialBreedingDescription: "特殊繁育说明",
  State: "状态值", StateName: "状态名称", HasPhysicalBox: "是否有实体笼盒",
};

function formatCageDetailValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v);
}

function nonEmptyText(s?: string | null): boolean {
  return typeof s === "string" && s.trim() !== "";
}

function cageCardTone(cell: CageShelfCell): string {
  if (cell.empty) return "border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] text-[var(--twin-mute)]";
  if (cell.animalCageType === 1 || cell.stateLabel === "等待分配") {
    return "border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900";
  }
  if (cell.animalCageType === 2 || cell.stateLabel === "已预约(无笼盒)") {
    return "border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-900";
  }
  if (cell.animalCageType === 3 || cell.stateLabel === "已预约(有笼盒)") {
    return "border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900";
  }
  return "border-blue-200 bg-blue-50 hover:bg-blue-100 text-slate-700";
}

function ShelfGrid({
  title, detail, loading, emptyHint, onCellClick,
}: {
  title: string;
  detail: CageShelfDetail | null;
  loading: boolean;
  emptyHint?: string;
  onCellClick: (cell: CageShelfCell) => void;
}) {
  const cells = detail?.grid ?? [];
  return (
    <div className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-3 min-h-0 flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--twin-ink)]">{title}</div>
        {detail?.shelfMeta && (
          <div className="text-[11px] text-[var(--twin-mute)]">
            {detail.shelfMeta.campusName} / {detail.shelfMeta.areaName} / {detail.shelfMeta.floorName} / {detail.shelfMeta.roomName} / {detail.shelfMeta.shelveName || detail.shelfMeta.shelveId}
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center">加载中...</div>
      ) : !detail ? (
        <div className="flex-1 rounded-twin-lg border border-dashed text-xs text-[var(--twin-mute)] grid place-items-center px-2 text-center">
          {emptyHint ?? "暂无数据"}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="grid grid-cols-8 gap-1.5">
            {cells.map((cell) => {
              const piTeacher =
                nonEmptyText(cell.projectPiName)
                  ? cell.projectPiName!.trim()
                  : nonEmptyText(cell.piName)
                    ? cell.piName!.trim()
                    : "";
              return (
                <button
                  key={`${cell.position}`}
                  type="button"
                  className={`min-h-[82px] rounded-twin-md border text-[10px] leading-tight transition ${cageCardTone(cell)}`}
                  onClick={() => !cell.empty && onCellClick(cell)}
                  disabled={cell.empty}
                >
                  <div className="flex min-h-[76px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
                    <div className="w-full font-bold">{cell.position}</div>
                    {cell.empty ? (
                      <div className="text-[9px] text-[var(--twin-mute)]">空位</div>
                    ) : (
                      <>
                        {nonEmptyText(cell.departmentName) && (
                          <div className="w-full truncate text-[9px] font-medium text-[var(--twin-body)]">{cell.departmentName}</div>
                        )}
                        {nonEmptyText(cell.projectGroup) && (
                          <div className="w-full truncate">{cell.projectGroup}</div>
                        )}
                        {nonEmptyText(piTeacher) && <div className="w-full truncate text-[11px] font-semibold text-[var(--twin-ink)]">{piTeacher}</div>}
                        {nonEmptyText(cell.stateLabel) && (
                          <div className="w-full text-[9px] text-[var(--twin-mute)]">{cell.stateLabel}</div>
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCageShelfPage() {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [campusId, setCampusId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>("");
  const [areaName, setAreaName] = useState("");
  const [floorId, setFloorId] = useState<string>("");
  const [floorName, setFloorName] = useState("");
  const [roomId, setRoomId] = useState<string>("");
  const [roomName, setRoomName] = useState("");
  const [roomShelfDetails, setRoomShelfDetails] = useState<CageShelfDetail[]>([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [activeCell, setActiveCell] = useState<CageShelfCell | null>(null);

  const optionsQueryKey = [
    "cageShelfFilterOptions",
    { campusId, areaId, areaName, floorId, floorName, roomId, roomName },
  ] as const;

  const { data: options = { campuses: [], areas: [], floors: [], rooms: [], shelves: [] } } = useQuery({
    queryKey: optionsQueryKey,
    queryFn: () =>
      fetchCageShelfFilterOptions({
        campusId: campusId ? Number(campusId) : undefined,
        areaId: areaId || undefined,
        areaName: areaName || undefined,
        floorId: floorId || undefined,
        floorName: floorName || undefined,
        roomId: roomId || undefined,
        roomName: roomName || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const indexesQueryKey = [
    "cageShelfIndexes",
    { campusId, areaId, floorId, roomId },
  ] as const;

  const { data: indexData } = useQuery({
    queryKey: indexesQueryKey,
    queryFn: () =>
      fetchCageShelfIndexes({
        campusId: campusId ? Number(campusId) : undefined,
        areaId: areaId || undefined,
        floorId: floorId || undefined,
        roomId: roomId || undefined,
        page: 1,
        size: 200,
      }),
    placeholderData: (prev) => prev,
  });

  const indexRows = indexData?.rows || [];
  const indexTotal = Number(indexData?.total || 0);

  const shelfIdsSignature = useMemo(
    () => (options.shelves ?? []).map((s) => s.shelveId).join(","),
    [options.shelves]
  );

  // Cascade reset: clear downstream selections when upstream changes
  useEffect(() => { setAreaId(""); setAreaName(""); setFloorId(""); setFloorName(""); setRoomId(""); setRoomName(""); setRoomShelfDetails([]); }, [campusId]);
  useEffect(() => { setFloorId(""); setFloorName(""); setRoomId(""); setRoomName(""); setRoomShelfDetails([]); }, [areaId, areaName]);
  useEffect(() => { setRoomId(""); setRoomName(""); setRoomShelfDetails([]); }, [floorId, floorName]);
  useEffect(() => { setRoomShelfDetails([]); }, [roomId, roomName]);

  // Sequential shelf detail loading
  useEffect(() => {
    if (!roomId || !roomName) {
      setRoomShelfDetails([]);
      return;
    }
    if (!shelfIdsSignature) {
      setRoomShelfDetails([]);
      return;
    }
    const shelves = options.shelves ?? [];
    if (shelves.length === 0) {
      setRoomShelfDetails([]);
      return;
    }
    let cancelled = false;
    setRoomLoading(true);
    setRoomShelfDetails([]);
    void (async () => {
      try {
        const loaded: CageShelfDetail[] = [];
        for (const shelf of shelves) {
          const detail = await fetchCageShelfDetail(shelf.shelveId);
          if (cancelled) return;
          loaded.push(detail);
          setRoomShelfDetails([...loaded]);
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "加载房间笼架失败");
          setRoomShelfDetails([]);
        }
      } finally {
        if (!cancelled) setRoomLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roomId, roomName, shelfIdsSignature]);

  const onImport = async (file?: File) => {
    if (!file) return;
    try {
      const stat = await importCageShelfCsv(file);
      const created = Number(stat?.created || 0);
      const updated = Number(stat?.updated || 0);
      const skipped = Number(stat?.skipped || 0);
      toast.success(`导入完成：新增 ${created}，更新 ${updated}，跳过 ${skipped}`);
      const importErrors = stat?.errors;
      if (Array.isArray(importErrors) && importErrors.length > 0) {
        toast((t) => (
          <div className="text-xs">
            <div className="font-semibold mb-1">导入存在部分异常（仅展示前1条）</div>
            <div className="text-[var(--twin-body)]">{String(importErrors[0])}</div>
            <button className="mt-1 text-[var(--twin-link-deep)]" onClick={() => toast.dismiss(t.id)}>关闭</button>
          </div>
        ));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
  };

  return (
    <AdminPageShell
      title={
        <span className="inline-flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 shrink-0 text-[var(--twin-link-deep)]" aria-hidden />
          笼架信息
        </span>
      }
      description="按校区—区域—楼层—房间逐级筛选，查看笼架格位与落库索引；支持 CSV 导入。"
      actions={
        <>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              void onImport(f);
              e.currentTarget.value = "";
            }}
          />
          <AdminButton
            type="button"
            tone="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => importInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            导入 CSV
          </AdminButton>
        </>
      }
    >
      <div className="min-h-0 space-y-4">
        <AdminFormCard title="位置筛选" description="选择房间后将加载该房间内全部笼架平面。">
          <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 space-y-4">
            <div>
              <div className={`mb-1.5 ${adminLabelClass}`}>1. 校区</div>
              <div className="flex flex-wrap gap-2">
                {options.campuses.map((c) => (
                  <button
                    key={c.campusId}
                    type="button"
                    className={`rounded-twin-lg border px-3 py-1.5 text-sm transition ${
                      campusId === String(c.campusId)
                        ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/10 text-[var(--twin-link-deep)] shadow-twin-level-1"
                        : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:border-[var(--twin-hairline-strong)]"
                    }`}
                    onClick={() => setCampusId(String(c.campusId))}
                  >
                    {c.campusName}
                  </button>
                ))}
              </div>
            </div>

            {campusId && (
              <div>
                <div className={`mb-1.5 ${adminLabelClass}`}>2. 区域</div>
                <div className="flex flex-wrap gap-2">
                  {options.areas.map((a) => {
                    const active = areaId === a.areaId && areaName === a.areaName;
                    return (
                      <button
                        key={`${a.areaId}-${a.areaName}`}
                        type="button"
                        className={`rounded-twin-lg border px-3 py-1.5 text-sm transition ${
                          active
                            ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/10 text-[var(--twin-link-deep)] shadow-twin-level-1"
                            : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:border-[var(--twin-hairline-strong)]"
                        }`}
                        onClick={() => { setAreaId(a.areaId); setAreaName(a.areaName); }}
                      >
                        {a.areaName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {campusId && areaId && (
              <div>
                <div className={`mb-1.5 ${adminLabelClass}`}>3. 楼层</div>
                <div className="flex flex-wrap gap-2">
                  {options.floors.map((f) => {
                    const active = floorId === f.floorId && floorName === f.floorName;
                    return (
                      <button
                        key={`${f.floorId}-${f.floorName}`}
                        type="button"
                        className={`rounded-twin-lg border px-3 py-1.5 text-sm transition ${
                          active
                            ? "border-[var(--twin-primary)] bg-[var(--twin-primary)]/10 text-[var(--twin-link-deep)] shadow-twin-level-1"
                            : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:border-[var(--twin-hairline-strong)]"
                        }`}
                        onClick={() => { setFloorId(f.floorId); setFloorName(f.floorName); }}
                      >
                        {f.floorName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {campusId && areaId && floorId && (
              <div>
                <div className={`mb-1.5 ${adminLabelClass}`}>4. 房间（选定后自动加载本房间全部笼架）</div>
                <div className="flex flex-wrap gap-2">
                  {options.rooms.map((r) => {
                    const active = roomId === r.roomId && roomName === r.roomName;
                    return (
                      <button
                        key={`${r.roomId}-${r.roomName}`}
                        type="button"
                        className={`rounded-twin-lg border px-3 py-1.5 text-sm transition ${
                          active
                            ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-twin-level-1"
                            : "border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:border-[var(--twin-hairline-strong)]"
                        }`}
                        onClick={() => { setRoomId(r.roomId); setRoomName(r.roomName); }}
                      >
                        {r.roomName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </AdminFormCard>

        <div className="min-h-[62vh] space-y-4 overflow-y-auto pr-1">
          {roomLoading && (
            <div className="rounded-twin-xl border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-4 text-center text-sm text-[var(--twin-mute)]">
              正在按顺序加载房间笼架（已加载 {roomShelfDetails.length} / {options.shelves?.length ?? 0}）…
            </div>
          )}
          {!roomLoading && roomId && roomName && (options.shelves?.length ?? 0) === 0 && (
            <div className="rounded-twin-xl border border-amber-200/90 bg-amber-50/80 p-4 text-sm text-amber-900">
              当前房间暂无笼架索引，请先导入 CSV 或调整筛选。
            </div>
          )}
          {roomShelfDetails.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {roomShelfDetails.map((d, idx) => (
                <ShelfGrid
                  key={d.shelfMeta?.shelveId ?? idx}
                  title={d.shelfMeta?.shelveName || `笼架 ${idx + 1}`}
                  detail={d}
                  loading={false}
                  emptyHint="暂无笼架数据"
                  onCellClick={setActiveCell}
                />
              ))}
            </div>
          )}
        </div>

        <AdminFormCard title="落库索引可视化" description={`当前筛选命中 ${indexTotal} 条（展示前 ${indexRows.length} 条）。`}>
          <AdminDataTableWrap scrollable>
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]">
                <tr>
                  <th className="px-2 py-1.5 text-left">校区</th>
                  <th className="px-2 py-1.5 text-left">区域</th>
                  <th className="px-2 py-1.5 text-left">楼层</th>
                  <th className="px-2 py-1.5 text-left">房间</th>
                  <th className="px-2 py-1.5 text-left">架子</th>
                  <th className="px-2 py-1.5 text-left">更新时间</th>
                </tr>
              </thead>
              <tbody>
                {indexRows.map((r) => (
                  <tr key={`${r.shelveId}-${r.roomId}`} className="border-t border-[var(--twin-hairline)]">
                    <td className="px-2 py-1.5">{r.campusName} ({r.campusId})</td>
                    <td className="px-2 py-1.5">{r.areaName} ({r.areaId})</td>
                    <td className="px-2 py-1.5">{r.floorName} ({r.floorId})</td>
                    <td className="px-2 py-1.5">{r.roomName} ({r.roomId})</td>
                    <td className="px-2 py-1.5">{r.shelveName || "-"} ({r.shelveId})</td>
                    <td className="px-2 py-1.5 text-[var(--twin-mute)]">{r.updateTime || "-"}</td>
                  </tr>
                ))}
                {indexRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-4 text-center text-[var(--twin-mute)]" colSpan={6}>
                      暂无落库索引数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </AdminDataTableWrap>
        </AdminFormCard>

        {activeCell && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setActiveCell(null)}>
            <div className="w-full max-w-xl rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-3" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-[var(--twin-ink)]">笼盒详情 · 格位 {activeCell.position}</div>
                <button type="button" className="text-xs text-[var(--twin-mute)] hover:text-[var(--twin-ink)]" onClick={() => setActiveCell(null)}>
                  关闭
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {CAGE_BOX_INFO_FIELD_ORDER.map((k) => {
                  const source = activeCell.cageBoxInfo ?? activeCell.detail ?? {};
                  const v = source[k];
                  const display = formatCageDetailValue(v);
                  const qrPayload =
                    k === "CageBoxQrCode" && v != null && String(v).trim() !== "" ? String(v).trim() : "";
                  return (
                    <div
                      key={k}
                      className={`rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1.5 ${k === "CageBoxQrCode" ? "col-span-2" : ""}`}
                    >
                      <div className="text-[var(--twin-mute)]">{CAGE_BOX_INFO_LABEL[k] ?? k}</div>
                      <div className="mt-0.5 flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1 break-all text-[var(--twin-ink)]">{display}</div>
                        {k === "CageBoxQrCode" && qrPayload !== "" && (
                          <div className="shrink-0 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-1">
                            <QRCodeSVG value={qrPayload} size={112} level="M" includeMargin={false} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
