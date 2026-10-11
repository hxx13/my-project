import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { ImagePlus, X } from "lucide-react";
import { useAiDrawerCopy } from "./aiDrawerCopy";
import {
  fetchAiDrawerAdminContent,
  fetchAiDrawerCapabilities,
  saveAiDrawerCapabilities,
} from "@/api/domains/aiDrawer.api";
import {
  AUDIENCE_VALUES,
  MAX_FEEDBACK_IMAGES,
  appendFeedbackRows,
  buildCapRows,
  buildCapSavePayload,
  buildFeedbackPayload,
  feedbackListParams,
  moveCapRow,
  normalizeAudience,
  normalizeCapabilityGroups,
  normalizeFeedbackRows,
  type CapRow,
  type CapabilityGroup,
  type FeedbackRow,
  type FeedbackStatus,
} from "./aiDrawerDetail.logic";
import {
  fetchAiDrawerFeedback,
  replyAiDrawerFeedback,
  submitAiDrawerFeedback,
} from "@/api/domains/aiDrawerFeedback.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { resolveApiMediaUrl } from "@/utils/mediaUrl";

/** 每页反馈条数。 */
const PAGE_SIZE = 20;

type LoadState = "loading" | "ready" | "fail";

/** 一行的本地草稿：回复文字 + 回复附图 + 待提交的状态（未动过则沿用该条的当前状态）。 */
type ReplyDraft = { text: string; images: string[]; status?: FeedbackStatus };

type Props = {
  /** ≥超管：多「我的 / 全部」切换 + 每条可回复改状态（判据由面板用既有 hasMinRole 传入） */
  isAdmin: boolean;
  /** 返回对话视图（点视图里的「返回对话」或面板上那颗详情按钮） */
  onBack: () => void;
  /**
   * 点一条能力提示词：把它的 `promptText` 交给面板**填进输入框、不发送**。
   * 面板收到后会切回对话视图，用户当场就看到输入框里进了字。
   */
  onPickPrompt: (text: string) => void;
};

const EMPTY_DRAFT: ReplyDraft = { text: "", images: [] };

/** 可见范围的分段按钮：值 → 文案键 + 兜底。顺序＝从宽到窄，与后端白名单同序。 */
const AUDIENCE_SEGMENTS: Array<{ value: string; key: string; fallback: string }> = AUDIENCE_VALUES.map((v) => {
  switch (v) {
    case "STAFF":
      return { value: v, key: "ai.copy.detail.audienceStaff", fallback: "教职工" };
    case "STUDENT":
      return { value: v, key: "ai.copy.detail.audienceStudent", fallback: "学生" };
    case "ADMIN":
      return { value: v, key: "ai.copy.detail.audienceAdmin", fallback: "管理员" };
    case "SUPER_ADMIN":
      return { value: v, key: "ai.copy.detail.audienceSuper", fallback: "超管" };
    default:
      return { value: "", key: "ai.copy.detail.audienceAll", fallback: "全员" };
  }
});

type CapEditorProps = {
  state: LoadState;
  rows: CapRow[];
  saving: boolean;
  copy: (key: string, fallback: string) => string;
  onPatch: (uid: string, patch: Partial<CapRow>) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (uid: string) => void;
  onAdd: () => void;
  onSave: () => void;
};

/**
 * 能力提示词清单的**编辑态**（仅 ≥超管，入口由父组件按 isAdmin 控制）。
 *
 * <p>与小程序同一套后端口：进来先「读整份」（含停用行与可见范围），出去「整份存」——
 * **提交里没有的 id 即删除**，所以这里不允许按条保存，只有底部那一个保存键。
 * 可见范围是白名单五选一：后端对白名单外的值按「全员」放行，界面放个自由输入框
 * 就等于给人一个「一不小心放开给所有人」的入口。
 */
function CapEditor({ state, rows, saving, copy, onPatch, onMove, onRemove, onAdd, onSave }: CapEditorProps) {
  if (state === "loading") {
    return <div className="scan-assistant-ask__detail-empty">{copy("ai.copy.detail.loading", "读取中…")}</div>;
  }
  if (state === "fail") {
    return <div className="scan-assistant-ask__detail-empty">{copy("ai.copy.detail.fail", "清单没拉取到，稍后再试")}</div>;
  }
  return (
    <div className="scan-assistant-ask__edit">
      {rows.length === 0 ? (
        <div className="scan-assistant-ask__detail-empty">{copy("ai.copy.detail.empty", "暂时没有可用的提示词")}</div>
      ) : null}
      {rows.map((row, i) => (
        <div className="scan-assistant-ask__edit-card" key={row.uid}>
          <div className="scan-assistant-ask__edit-row">
            <input
              className="scan-assistant-ask__edit-input scan-assistant-ask__edit-input--group"
              value={row.groupName}
              placeholder={copy("ai.copy.detail.groupPlaceholder", "分组名")}
              onChange={(e) => onPatch(row.uid, { groupName: e.target.value })}
            />
            <input
              className="scan-assistant-ask__edit-input"
              value={row.title}
              placeholder={copy("ai.copy.detail.titlePlaceholder", "标题（一行）")}
              onChange={(e) => onPatch(row.uid, { title: e.target.value })}
            />
          </div>
          <input
            className="scan-assistant-ask__edit-input"
            value={row.promptText}
            placeholder={copy("ai.copy.detail.promptPlaceholder", "点一下填入输入框的那句话")}
            onChange={(e) => onPatch(row.uid, { promptText: e.target.value })}
          />
          <input
            className="scan-assistant-ask__edit-input"
            value={row.note}
            placeholder={copy("ai.copy.detail.notePlaceholder", "操作备注：点了会做什么")}
            onChange={(e) => onPatch(row.uid, { note: e.target.value })}
          />
          <div className="scan-assistant-ask__edit-row scan-assistant-ask__edit-row--meta">
            <span className="scan-assistant-ask__edit-label">{copy("ai.copy.detail.audience", "谁看得见")}</span>
            <div className="scan-assistant-ask__edit-seg">
              {AUDIENCE_SEGMENTS.map((seg) => (
                <button
                  type="button"
                  key={seg.value}
                  className={
                    "scan-assistant-ask__edit-seg-item" +
                    (row.audience === seg.value ? " scan-assistant-ask__edit-seg-item--on" : "")
                  }
                  onClick={() => onPatch(row.uid, { audience: seg.value })}
                >
                  {copy(seg.key, seg.fallback)}
                </button>
              ))}
            </div>
            <label className="scan-assistant-ask__edit-switch">
              <input
                type="checkbox"
                checked={row.enabled}
                onChange={(e) => onPatch(row.uid, { enabled: e.target.checked })}
              />
              {copy("ai.copy.detail.enabled", "启用")}
            </label>
          </div>
          <div className="scan-assistant-ask__edit-row scan-assistant-ask__edit-row--ops">
            <button type="button" className="scan-assistant-ask__choice-action" onClick={() => onMove(i, -1)}>
              {copy("ai.copy.detail.up", "上移")}
            </button>
            <button type="button" className="scan-assistant-ask__choice-action" onClick={() => onMove(i, 1)}>
              {copy("ai.copy.detail.down", "下移")}
            </button>
            <button type="button" className="scan-assistant-ask__choice-action" onClick={() => onRemove(row.uid)}>
              {copy("ai.copy.detail.remove", "删除")}
            </button>
          </div>
        </div>
      ))}
      <div className="scan-assistant-ask__edit-foot">
        <button type="button" className="scan-assistant-ask__choice-action" onClick={onAdd}>
          {copy("ai.copy.detail.add", "新增一条")}
        </button>
        <button
          type="button"
          className="scan-assistant-ask__choice-action scan-assistant-ask__choice-action--primary"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? copy("ai.copy.detail.saving", "保存中…") : copy("ai.copy.detail.save", "保存")}
        </button>
      </div>
    </div>
  );
}

/**
 * 球球对话卡片「详情」视图：**卡片本体换内容**（不是浮层/弹窗）——
 * 内容区顶部一句说明 + 返回对话，下面是能力清单与反馈；输入区在卡片底部原样保留。
 *
 * <p>整块只有**一个滚动容器**（本组件根 `.scan-assistant-ask__detail`），能力清单、反馈表单、
 * 「我的反馈」列表全在里面顺排；触底即拉下一页反馈。图片走仓库统一上传链（`uploadSingleImage`），
 * 选图后**立即上传**并把返回的相对地址当预览，提交时直接带地址（后端只收本站上传地址）。
 */
export function ScanAssistantDetailView({ isAdmin, onBack, onPickPrompt }: Props) {
  const copy = useAiDrawerCopy();

  const [capState, setCapState] = useState<LoadState>("loading");
  const [groups, setGroups] = useState<CapabilityGroup[]>([]);

  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [listState, setListState] = useState<LoadState>("loading");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  /** 正在上传的张数（选图后即时上传），非零时提交键转圈 */
  const [uploading, setUploading] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, ReplyDraft>>({});
  /** 点开的回复附图大图（null = 没开）。 */
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  const detailRef = useRef<HTMLDivElement | null>(null);
  const formFileRef = useRef<HTMLInputElement | null>(null);
  const replyFileRef = useRef<HTMLInputElement | null>(null);
  /** 当前那颗「回复附图」按钮属于哪一行 */
  const replyTargetRef = useRef<number | null>(null);
  /** 触底滚动会连续触发，用 ref 防重入 */
  const loadingMoreRef = useRef(false);
  /** 供 loadList 读到「已展示多少条」（避免在 setState 更新函数里做副作用） */
  const rowsRef = useRef<FeedbackRow[]>([]);
  rowsRef.current = rows;

  // ── 编辑态（仅 ≥超管）：读整份 → 改 → 整份存。与小程序同一套后端口。 ──
  const [editing, setEditing] = useState(false);
  const [editState, setEditState] = useState<LoadState>("loading");
  const [capRows, setCapRows] = useState<CapRow[]>([]);
  const [saving, setSaving] = useState(false);
  const uidSeq = useRef(0);

  const openEdit = useCallback(() => {
    setEditing(true);
    setEditState("loading");
    fetchAiDrawerAdminContent()
      .then((raw) => {
        setCapRows(buildCapRows(raw));
        setEditState("ready");
      })
      .catch(() => setEditState("fail"));
  }, []);

  const patchRow = useCallback((uid: string, patch: Partial<CapRow>) => {
    setCapRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }, []);

  const moveRow = useCallback((index: number, delta: number) => {
    setCapRows((prev) => moveCapRow(prev, index, delta));
  }, []);

  const removeRow = useCallback((uid: string) => {
    setCapRows((prev) => prev.filter((r) => r.uid !== uid));
  }, []);

  const addRow = useCallback(() => {
    uidSeq.current += 1;
    setCapRows((prev) => [
      ...prev,
      {
        uid: "n" + uidSeq.current,
        id: null,
        groupName: prev.length > 0 ? prev[prev.length - 1].groupName : "未分组",
        title: "",
        promptText: "",
        note: "",
        enabled: true,
        audience: "STAFF",
      },
    ]);
  }, []);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    try {
      await saveAiDrawerCapabilities(buildCapSavePayload(capRows));
      toast.success("已保存");
      setEditing(false);
      // 保存后重新拉一次只读面，否则清单还停在旧内容
      setCapState("loading");
      fetchAiDrawerCapabilities()
        .then((raw) => {
          setGroups(normalizeCapabilityGroups(raw));
          setCapState("ready");
        })
        .catch(() => setCapState("fail"));
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  }, [capRows]);

  // 能力清单：挂载拉一次（服务端已按视角过滤）
  useEffect(() => {
    let alive = true;
    setCapState("loading");
    fetchAiDrawerCapabilities()
      .then((raw) => {
        if (!alive) return;
        setGroups(normalizeCapabilityGroups(raw));
        setCapState("ready");
      })
      .catch(() => {
        if (alive) setCapState("fail");
      });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 拉一页反馈。`append` = 触底追加（拼在后面，**不清空已展示的**）；否则从第一页重置。
   * 非超管永不带 all（见 feedbackListParams）。
   */
  const loadList = useCallback(
    async (append: boolean, nextScope: "mine" | "all") => {
      if (append) {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setListState("loading");
      }
      const nextPage = append ? page + 1 : 0;
      try {
        const data = await fetchAiDrawerFeedback(
          feedbackListParams(isAdmin, nextScope, nextPage, PAGE_SIZE),
        );
        const pageRows = normalizeFeedbackRows(data.list);
        const merged = append ? appendFeedbackRows(rowsRef.current, pageRows) : pageRows;
        setRows(merged);
        setPage(nextPage);
        setHasMore(merged.length < Number(data.total ?? 0));
        setListState("ready");
      } catch {
        if (append) {
          // 追页失败：保留已展示的，只提示，不清空列表
          toast.error(copy("ai.copy.feedback.loadFail", "列表没拉取到，稍后再试"));
        } else {
          setListState("fail");
        }
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    // copy 每次渲染都是新函数，不进依赖（文案取不到只是回落兜底，不影响拉取逻辑）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin, page],
  );

  // 首屏：拉第一页（默认「我的」）
  useEffect(() => {
    void loadList(false, "mine");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 大图开着时按 Esc 关掉（它是模态浮层，键盘用户得有个出口）。 */
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  /** 超管切范围：改 scope 并从头重拉（非超管进不来）。 */
  const switchScope = (next: "mine" | "all") => {
    if (!isAdmin || next === scope) return;
    setScope(next);
    void loadList(false, next);
  };

  /** 触底追加下一页。 */
  const onSurfaceScroll = () => {
    const el = detailRef.current;
    if (!el || !hasMore || loadingMoreRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
      void loadList(true, scope);
    }
  };

  /** 选图后**立即上传**（复用统一上传链）；成功把相对地址追加进对应待发列表。 */
  const uploadFiles = async (files: File[], target: "form" | number) => {
    const list = files.filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    const existing =
      target === "form" ? images.length : (drafts[target] ?? EMPTY_DRAFT).images.length;
    const room = MAX_FEEDBACK_IMAGES - existing;
    if (room <= 0) {
      toast.error(copy("ai.copy.feedback.imageLimit", "最多 6 张"));
      return;
    }
    setUploading((n) => n + 1);
    try {
      const urls: string[] = [];
      for (const f of list.slice(0, room)) {
        urls.push((await uploadSingleImage(f)).url);
      }
      if (target === "form") {
        setImages((prev) => [...prev, ...urls].slice(0, MAX_FEEDBACK_IMAGES));
      } else {
        patchDraft(target, { images: [...(drafts[target] ?? EMPTY_DRAFT).images, ...urls].slice(0, MAX_FEEDBACK_IMAGES) });
      }
    } catch {
      toast.error(copy("ai.copy.feedback.imageFail", "图片上传失败"));
    } finally {
      setUploading((n) => Math.max(0, n - 1));
    }
  };

  const canSubmit = content.trim().length > 0 && uploading === 0 && !submitting;

  /** 提交反馈：空文字不发；成功清空表单并从第一页重拉（含刚提交那条）。 */
  const onSubmit = async () => {
    const payload = buildFeedbackPayload(content, images);
    if (!payload || submitting) return;
    setSubmitting(true);
    try {
      await submitAiDrawerFeedback(payload.content, payload.imageUrls);
      setContent("");
      setImages([]);
      toast.success(copy("ai.copy.feedback.submitDone", "已提交，谢谢你的反馈"));
      void loadList(false, scope);
    } catch (e) {
      // 失败如实提示、表单原样留着（绝不看起来像成功）
      toast.error(
        e instanceof Error && e.message ? e.message : copy("ai.copy.feedback.submitFail", "提交失败"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const patchDraft = (id: number, patch: Partial<ReplyDraft>) => {
    setDrafts((prev) => {
      const cur = prev[id] ?? EMPTY_DRAFT;
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  /**
   * 回复并改状态（仅超管）。status 只会是 PENDING / REPLIED：
   *   · 填了内容 → 追加一条到回复串（可带回复附图），**没显式选状态就按「已回复」** ——
   *     这是界面上那条回复该有的默认口味；
   *   · 没填内容 → 提交空回复 + PENDING（= 撤回，后端清空整串回复与旧列）；
   *   · 显式选了「已回复」却没填内容 → 提示「先写回复内容」，不发请求。
   */
  const onReply = async (row: FeedbackRow) => {
    if (!isAdmin || submitting) return;
    const draft = drafts[row.id] ?? EMPTY_DRAFT;
    const text = draft.text.trim();
    const status: FeedbackStatus = draft.status ?? (text ? "REPLIED" : "PENDING");
    if (!text && status === "REPLIED") {
      toast.error(copy("ai.copy.feedback.replyNeeded", "先写回复内容"));
      return;
    }
    setSubmitting(true);
    try {
      await replyAiDrawerFeedback({
        id: row.id,
        replyContent: text,
        status,
        replyImageUrls: draft.images.length > 0 ? draft.images : undefined,
      });
      patchDraft(row.id, { text: "", images: [], status: undefined });
      toast.success(copy("ai.copy.feedback.replyDone", "已回复"));
      void loadList(false, scope);
    } catch (e) {
      toast.error(
        e instanceof Error && e.message ? e.message : copy("ai.copy.feedback.replyFail", "回复失败"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title = copy("ai.copy.detail.title", "我能帮你做这些");

  return (
    <div
      className="scan-assistant-ask__detail"
      ref={detailRef}
      data-modal-scroll
      onScroll={onSurfaceScroll}
      aria-label={title}
    >
      <div className="scan-assistant-ask__detail-head">
        <span className="scan-assistant-ask__detail-desc">
          {editing
            ? copy("ai.copy.detail.editDesc", "改完点保存；标题与提示词都为空的整行会被丢掉。")
            : copy("ai.copy.detail.desc", "点一句话即可填入输入框，你可以先改一改再发送。")}
        </span>
        {/* 编辑入口只在只读态露出，且仅 ≥超管 —— 判据由面板传入，这里不自己判角色 */}
        {isAdmin && !editing ? (
          <button type="button" className="scan-assistant-ask__choice-action" onClick={openEdit}>
            {copy("ai.copy.detail.edit", "编辑")}
          </button>
        ) : null}
        <button
          type="button"
          className="scan-assistant-ask__choice-action"
          onClick={editing ? () => setEditing(false) : onBack}
        >
          {editing ? copy("ai.copy.detail.cancel", "取消") : copy("ai.copy.detail.back", "返回对话")}
        </button>
      </div>

      <div className="scan-assistant-ask__detail-title">
        {editing ? copy("ai.copy.detail.editTitle", "维护抽屉内容") : title}
      </div>

      {editing ? (
        <CapEditor
          state={editState}
          rows={capRows}
          saving={saving}
          copy={copy}
          onPatch={patchRow}
          onMove={moveRow}
          onRemove={removeRow}
          onAdd={addRow}
          onSave={() => void saveEdit()}
        />
      ) : (
        <>
      {capState === "loading" ? (
        <div className="scan-assistant-ask__detail-empty">
          {copy("ai.copy.detail.loading", "读取中…")}
        </div>
      ) : capState === "fail" ? (
        <div className="scan-assistant-ask__detail-empty">
          {copy("ai.copy.detail.fail", "清单没拉取到，稍后再试")}
        </div>
      ) : groups.length === 0 ? (
        <div className="scan-assistant-ask__detail-empty">
          {copy("ai.copy.detail.empty", "暂时没有可用的提示词")}
        </div>
      ) : (
        groups.map((g, gi) => (
          <section className="scan-assistant-ask__caps" key={`${g.groupName}-${gi}`}>
            {g.groupName ? <div className="scan-assistant-ask__caps-group">{g.groupName}</div> : null}
            <div className="scan-assistant-ask__caps-items">
              {g.items.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className="scan-assistant-ask__cap"
                  title={it.note ? `${it.promptText}
${it.note}` : it.promptText}
                  onClick={() => onPickPrompt(it.promptText)}
                >
                  {/* 指令带动作符：它就是要被发出去的那句；备注带「说明」微标签 —— 两者靠标记区分，不靠加边框 */}
                  <span className="scan-assistant-ask__cap-line">
                    <span className="scan-assistant-ask__cap-cmd" aria-hidden>
                      ❯
                    </span>
                    <span className="scan-assistant-ask__cap-title">{it.title || it.promptText}</span>
                  </span>
                  {it.note ? (
                    <span className="scan-assistant-ask__cap-note">
                      <span className="scan-assistant-ask__cap-note-tag">
                        {copy("ai.copy.detail.noteTag", "说明")}
                      </span>
                      <span className="scan-assistant-ask__cap-note-text">{it.note}</span>
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        ))
      )}

      {/* ── 反馈表单：文字必填 + 选图 ≤6 ── */}
      <div className="scan-assistant-ask__fb">
        <div className="scan-assistant-ask__fb-title">
          {copy("ai.copy.feedback.formTitle", "写下你的意见")}
        </div>
        <textarea
          className="scan-assistant-ask__fb-input"
          rows={2}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={copy("ai.copy.feedback.contentPlaceholder", "说说遇到的问题或建议（必填）")}
          aria-label={copy("ai.copy.feedback.formTitle", "写下你的意见")}
        />
        {images.length > 0 ? (
          <div className="scan-assistant-ask__fb-thumbs">
            {images.map((u) => (
              <div className="scan-assistant-ask__fb-thumb" key={u}>
                <img src={resolveApiMediaUrl(u)} alt="" />
                <button
                  type="button"
                  className="scan-assistant-ask__attachment-remove"
                  aria-label="移除这张图"
                  onClick={() => setImages((prev) => prev.filter((x) => x !== u))}
                >
                  <X className="size-3" strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <input
          ref={formFileRef}
          type="file"
          accept="image/*"
          multiple
          className="scan-assistant-ask__file"
          onChange={(e) => {
            void uploadFiles(Array.from(e.target.files ?? []), "form");
            e.target.value = "";
          }}
          tabIndex={-1}
          aria-hidden
        />
        <div className="scan-assistant-ask__fb-row">
          <button
            type="button"
            className="scan-assistant-ask__attach"
            onClick={() => {
              if (images.length >= MAX_FEEDBACK_IMAGES) {
                toast.error(copy("ai.copy.feedback.imageLimit", "最多 6 张"));
                return;
              }
              formFileRef.current?.click();
            }}
            title={copy("ai.copy.feedback.imageHint", "最多 6 张（可选）")}
          >
            <ImagePlus className="size-4" strokeWidth={2} />
          </button>
          <span className="scan-assistant-ask__fb-hint">
            {copy("ai.copy.feedback.imageHint", "最多 6 张（可选）")}
          </span>
          <button
            type="button"
            className="scan-assistant-ask__wizard-btn scan-assistant-ask__wizard-btn--primary"
            disabled={!canSubmit}
            onClick={() => void onSubmit()}
          >
            {submitting || uploading > 0
              ? copy("ai.copy.feedback.submitting", "提交中…")
              : copy("ai.copy.feedback.submit", "提交")}
          </button>
        </div>
      </div>

      {/* ── 我的反馈 ── */}
      <div className="scan-assistant-ask__fb-list">
        <div className="scan-assistant-ask__fb-listhead">
          <span>{copy("ai.copy.feedback.listTitle", "反馈记录")}</span>
          {isAdmin ? (
            <span className="scan-assistant-ask__fb-scope">
              <button
                type="button"
                className={
                  "scan-assistant-ask__fb-scope-btn" +
                  (scope === "mine" ? " scan-assistant-ask__fb-scope-btn--on" : "")
                }
                onClick={() => switchScope("mine")}
              >
                {copy("ai.copy.feedback.mine", "我的")}
              </button>
              <button
                type="button"
                className={
                  "scan-assistant-ask__fb-scope-btn" +
                  (scope === "all" ? " scan-assistant-ask__fb-scope-btn--on" : "")
                }
                onClick={() => switchScope("all")}
              >
                {copy("ai.copy.feedback.all", "全部")}
              </button>
            </span>
          ) : null}
        </div>

        {listState === "loading" ? (
          <div className="scan-assistant-ask__fb-empty">
            {copy("ai.copy.feedback.loading", "加载中…")}
          </div>
        ) : listState === "fail" ? (
          <div className="scan-assistant-ask__fb-empty">
            {copy("ai.copy.feedback.loadFail", "列表没拉取到，稍后再试")}
          </div>
        ) : rows.length === 0 ? (
          <div className="scan-assistant-ask__fb-empty">{copy("ai.copy.feedback.empty", "还没有反馈")}</div>
        ) : (
          rows.map((r) => {
            const draft = drafts[r.id] ?? EMPTY_DRAFT;
            const replied = r.status === "REPLIED";
            const pendingStatus: FeedbackStatus = draft.status ?? (replied ? "REPLIED" : "PENDING");
            return (
              <div className="scan-assistant-ask__fb-item" key={r.id}>
                <div className="scan-assistant-ask__fb-itemhead">
                  <span className="scan-assistant-ask__fb-name">{r.userName || "—"}</span>
                  <span
                    className={
                      "scan-assistant-ask__fb-status" +
                      (replied ? " scan-assistant-ask__fb-status--replied" : "")
                    }
                  >
                    {replied
                      ? copy("ai.copy.feedback.replied", "已回复")
                      : copy("ai.copy.feedback.pending", "待处理")}
                  </span>
                  <span className="scan-assistant-ask__fb-time">{r.createdAt}</span>
                </div>
                <div className="scan-assistant-ask__fb-content">{r.content}</div>
                {r.imageUrls.length > 0 ? (
                  <div className="scan-assistant-ask__fb-thumbs">
                    {r.imageUrls.map((u) => (
                      <img
                        className="scan-assistant-ask__fb-thumb-img"
                        key={u}
                        src={resolveApiMediaUrl(u)}
                        alt=""
                      />
                    ))}
                  </div>
                ) : null}
                {r.replies.length > 0 ? (
                  <div className="scan-assistant-ask__fb-replythread">
                    <span className="scan-assistant-ask__fb-replylabel">
                      {copy("ai.copy.feedback.replyLabel", "官方回复")}
                    </span>
                    {r.replies.map((rp, ri) => (
                      <div className="scan-assistant-ask__fb-reply" key={`${r.id}-${ri}`}>
                        {rp.repliedByName || rp.repliedAt ? (
                          <div className="scan-assistant-ask__fb-replyhead">
                            {rp.repliedByName ? (
                              <span className="scan-assistant-ask__fb-replyby">{rp.repliedByName}</span>
                            ) : null}
                            {rp.repliedAt ? (
                              <span className="scan-assistant-ask__fb-time">{rp.repliedAt}</span>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="scan-assistant-ask__fb-replytext">{rp.content}</div>
                        {rp.imageUrls.length > 0 ? (
                          <div className="scan-assistant-ask__fb-thumbs">
                            {rp.imageUrls.map((u) => (
                              <button
                                type="button"
                                className="scan-assistant-ask__fb-thumb-btn"
                                key={u}
                                onClick={() => setZoom({ src: resolveApiMediaUrl(u) ?? "", label: rp.content })}
                                aria-label="查看大图"
                              >
                                <img className="scan-assistant-ask__fb-thumb-img" src={resolveApiMediaUrl(u)} alt="" />
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {isAdmin ? (
                  <div className="scan-assistant-ask__fb-admin">
                    <input
                      className="scan-assistant-ask__fb-replyinput"
                      value={draft.text}
                      onChange={(e) => patchDraft(r.id, { text: e.target.value })}
                      placeholder={copy("ai.copy.feedback.replyPlaceholder", "写回复…")}
                      aria-label={copy("ai.copy.feedback.replyPlaceholder", "写回复…")}
                    />
                    {draft.images.length > 0 ? (
                      <div className="scan-assistant-ask__fb-thumbs">
                        {draft.images.map((u) => (
                          <div className="scan-assistant-ask__fb-thumb" key={u}>
                            <img src={resolveApiMediaUrl(u)} alt="" />
                            <button
                              type="button"
                              className="scan-assistant-ask__attachment-remove"
                              aria-label="移除这张图"
                              onClick={() =>
                                patchDraft(r.id, { images: draft.images.filter((x) => x !== u) })
                              }
                            >
                              <X className="size-3" strokeWidth={3} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="scan-assistant-ask__fb-adminrow">
                      <input
                        ref={replyFileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="scan-assistant-ask__file"
                        onChange={(e) => {
                          const target = replyTargetRef.current;
                          if (target != null) void uploadFiles(Array.from(e.target.files ?? []), target);
                          e.target.value = "";
                        }}
                        tabIndex={-1}
                        aria-hidden
                      />
                      <button
                        type="button"
                        className="scan-assistant-ask__fb-mini"
                        title={copy("ai.copy.feedback.replyImageHint", "回复附图（可选）")}
                        onClick={() => {
                          if (draft.images.length >= MAX_FEEDBACK_IMAGES) {
                            toast.error(copy("ai.copy.feedback.imageLimit", "最多 6 张"));
                            return;
                          }
                          replyTargetRef.current = r.id;
                          replyFileRef.current?.click();
                        }}
                      >
                        <ImagePlus className="size-3.5" strokeWidth={2} />
                      </button>
                      {/* 状态切换：只改本地待提交状态，随「回复」一起提交 */}
                      <button
                        type="button"
                        className={
                          "scan-assistant-ask__fb-statusbtn" +
                          (pendingStatus === "REPLIED" ? " scan-assistant-ask__fb-statusbtn--on" : "")
                        }
                        onClick={() =>
                          patchDraft(r.id, {
                            status: pendingStatus === "REPLIED" ? "PENDING" : "REPLIED",
                          })
                        }
                      >
                        {pendingStatus === "REPLIED"
                          ? copy("ai.copy.feedback.replied", "已回复")
                          : copy("ai.copy.feedback.pending", "待处理")}
                      </button>
                      <button
                        type="button"
                        className="scan-assistant-ask__wizard-btn scan-assistant-ask__wizard-btn--primary"
                        disabled={submitting}
                        onClick={() => void onReply(r)}
                      >
                        {copy("ai.copy.feedback.reply", "回复")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}

        {hasMore ? (
          <div className="scan-assistant-ask__fb-empty">
            {loadingMore ? copy("ai.copy.feedback.loading", "加载中…") : ""}
          </div>
        ) : rows.length > 0 ? (
          <div className="scan-assistant-ask__fb-empty">{copy("ai.copy.feedback.end", "没有更多了")}</div>
        ) : null}
      </div>
        </>
      )}

      {/*
        点回复附图放大：铺满一屏、再点关掉。**必须 portal 到 body** —— 这段 JSX 的祖先带着
        transform 与 pointer-events: none，就地渲染会「遮罩看得见、点哪儿都关不掉」（同 AskPanel 那张图）。
      */}
      {zoom
        ? createPortal(
            <div
              className="scan-assistant-zoom"
              onClick={() => setZoom(null)}
              role="dialog"
              aria-modal="true"
              aria-label="查看大图"
            >
              <img className="scan-assistant-zoom__img" src={zoom.src} alt={zoom.label} />
              <button
                type="button"
                className="scan-assistant-zoom__close"
                onClick={() => setZoom(null)}
                aria-label="关闭大图"
              >
                <X className="size-5" strokeWidth={2} />
              </button>
              <span className="scan-assistant-zoom__hint">点任意处关闭</span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
