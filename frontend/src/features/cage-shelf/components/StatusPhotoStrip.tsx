import { useState } from "react";
import toast from "react-hot-toast";
import { authHttp } from "@/api/core/authHttp";

/**
 * 单个状态的专属照片条：一枚上传按钮 + 该状态已归档的缩略图。
 *
 * 存在的理由是一个真实 bug：以前「选择操作」弹窗里只有**一份**全局照片数组，
 * 保存时把同一份数组写进了每个状态 key（`for (const k of statusPhotoKeys(...)) sp[k] = actionPhotos`），
 * 于是勾三个状态传一张照片 → 三个状态各存一张。按状态各给一枚上传按钮，
 * 照片从哪来就归到哪去，这条扇出路径自然消失。
 *
 * 同时管上传与删除（都要打 `/upload` 与 `/local/annotate`），调用方只拿 value/onChange，
 * 免得两端各写一遍又慢慢漂开。`value` 是**该状态自己的** URL 列表，不是全量。
 */
export default function StatusPhotoStrip({
  value,
  onChange,
  variant = "twin",
  label = "照片",
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  /**
   * 三套壳的令牌各不相同，只差颜色，不值得把逻辑复制三份：
   * twin=后台 `--twin-*`；student=学生网页 `--app-color-*`；mobile=手机版内联灰（那套壳不引这两个令牌）。
   */
  variant?: "twin" | "student" | "mobile";
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const t = variant === "student"
    ? { line: "var(--app-color-border-default)", mute: "var(--app-color-text-tertiary)" }
    : variant === "mobile"
      ? { line: "#ebedf0", mute: "#969799" }
      : { line: "var(--twin-hairline)", mute: "var(--twin-mute)" };

  const upload = async (files: File[]) => {
    setUploading(true);
    try {
      const urls: string[] = [];
      let failed = 0;
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData();
        fd.append("file", files[i]);
        const r = await authHttp.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        if (r.data?.success && r.data.data?.url) urls.push(r.data.data.url);
        else failed += 1;
      }
      if (urls.length) onChange([...value, ...urls]);
      if (failed) toast.error(`${failed} 张上传失败，请重试`);
    } catch (e) {
      /* 把服务端那句话原样带出来（「服务繁忙」= multipart 没解析出来；「无权限上传文件」= 当前账号不是教职工；
         「文件内容与扩展名不匹配」= 不是图片）。
         早先这里只写死「上传失败」，白丢掉了唯一的线索 —— 表现就是「点了没反应、也没预览」，
         用户和排查的人都无从下手（2026-09-18 用户报 H5 状态模式上传无效）。 */
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <label
        className="cursor-pointer rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold"
        style={{ borderColor: t.line, color: t.mute }}
        title={`给「${label}」单独加照片`}
      >
        {uploading ? "上传中…" : "📷 加照片"}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            /*
              先快照再清 value，顺序不能反。`input.files` 返回的是**活 FileList** ——
              `e.target.value = ""` 会把已经拿到的那个引用一起清空，于是 files.length 变 0，
              上传函数一次都不跑：表现是「选完图毫无反应」，既不报错也没有缩略图（2026-09-18 用户报）。
            */
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) void upload(files);
          }}
        />
      </label>
      {value.map((url, i) => (
        <span key={`${url}:${i}`} className="group relative inline-block">
          <img src={url} alt="" className="h-7 w-7 rounded-sm border object-cover" style={{ borderColor: t.line }} />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            /* 触摸屏没有 hover —— 只写 `group-hover` 的话手机上这枚删除按钮永远不出现，
               传完照片就再也删不掉了。悬停设备保持原来的「悬停才露」，其余一律常显。 */
            className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-red-500 text-[9px] leading-none text-white transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
            title="移除这张照片"
          >
            ✕
          </button>
        </span>
      ))}
      {value.length === 0 && <span className="text-[10px]" style={{ color: t.mute }}>无</span>}
    </div>
  );
}
