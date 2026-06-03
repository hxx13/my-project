import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null;
  parentTitle?: string;
  onCreate: (type: "GROUP" | "SUBGROUP", title: string, parentId: string | null) => void;
}

export function AdminNavManagerCreateDialog({ open, onOpenChange, parentId, parentTitle, onCreate }: Props) {
  const [type, setType] = useState<"GROUP" | "SUBGROUP">(parentId ? "SUBGROUP" : "GROUP");
  const [title, setTitle] = useState("");

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate(type, title.trim(), parentId);
    setTitle("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>
            {parentId ? `在「${parentTitle}」下创建子文件夹` : "创建顶级分组"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-1 block">类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "GROUP" | "SUBGROUP")}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              disabled={!!parentId}
            >
              <option value="GROUP">顶级分组</option>
              <option value="SUBGROUP">子分组</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">名称</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入文件夹名称..."
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              autoFocus
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
