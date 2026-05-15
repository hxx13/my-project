import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Database, Upload } from "lucide-react";
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
import { AdminDataTableWrap } from "@/components/admin/AdminPageShell";

/** 对齐后端 cageBoxInfo（UE 蓝图 ST_CageData）字段顺序 */
const CAGE_BOX_INFO_FIELD_ORDER = [
  "AnimalCageType",
  "PositionX",
  "PositionY",
  "AreaId",
  "DepartmentName",
  "floorId",
  "RoomName",
  "ShelveName",
  "ProjectPiName",
  "MobilePhone",
  "AupNumber",
  "CageBoxQrCode",
  "createAdmin",
  "CreateTime",
  "UpdateTime",
  "SpecialBreedingName",
  "specialBreedingDescription",
  "State",
  "StateName",
  "HasPhysicalBox",
] as const;

const CAGE_BOX_INFO_LABEL: Record<string, string> = {
  AnimalCageType: "笼位类型",
  PositionX: "X 坐标",
  PositionY: "Y 坐标",
  AreaId: "区域 ID",
  DepartmentName: "部门",
  floorId: "楼层 ID",
  RoomName: "房间名称",
  ShelveName: "笼架名称",
  ProjectPiName: "课题 PI",
  MobilePhone: "手机号",
  AupNumber: "AUP 编号",
  CageBoxQrCode: "笼盒卡号",
  createAdmin: "创建人",
  CreateTime: "创建时间",
  UpdateTime: "更新时间",
  SpecialBreedingName: "特殊繁育名称",
  specialBreedingDescription: "特殊繁育说明",
  State: "状态值",
  StateName: "状态名称",
  HasPhysicalBox: "是否有实体笼盒",
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
  if (cell.empty) return "border-slate-200 bg-slate-50 text-slate-400";
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
  title,
  detail,
  loading,
  emptyHint,
  onCellClick,
}: {
  title: string;
  detail: CageShelfDetail | null;
  loading: boolean;
  /** 无数据时的提示 */
  emptyHint?: string;
  onCellClick: (cell: CageShelfCell) => void;
}) {
  const cells = detail?.grid ?? [];
  return (
    <div className="rounded-xl border bg-white p-3 min-h-0 flex flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        {detail?.shelfMeta && (
          <div className="text-[11px] text-slate-500">
            {detail.shelfMeta.campusName} / {detail.shelfMeta.areaName} / {detail.shelfMeta.floorName} / {detail.shelfMeta.roomName} / {detail.shelfMeta.shelveName || detail.shelfMeta.shelveId}
          </div>
        )}
      </div>
      {loading ? (
        <div className="flex-1 rounded-lg border border-dashed text-xs text-slate-500 grid place-items-center">加载中...</div>
      ) : !detail ? (
        <div className="flex-1 rounded-lg border border-dashed text-xs text-slate-500 grid place-items-center px-2 text-center">
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
                className={`min-h-[82px] rounded-md border text-[10px] leading-tight transition ${cageCardTone(cell)}`}
                  onClick={() => !cell.empty && onCellClick(cell)}
                  disabled={cell.empty}
                >
                  <div className="flex min-h-[76px] flex-col items-center justify-center gap-0.5 px-1 py-1 text-center">
                    <div className="w-full font-bold">{cell.position}</div>
                    {cell.empty ? (
                      <div className="text-[9px] text-slate-400">空位</div>
                    ) : (
                      <>
                        {nonEmptyText(cell.departmentName) && (
                          <div className="w-full truncate text-[9px] font-medium text-slate-600">{cell.departmentName}</div>
                        )}
                        {nonEmptyText(cell.projectGroup) && (
                          <div className="w-full truncate">{cell.projectGroup}</div>
                        )}
                        {nonEmptyText(piTeacher) && <div className="w-full truncate text-[11px] font-semibold text-slate-700">{piTeacher}</div>}
                        {nonEmptyText(cell.stateLabel) && (
                          <div className="w-full text-[9px] text-slate-500">{cell.stateLabel}</div>
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
  const [options, setOptions] = useState<CageShelfFilterOptions>({
    campuses: [],
    areas: [],
    floors: [],
    rooms: [],
    shelves: [],
  });
  const [campusId, setCampusId] = useState<string>("");
  const [areaId, setAreaId] = useState<string>("");
  const [areaName, setAreaName] = useState("");
  const [floorId, setFloorId] = useState<string>("");
  const [floorName, setFloorName] = useState("");
  const [roomId, setRoomId] = useState<string>("");
  const [roomName, setRoomName] = useState("");
  /** 当前房间下全部笼架详情（纵向堆叠） */
  const [roomShelfDetails, setRoomShelfDetails] = useState<CageShelfDetail[]>([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [indexRows, setIndexRows] = useState<CageShelfIndexRow[]>([]);
  const [indexTotal, setIndexTotal] = useState(0);
  const [activeCell, setActiveCell] = useState<CageShelfCell | null>(null);

  const shelfIdsSignature = useMemo(
    () => (options.shelves ?? []).map((s) => s.shelveId).join(","),
    [options.shelves]
  );

  const loadOptions = async () => {
    try {
      const data = await fetchCageShelfFilterOptions({
        campusId: campusId ? Number(campusId) : undefined,
        areaId: areaId || undefined,
        areaName: areaName || undefined,
        floorId: floorId || undefined,
        floorName: floorName || undefined,
        roomId: roomId || undefined,
        roomName: roomName || undefined,
      });
      setOptions(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载筛选项失败");
    }
  };

  useEffect(() => {
    void loadOptions();
  }, []);

  useEffect(() => {
    setAreaId("");
    setAreaName("");
    setFloorId("");
    setFloorName("");
    setRoomId("");
    setRoomName("");
    setRoomShelfDetails([]);
  }, [campusId]);

  useEffect(() => {
    setFloorId("");
    setFloorName("");
    setRoomId("");
    setRoomName("");
    setRoomShelfDetails([]);
  }, [areaId, areaName]);

  useEffect(() => {
    setRoomId("");
    setRoomName("");
    setRoomShelfDetails([]);
  }, [floorId, floorName]);

  useEffect(() => {
    setRoomShelfDetails([]);
  }, [roomId, roomName]);

  useEffect(() => {
    void loadOptions();
  }, [campusId, areaId, areaName, floorId, floorName, roomId, roomName]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchCageShelfIndexes({
          campusId: campusId ? Number(campusId) : undefined,
          areaId: areaId || undefined,
          floorId: floorId || undefined,
          roomId: roomId || undefined,
          page: 1,
          size: 200,
        });
        setIndexRows(res.rows || []);
        setIndexTotal(Number(res.total || 0));
      } catch {
        setIndexRows([]);
        setIndexTotal(0);
      }
    })();
  }, [campusId, areaId, floorId, roomId]);

  /** 选定房间后，按顺序逐个拉取该房间笼架详情，边加载边渲染 */
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
        if (!cancelled) {
          setRoomLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 以 shelfIdsSignature 为准，避免 options 引用变化导致重复请求
  }, [roomId, roomName, shelfIdsSignature]);

  const onImport = async (file?: File) => {
    if (!file) {
      return;
    }
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
            <div className="text-slate-600">{String(importErrors[0])}</div>
            <button className="mt-1 text-blue-600" onClick={() => toast.dismiss(t.id)}>关闭</button>
          </div>
        ));
      }
      await loadOptions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
  };

  return (
    <div className="space-y-3 min-h-0">
      <div className="rounded-xl border bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Database className="h-4 w-4 text-blue-600" />
            笼架信息
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-xs hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5" />
            导入 CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                void onImport(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-4">
          <div>
            <div className="mb-1.5 text-xs font-medium text-slate-600">1. 校区</div>
            <div className="flex flex-wrap gap-2">
              {options.campuses.map((c) => (
                <button
                  key={c.campusId}
                  type="button"
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                    campusId === String(c.campusId)
                      ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
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
              <div className="mb-1.5 text-xs font-medium text-slate-600">2. 区域</div>
              <div className="flex flex-wrap gap-2">
                {options.areas.map((a) => {
                  const active = areaId === a.areaId && areaName === a.areaName;
                  return (
                    <button
                      key={`${a.areaId}-${a.areaName}`}
                      type="button"
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                      onClick={() => {
                        setAreaId(a.areaId);
                        setAreaName(a.areaName);
                      }}
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
              <div className="mb-1.5 text-xs font-medium text-slate-600">3. 楼层</div>
              <div className="flex flex-wrap gap-2">
                {options.floors.map((f) => {
                  const active = floorId === f.floorId && floorName === f.floorName;
                  return (
                    <button
                      key={`${f.floorId}-${f.floorName}`}
                      type="button"
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        active
                          ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                      onClick={() => {
                        setFloorId(f.floorId);
                        setFloorName(f.floorName);
                      }}
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
              <div className="mb-1.5 text-xs font-medium text-slate-600">4. 房间（选定后自动加载本房间全部笼架）</div>
              <div className="flex flex-wrap gap-2">
                {options.rooms.map((r) => {
                  const active = roomId === r.roomId && roomName === r.roomName;
                  return (
                    <button
                      key={`${r.roomId}-${r.roomName}`}
                      type="button"
                      className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                      }`}
                      onClick={() => {
                        setRoomId(r.roomId);
                        setRoomName(r.roomName);
                      }}
                    >
                      {r.roomName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="min-h-[62vh] space-y-4 overflow-y-auto pr-1">
        {roomLoading && (
          <div className="rounded-xl border border-dashed bg-white p-4 text-center text-sm text-slate-500">
            正在按顺序加载房间笼架（已加载 {roomShelfDetails.length} / {options.shelves?.length ?? 0}）…
          </div>
        )}
        {!roomLoading &&
          roomId &&
          roomName &&
          (options.shelves?.length ?? 0) === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
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

      <div className="rounded-xl border bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">落库索引可视化</div>
          <div className="text-xs text-slate-500">当前筛选命中 {indexTotal} 条（展示前 {indexRows.length} 条）</div>
        </div>
        <AdminDataTableWrap scrollable>
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
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
                <tr key={`${r.shelveId}-${r.roomId}`} className="border-t">
                  <td className="px-2 py-1.5">{r.campusName} ({r.campusId})</td>
                  <td className="px-2 py-1.5">{r.areaName} ({r.areaId})</td>
                  <td className="px-2 py-1.5">{r.floorName} ({r.floorId})</td>
                  <td className="px-2 py-1.5">{r.roomName} ({r.roomId})</td>
                  <td className="px-2 py-1.5">{r.shelveName || "-"} ({r.shelveId})</td>
                  <td className="px-2 py-1.5 text-slate-500">{r.updateTime || "-"}</td>
                </tr>
              ))}
              {indexRows.length === 0 && (
                <tr>
                  <td className="px-2 py-4 text-center text-slate-400" colSpan={6}>
                    暂无落库索引数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </AdminDataTableWrap>
      </div>

      {activeCell && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setActiveCell(null)}>
          <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">笼盒详情 · 格位 {activeCell.position}</div>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setActiveCell(null)}>
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
                    className={`rounded border px-2 py-1.5 ${k === "CageBoxQrCode" ? "col-span-2" : ""}`}
                  >
                    <div className="text-slate-500">{CAGE_BOX_INFO_LABEL[k] ?? k}</div>
                    <div className="mt-0.5 flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1 break-all text-slate-800">{display}</div>
                      {k === "CageBoxQrCode" && qrPayload !== "" && (
                        <div className="shrink-0 rounded border border-slate-200 bg-white p-1">
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
  );
}
