/**
 * NHP 数据采集 — 内容管理侧：/#/nhp-admin/entry/:id
 * 无 :id → 与门户共用选/登记对象入口；有 :id → 缓冲页 / 工作台。
 */
import { useParams } from "react-router-dom";
import NhpFillEntryGate from "../../components/NhpFillEntryGate";
import NhpFillWorkbench from "../../components/NhpFillWorkbench";
import "@/features/aup/aup.css";
import "../../nhp.css";

export default function NhpDataEntryPage() {
  const { id } = useParams<{ id?: string }>();

  return (
    <div className="aup-app aup-app--embedded nhp-entry-embedded">
      {id ? <NhpFillWorkbench mode="adminPreview" /> : <NhpFillEntryGate mode="adminPreview" />}
    </div>
  );
}
