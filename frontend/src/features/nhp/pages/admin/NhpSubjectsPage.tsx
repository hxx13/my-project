/**
 * NHP 动物管理：列表 / 搜索 / 筛选 / 查看实例（不含登记）。
 * 入口：/#/content-manager/nhp-subjects
 * 登记新研究对象在数据采集入口（门户 /#/nhp/fill 或管理端 nhp-entry）。
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { useGoBack } from "@/features/aup/hooks/useGoBack";
import {
  deleteNhpSubject,
  fetchNhpSubjects,
  type NhpSubject,
} from "../../api/nhpRecord.api";
import { animalTypeLabel, animalTypeLongLabel } from "../../utils/nhpSubjectLabels";
import { nhpNavState } from "../../utils/nhpAdminNav";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { appConfirm } from "@/lib/appDialog";
import "@/features/aup/aup.css";
import "../../nhp.css";

type TypeFilter = "ALL" | "DONOR" | "RECIPIENT";

function sexLabel(s?: string): string {
  if (!s) return "—";
  const u = s.toUpperCase();
  if (u === "M" || u === "MALE") return "♂";
  if (u === "F" || u === "FEMALE") return "♀";
  return s;
}

function identitySummary(s: NhpSubject): string {
  const parts: string[] = [];
  if (s.externalId) parts.push(`原号 ${s.externalId}`);
  if (s.microchipId) parts.push(`芯片 ${s.microchipId}`);
  if (s.species) parts.push(s.species);
  if (s.breed) parts.push(s.breed);
  if (s.farmCode) parts.push(`基地 ${s.farmCode}`);
  return parts.length ? parts.join(" · ") : "—";
}

export default function NhpSubjectsPage() {
  const location = useLocation();
  const goBack = useGoBack("/nhp/overview");
  const canDelete = hasMinRole(authStorage.getRole(), "ADMIN");

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<NhpSubject[]>([]);
  const [busy, setBusy] = useState(false);
  const size = 20;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetchNhpSubjects({
        subjectType: typeFilter === "ALL" ? undefined : typeFilter,
        q: qApplied || undefined,
        page,
        size,
      });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
    } catch (e) {
      toast.error((e as Error).message || "加载动物列表失败");
      setItems([]);
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }, [typeFilter, qApplied, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = () => {
    setPage(1);
    setQApplied(q.trim());
  };

  const onDelete = async (s: NhpSubject) => {
    if (!canDelete) return;
    const ok = await appConfirm(
      `确定删除动物 ${s.subjectCode}？\n将软删除（状态→RETIRED）。若仍有填写实例，需确认级联删除。`,
    );
    if (!ok) return;
    try {
      await deleteNhpSubject(s.id, false);
      toast.success(`已删除 ${s.subjectCode}`);
      await load();
    } catch (e) {
      const msg = (e as Error).message || "删除失败";
      if (msg.includes("实例") || msg.includes("cascade")) {
        const cascade = await appConfirm(
          `${msg}\n\n是否级联删除该动物下全部填写实例？此操作不可轻易恢复。`,
        );
        if (!cascade) return;
        try {
          await deleteNhpSubject(s.id, true);
          toast.success(`已级联删除 ${s.subjectCode}`);
          await load();
        } catch (e2) {
          toast.error((e2 as Error).message || "级联删除失败");
        }
      } else {
        toast.error(msg);
      }
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / size));

  const segBtn = (on: boolean) => ({
    padding: "6px 12px",
    fontSize: 12,
    border: "none" as const,
    cursor: "pointer" as const,
    background: on ? "var(--primary-weak)" : "transparent",
    color: on ? "var(--primary)" : "var(--slate)",
    fontWeight: on ? 600 : 500,
  });

  return (
    <div className="aup-app aup-app--full">
      <div className="aup-wb-hd" style={{ marginBottom: 16 }}>
        <div>
          <button type="button" className="btn ghost small" onClick={goBack} style={{ marginBottom: 8 }}>
            ← 返回
          </button>
          <h1>动物管理</h1>
          <div className="sub">
            检索与维护已登记研究对象 · 开填与登记请走数据采集入口
          </div>
        </div>
        <div className="aup-wb-actions">
          <Link to="/content-manager/nhp-entry" className="btn primary small" style={{ textDecoration: "none" }} state={nhpNavState(location)}>
            数据采集入口
          </Link>
          <Link to="/content-manager/nhp-records" className="btn ghost small" style={{ textDecoration: "none" }} state={nhpNavState(location)}>
            实例管理
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            background: "#fff",
          }}
        >
          {(["ALL", "DONOR", "RECIPIENT"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              type="button"
              style={segBtn(typeFilter === t)}
              onClick={() => {
                setTypeFilter(t);
                setPage(1);
              }}
            >
              {t === "ALL" ? "全部" : animalTypeLabel(t)}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="编号 / 原号 / 芯片 / 基地"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applySearch()}
        />
        <button type="button" className="btn ghost small" disabled={busy} onClick={applySearch}>
          搜索
        </button>
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => void load()}>
          刷新
        </button>
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: "auto" }}>
          共 {total} 只 · 第 {page}/{totalPages} 页
        </span>
      </div>

      {busy && items.length === 0 ? (
        <div className="aup-empty">加载中…</div>
      ) : items.length === 0 ? (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>暂无已登记动物</div>
          <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 420, margin: "0 auto 16px", lineHeight: 1.7 }}>
            本页仅作管理。请在数据采集入口登记新研究对象，或选择已有对象后开填。
          </div>
          <Link to="/content-manager/nhp-entry" className="btn primary small" style={{ textDecoration: "none" }}>
            前往数据采集入口
          </Link>
        </div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>自定义编号</th>
              <th>类型</th>
              <th>性别</th>
              <th>身份标识</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="row">
                <td style={{ fontWeight: 600 }}>{s.subjectCode}</td>
                <td>{animalTypeLongLabel(s.subjectType)}</td>
                <td>{sexLabel(s.sex)}</td>
                <td style={{ fontSize: 12, maxWidth: 280 }}>{identitySummary(s)}</td>
                <td>{s.status}</td>
                <td>
                  <Link to={`/content-manager/nhp-entry?subjectId=${s.id}`} style={{ marginRight: 12 }} state={nhpNavState(location)}>
                    开填
                  </Link>
                  <Link to={`/content-manager/nhp-records?subjectId=${s.id}`} style={{ marginRight: 12 }} state={nhpNavState(location)}>
                    看实例
                  </Link>
                  {canDelete && (
                    <button
                      type="button"
                      className="btn ghost small"
                      style={{ color: "#b91c1c" }}
                      onClick={() => void onDelete(s)}
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
          <button
            type="button"
            className="btn ghost small"
            disabled={page <= 1 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </button>
          <button
            type="button"
            className="btn ghost small"
            disabled={page >= totalPages || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
