import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IsolationUsageQueryResult } from "@/api/domains/analytics.api";
import { IsolationQueryProvenancePanel } from "@/features/analytics/components/IsolationQueryProvenancePanel";
import { useState } from "react";

type Props = {
  loading?: boolean;
  detail?: IsolationUsageQueryResult | null;
  disabled?: boolean;
};

export function SnapshotProvenanceInfoButton({ loading, detail, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const hasData = Boolean(detail?.queryProvenance?.steps?.length || detail?.summary);

  return (
    <>
      <button
        type="button"
        disabled={disabled || (!hasData && !loading)}
        title="快照生成时的数据调用"
        aria-label="快照生成时的数据调用"
        onClick={() => setOpen(true)}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-700 shadow-sm hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden p-0">
          <div data-modal-scroll className="min-h-0 flex-1 overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="text-sm">快照生成时的数据调用</DialogTitle>
            <DialogDescription className="text-xs">
              清洗总库主口径与 ARO 流水辅助的查询步骤与耗时
            </DialogDescription>
          </DialogHeader>
          <IsolationQueryProvenancePanel
            title=""
            loading={loading}
            loadingLabel="加载快照明细…"
            provenance={detail?.queryProvenance ?? undefined}
            result={detail ?? null}
            className="border-0 shadow-none"
          />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
