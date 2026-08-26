/**
 * 笼位占用记录 — 双视角（笼位视角 + 个人视角）。
 * 只读查询页：按笼位 ID 或按人员查看占用事件流水。
 */
import { useState } from "react";
import toast from "react-hot-toast";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  fetchCageOccupancyRecords,
  searchPersonnelByKeyword,
  type CageOccupancyRecord,
} from "@/api/domains/cageShelf.api";

const EVENT_TYPE_LABELS: Record<string, string> = {
  copy: "复制占用",
  transfer: "转笼",
  exit: "退出",
  archive: "归档",
  divide: "分笼",
};

function formatTime(createdAt?: string | null): string {
  return createdAt ? createdAt.replace("T", " ").substring(0, 19) : "-";
}

const cardCls =
  "rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-3";
const mutedCls = "text-[var(--app-color-text-tertiary)]";

function RecordCard({ r }: { r: CageOccupancyRecord }) {
  const from = r.fromAnimalCageId ? `#${r.fromAnimalCageId}` : "-";
  const to = r.toAnimalCageId ? `#${r.toAnimalCageId}` : "-";
  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-[var(--app-color-text-primary)]">
          {EVENT_TYPE_LABELS[r.eventType] ?? r.eventType}
        </span>
        <span className={`text-[12px] ${mutedCls}`}>
          从笼位 {from} → 到笼位 {to}
        </span>
      </div>
      <div className={`mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] ${mutedCls}`}>
        <span>占用者：{r.occupantName || (r.occupantId != null ? `#${r.occupantId}` : "-")}</span>
        <span>操作人：{r.operatorName || "-"}</span>
        <span>时间：{formatTime(r.createdAt)}</span>
      </div>
      {r.reason ? (
        <div className={`mt-1 text-[12px] ${mutedCls}`}>原因：{r.reason}</div>
      ) : null}
    </div>
  );
}

export default function CageOccupancyRecordsPage() {
  const [view, setView] = useState<"cage" | "person">("cage");

  // 笼位视角
  const [cageId, setCageId] = useState("");
  const [cageRecords, setCageRecords] = useState<CageOccupancyRecord[]>([]);
  const [cageLoading, setCageLoading] = useState(false);
  const [cageError, setCageError] = useState("");

  // 个人视角
  const [kw, setKw] = useState("");
  const [persons, setPersons] = useState<Array<{ id: number; name: string }>>([]);
  const [personSearching, setPersonSearching] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<{ id: number; name: string } | null>(null);
  const [personRecords, setPersonRecords] = useState<CageOccupancyRecord[]>([]);
  const [personLoading, setPersonLoading] = useState(false);
  const [personError, setPersonError] = useState("");

  const queryCage = async () => {
    const id = cageId.trim();
    if (!id) {
      toast.error("请输入笼位 ID");
      return;
    }
    setCageLoading(true);
    setCageError("");
    try {
      setCageRecords(await fetchCageOccupancyRecords("cage", id));
    } catch (e) {
      setCageRecords([]);
      setCageError(e instanceof Error ? e.message : "加载记录失败");
    } finally {
      setCageLoading(false);
    }
  };

  const searchPerson = async () => {
    const keyword = kw.trim();
    if (!keyword) {
      toast.error("请输入人员姓名或工号");
      return;
    }
    setPersonSearching(true);
    try {
      setPersons(await searchPersonnelByKeyword(keyword));
    } catch (e) {
      setPersons([]);
      toast.error(e instanceof Error ? e.message : "搜索人员失败");
    } finally {
      setPersonSearching(false);
    }
  };

  const pickPerson = async (p: { id: number; name: string }) => {
    setSelectedPerson(p);
    setPersonLoading(true);
    setPersonError("");
    try {
      setPersonRecords(await fetchCageOccupancyRecords("person", p.id));
    } catch (e) {
      setPersonRecords([]);
      setPersonError(e instanceof Error ? e.message : "加载记录失败");
    } finally {
      setPersonLoading(false);
    }
  };

  const tabBtn = (value: "cage" | "person", label: string) => (
    <button
      type="button"
      onClick={() => setView(value)}
      className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
        view === value
          ? "bg-[var(--app-color-accent)] text-white"
          : "bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AdminFullWidthPage>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2">
          {tabBtn("cage", "笼位视角")}
          {tabBtn("person", "个人视角")}
        </div>

        {view === "cage" ? (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <input
                className="flex-1 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-[13px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
                placeholder="输入笼位 ID"
                value={cageId}
                onChange={(e) => setCageId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void queryCage()}
              />
              <AdminButton tone="primary" onClick={() => void queryCage()} loading={cageLoading}>
                查询
              </AdminButton>
            </div>

            {cageLoading && <div className={mutedCls}>加载中…</div>}
            {!cageLoading && cageError && <div className="text-[13px] text-red-500">{cageError}</div>}
            {!cageLoading && !cageError && cageRecords.length === 0 && (
              <div className={`${cardCls} text-center ${mutedCls}`}>暂无记录</div>
            )}
            <div className="space-y-2">
              {cageRecords.map((r) => (
                <RecordCard key={r.id} r={r} />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <input
                className="flex-1 rounded-md border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-3 py-2 text-[13px] text-[var(--app-color-text-primary)] outline-none placeholder:text-[var(--app-color-text-tertiary)]"
                placeholder="输入人员姓名或工号"
                value={kw}
                onChange={(e) => setKw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void searchPerson()}
              />
              <AdminButton tone="primary" onClick={() => void searchPerson()} loading={personSearching}>
                搜索
              </AdminButton>
            </div>

            {personSearching && <div className={mutedCls}>搜索中…</div>}
            {!personSearching && persons.length === 0 && !selectedPerson && (
              <div className={`${cardCls} text-center ${mutedCls}`}>输入关键词搜索人员</div>
            )}
            {persons.length > 0 && (
              <div className="mb-3 space-y-1">
                {persons.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void pickPerson(p)}
                    className={`block w-full rounded-md border border-[var(--app-color-border-default)] px-3 py-2 text-left text-[13px] transition hover:bg-[var(--app-color-surface-hover)] ${
                      selectedPerson?.id === p.id ? "bg-[var(--app-color-surface-hover)]" : "bg-[var(--app-color-surface-container)]"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}

            {selectedPerson && (
              <div className="mb-2 text-[13px] text-[var(--app-color-text-secondary)]">
                {selectedPerson.name} 的占用记录
              </div>
            )}
            {personLoading && <div className={mutedCls}>加载中…</div>}
            {!personLoading && personError && <div className="text-[13px] text-red-500">{personError}</div>}
            {!personLoading && !personError && selectedPerson && personRecords.length === 0 && (
              <div className={`${cardCls} text-center ${mutedCls}`}>暂无记录</div>
            )}
            <div className="space-y-2">
              {personRecords.map((r) => (
                <RecordCard key={r.id} r={r} />
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminFullWidthPage>
  );
}
