import { cn } from "@/lib/utils";

/** 判断 iconValue 是否为图片 URL（以 http 开头或含 /），否则视为 emoji 文本 */
export function isUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (!v) return false;
  return v.startsWith("http") || v.includes("/");
}

/**
 * 物品图标：URL 渲染 <img>，emoji/文本原样显示，空值回退「📦」。
 * 统一用于表格、平面图 chip、房间 badge 等场景，避免把图片 URL 当纯文本输出。
 */
export default function ItemIcon(props: { value?: string | null; className?: string }) {
  const { value, className } = props;
  if (isUrl(value)) {
    return (
      <span className={cn("inline-block h-4 w-4 shrink-0 overflow-hidden rounded-sm align-middle", className)}>
        <img src={value!} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return <span className={cn("inline-block align-middle", className)}>{value || "📦"}</span>;
}
