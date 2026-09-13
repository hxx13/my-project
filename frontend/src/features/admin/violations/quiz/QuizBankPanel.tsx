import { useState } from "react";
import type { JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { AdminButton } from "@/components/admin/AdminButton";
import { AdminSwitchScaled } from "@/components/admin/AdminSwitchScaled";
import { AdminTableShell } from "@/components/admin/AdminPageShell";
import { appConfirm, appPrompt } from "@/lib/appDialog";
import { cn } from "@/lib/utils";
import {
  createQuizBank,
  createQuizQuestion,
  deleteQuizBank,
  deleteQuizQuestion,
  listQuizBanks,
  listQuizQuestions,
  updateQuizBank,
  updateQuizQuestion,
  type QuizQuestion,
} from "@/api/domains/quizBank.api";

const INPUT_CLASS =
  "w-full rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] px-3 py-1.5 text-sm text-[var(--app-color-text-primary)] outline-none transition focus:border-[var(--app-color-accent)] placeholder:text-[var(--app-color-text-tertiary)]";

const ICON_BTN_CLASS =
  "grid h-6 w-6 place-items-center rounded-md text-[var(--app-color-text-tertiary)] transition-colors hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]";

type QuestionForm = {
  mode: "create" | "edit";
  id: number | null;
  prompt: string;
  options: string[];
  correctIndex: number;
  enabled: boolean;
};

/** 有题库编码时直接建；无则询问名称，编码自动取名称。 */
export function QuizBankPanel(): JSX.Element {
  const qc = useQueryClient();
  const [pickedBankId, setPickedBankId] = useState<string | null>(null);
  const [showNewBank, setShowNewBank] = useState(false);
  const [newBankId, setNewBankId] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [form, setForm] = useState<QuestionForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: banks = [], isLoading: banksLoading } = useQuery({
    queryKey: ["quiz-banks"],
    queryFn: listQuizBanks,
  });
  // 不设 effect 回填：选中项缺省即首个库，避免 set-state-in-effect。
  const selectedBankId = pickedBankId ?? banks[0]?.bankId ?? null;
  const selectedBank = banks.find((b) => b.bankId === selectedBankId) ?? null;

  const { data: questions = [], isLoading: questionsLoading } = useQuery({
    queryKey: ["quiz-questions", selectedBankId],
    queryFn: () => listQuizQuestions(selectedBankId as string),
    enabled: selectedBankId != null,
  });

  const invalidateBanks = () => qc.invalidateQueries({ queryKey: ["quiz-banks"] });
  const invalidateQuestions = () =>
    qc.invalidateQueries({ queryKey: ["quiz-questions", selectedBankId] });

  const handleCreateBank = async () => {
    const id = newBankId.trim();
    if (!id) {
      toast.error("请填写题库编码");
      return;
    }
    try {
      await createQuizBank({ bankId: id, name: newBankName.trim() || id });
      await invalidateBanks();
      setPickedBankId(id);
      setNewBankId("");
      setNewBankName("");
      setShowNewBank(false);
      toast.success("题库已创建");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建题库失败");
    }
  };

  const handleRenameBank = async (bankId: string, currentName: string) => {
    const name = await appPrompt("题库名称", currentName, { title: "重命名题库" });
    if (name == null) return;
    try {
      await updateQuizBank(bankId, { name });
      await invalidateBanks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
    }
  };

  const handleToggleBank = async (bankId: string, checked: boolean) => {
    try {
      await updateQuizBank(bankId, { enabled: checked ? 1 : 0 });
      await invalidateBanks();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新题库失败");
    }
  };

  const handleDeleteBank = async (bankId: string, name: string) => {
    if (!(await appConfirm(`确定删除题库「${name}」？题目会一并删除。`))) return;
    try {
      await deleteQuizBank(bankId);
      setPickedBankId(null);
      setForm(null);
      await invalidateBanks();
      toast.success("题库已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除题库失败");
    }
  };

  const openCreateQuestion = () => {
    setForm({ mode: "create", id: null, prompt: "", options: ["", ""], correctIndex: 0, enabled: true });
  };

  const openEditQuestion = (q: QuizQuestion) => {
    setForm({
      mode: "edit",
      id: q.id,
      prompt: q.prompt,
      options: q.options.length > 0 ? [...q.options] : ["", ""],
      correctIndex: q.correctIndex,
      enabled: q.enabled === 1,
    });
  };

  const setOption = (index: number, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const options = [...prev.options];
      options[index] = value;
      return { ...prev, options };
    });
  };

  const addOption = () => {
    setForm((prev) => (prev ? { ...prev, options: [...prev.options, ""] } : prev));
  };

  const removeOption = (index: number) => {
    setForm((prev) => {
      if (!prev || prev.options.length <= 2) return prev;
      const options = prev.options.filter((_, i) => i !== index);
      const correctIndex =
        prev.correctIndex === index
          ? 0
          : prev.correctIndex > index
            ? prev.correctIndex - 1
            : prev.correctIndex;
      return { ...prev, options, correctIndex };
    });
  };

  const handleSaveQuestion = async () => {
    if (!form || !selectedBankId) return;
    const prompt = form.prompt.trim();
    const options = form.options.map((o) => o.trim());
    if (!prompt) {
      toast.error("题干不能为空");
      return;
    }
    if (options.length < 2) {
      toast.error("至少需要 2 个选项");
      return;
    }
    if (options.some((o) => !o)) {
      toast.error("选项不能为空");
      return;
    }
    setSaving(true);
    try {
      if (form.mode === "create") {
        await createQuizQuestion(selectedBankId, { prompt, options, correctIndex: form.correctIndex });
      } else if (form.id != null) {
        await updateQuizQuestion(form.id, {
          prompt,
          options,
          correctIndex: form.correctIndex,
          enabled: form.enabled ? 1 : 0,
        });
      }
      await invalidateQuestions();
      await invalidateBanks();
      setForm(null);
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (q: QuizQuestion) => {
    if (!(await appConfirm("确定删除该题目？"))) return;
    try {
      await deleteQuizQuestion(q.id);
      await invalidateQuestions();
      await invalidateBanks();
      toast.success("题目已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除题目失败");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      {/* 左：题库列表 */}
      <aside className="flex w-[15rem] min-h-0 shrink-0 flex-col gap-2">
        <div className="flex shrink-0 items-center justify-between">
          <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">题库</span>
          <AdminButton
            type="button"
            tone="secondary"
            size="sm"
            onClick={() => setShowNewBank((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" /> 新建
          </AdminButton>
        </div>

        {showNewBank ? (
          <div className="shrink-0 space-y-1.5 rounded-lg border border-[var(--app-color-border-default)] p-2">
            <input
              className={INPUT_CLASS}
              placeholder="题库编码（策略里填这个）"
              value={newBankId}
              onChange={(e) => setNewBankId(e.target.value)}
            />
            <input
              className={INPUT_CLASS}
              placeholder="题库名称"
              value={newBankName}
              onChange={(e) => setNewBankName(e.target.value)}
            />
            <div className="flex justify-end gap-1.5">
              <AdminButton type="button" tone="ghost" size="sm" onClick={() => setShowNewBank(false)}>
                取消
              </AdminButton>
              <AdminButton type="button" tone="primary" size="sm" onClick={() => void handleCreateBank()}>
                创建
              </AdminButton>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-y-contain pr-0.5">
          {banksLoading ? (
            <div className="px-2 py-6 text-center text-xs text-[var(--app-color-text-tertiary)]">加载中…</div>
          ) : banks.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-[var(--app-color-text-tertiary)]">暂无题库</div>
          ) : (
            banks.map((b) => {
              const active = b.bankId === selectedBankId;
              return (
                <div
                  key={b.bankId}
                  className={cn(
                    "rounded-lg border px-2.5 py-2 transition-colors",
                    active
                      ? "border-[var(--app-color-accent)] bg-[color-mix(in_srgb,var(--app-color-accent)_10%,transparent)]"
                      : "border-[var(--app-color-border-default)] hover:bg-[var(--app-color-surface-hover)]"
                  )}
                >
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => {
                      setPickedBankId(b.bankId);
                      setForm(null);
                    }}
                  >
                    <span className="block truncate text-sm font-semibold text-[var(--app-color-text-primary)]">
                      {b.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--app-color-text-tertiary)]">
                      {b.bankId} · {b.questionCount} 题
                    </span>
                  </button>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <AdminSwitchScaled
                      size="3.5"
                      checked={b.enabled === 1}
                      onChange={(v) => void handleToggleBank(b.bankId, v)}
                    />
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className={ICON_BTN_CLASS}
                        title="重命名"
                        onClick={() => void handleRenameBank(b.bankId, b.name)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={ICON_BTN_CLASS}
                        title="删除题库"
                        onClick={() => void handleDeleteBank(b.bankId, b.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* 右：题目列表 / 编辑器 */}
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--app-color-text-primary)]">
              {selectedBank ? selectedBank.name : "未选择题库"}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--app-color-text-tertiary)]">
              违规处置策略选「答题」时，从该题库抽题判分。
            </div>
          </div>
          {selectedBank && !form ? (
            <AdminButton type="button" tone="primary" size="sm" className="shrink-0" onClick={openCreateQuestion}>
              <Plus className="h-3.5 w-3.5" /> 新增题目
            </AdminButton>
          ) : null}
        </div>

        {form ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain rounded-lg border border-[var(--app-color-border-default)] p-3">
            <label className="mb-1 block text-xs font-medium text-[var(--app-color-text-secondary)]">题干</label>
            <textarea
              className={cn(INPUT_CLASS, "min-h-[64px] resize-y")}
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              placeholder="例如：实验结束后是否应关闭水龙头？"
            />

            <div className="mt-3 mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--app-color-text-secondary)]">
                选项（选中即为正确答案）
              </span>
              <AdminButton type="button" tone="ghost" size="sm" onClick={addOption}>
                <Plus className="h-3.5 w-3.5" /> 添加选项
              </AdminButton>
            </div>
            <div className="space-y-1.5">
              {form.options.map((opt, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="quiz-correct"
                    className="h-4 w-4 shrink-0 accent-[var(--app-color-accent)]"
                    checked={form.correctIndex === index}
                    onChange={() => setForm({ ...form, correctIndex: index })}
                    aria-label={`设为第 ${index + 1} 项正确答案`}
                  />
                  <input
                    className={INPUT_CLASS}
                    value={opt}
                    onChange={(e) => setOption(index, e.target.value)}
                    placeholder={`选项 ${index + 1}`}
                  />
                  <button
                    type="button"
                    className={cn(ICON_BTN_CLASS, "shrink-0")}
                    title="删除选项"
                    disabled={form.options.length <= 2}
                    onClick={() => removeOption(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {form.mode === "edit" ? (
              <div className="mt-3 flex items-center gap-2">
                <AdminSwitchScaled
                  size="sm"
                  checked={form.enabled}
                  onChange={(v) => setForm({ ...form, enabled: v })}
                />
                <span className="text-xs text-[var(--app-color-text-secondary)]">
                  {form.enabled ? "启用（参与抽题）" : "停用（不参与抽题）"}
                </span>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <AdminButton type="button" tone="secondary" size="sm" onClick={() => setForm(null)}>
                取消
              </AdminButton>
              <AdminButton type="button" tone="primary" size="sm" loading={saving} onClick={() => void handleSaveQuestion()}>
                保存
              </AdminButton>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto overscroll-y-contain">
            <AdminTableShell
              loading={questionsLoading}
              empty={!questionsLoading && questions.length === 0}
              emptyMessage={selectedBankId ? "该题库暂无题目，点右上角新增" : "请先选择或新建题库"}
              scrollable
            >
              <table className="twin-table text-left">
                <thead>
                  <tr>
                    <th>题干</th>
                    <th>选项</th>
                    <th>正确答案</th>
                    <th>状态</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => (
                    <tr key={q.id}>
                      <td className="max-w-[280px] px-3 py-2 font-medium text-[var(--app-color-text-primary)]">
                        {q.prompt}
                      </td>
                      <td className="max-w-[280px] px-3 py-2 text-[var(--app-color-text-secondary)]">
                        {q.options.join(" / ")}
                      </td>
                      <td className="px-3 py-2 text-[var(--app-color-text-secondary)]">
                        {q.options[q.correctIndex] ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="review-status" data-tone={q.enabled === 1 ? "ok" : "none"}>
                          {q.enabled === 1 ? "启用" : "停用"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <AdminButton type="button" tone="secondary" size="sm" onClick={() => openEditQuestion(q)}>
                            <Pencil className="h-3.5 w-3.5" /> 编辑
                          </AdminButton>
                          <AdminButton type="button" tone="destructive" size="sm" onClick={() => void handleDeleteQuestion(q)}>
                            <Trash2 className="h-3.5 w-3.5" /> 删除
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableShell>
          </div>
        )}
      </section>
    </div>
  );
}
