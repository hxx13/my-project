/**
 * 门户侧 NHP CRF 正式填写：/#/nhp/fill 与 /#/nhp/fill/:id
 * 无 id → 中转页（选动物 → 选/建实例）；有 id → 缓冲页 / 工作台。
 */
import { useNavigate, useParams } from "react-router-dom";
import { PortalHeader } from "@/features/portal/PortalHeader";
import NhpFillEntryGate from "../components/NhpFillEntryGate";
import NhpFillWorkbench from "../components/NhpFillWorkbench";
import "@/features/aup/aup.css";
import "../nhp.css";

export default function NhpFillPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();

  return (
    <>
      <PortalHeader onOpenLogin={() => navigate("/")} />
      <div className="aup-app nhp-fill-portal" style={{ minHeight: "calc(100vh - 64px)" }}>
        {id ? <NhpFillWorkbench mode="portal" /> : <NhpFillEntryGate />}
      </div>
    </>
  );
}
