import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type AdminNavFolderOption = { id: string; title: string; depth: number };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null;
  parentTitle?: string;
  folderOptions: AdminNavFolderOption[];
  onCreate: (type: "GROUP" | "SUBGROUP", title: string, parentId: string | null) => void;
}

const inputClass =
  "w-full rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2 text-sm text-[var(--twin-ink)] focus:outline-none focus:ring-1 focus:ring-[var(--twin-primary)]";

export function AdminNavManagerCreateDialog({
  open,
  onOpenChange,
  parentId,
  parentTitle,
  folderOptions,
  onCreate,
}: Props) {
  const lockedParent = parentId != null;
  const [selectedParentId, setSelectedParentId] = useState<string | null>(parentId);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedParentId(parentId);
    setTitle("");
  }, [open, parentId]);

  const effectiveParentId = lockedParent ? parentId : selectedParentId;
  const effectiveType: "GROUP" | "SUBGROUP" = effectiveParentId ? "SUBGROUP" : "GROUP";
  const effectiveParentTitle =
    lockedParent
      ? parentTitle
      : folderOptions.find((f) => f.id === effectiveParentId)?.title;

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate(effectiveType, title.trim(), effectiveParentId);
    setTitle("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-ink)]">
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>
            {effectiveParentId
              ? `在「${effectiveParentTitle ?? "所选文件夹"}」下创建子文件夹`
              : "创建顶级分组"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {!lockedParent && folderOptions.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-1 block text-[var(--twin-body)]">父文件夹</label>
              <select
                value={selectedParentId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedParentId(v ? v : null);
                }}
                className={inputClass}
              >
                <option value="">无（顶级分组）</option>
                {folderOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {`${"　".repeat(f.depth)}${f.title}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block text-[var(--twin-body)]">类型</label>
            <p className="text-sm text-[var(--twin-body)] rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2">
              {effectiveType === "GROUP" ? "顶级分组" : "子分组"}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block text-[var(--twin-body)]">名称</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入文件夹名称..."
              className={inputClass}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleCreate} disabled={!title.trim()}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
