import * as React from "react"

import { cn } from "@/lib/utils"

export interface FeedbackFormProps {
  onSubmit: (data: {
    subject: string
    content: string
    type: string
  }) => Promise<void>
  isSubmitting: boolean
  className?: string
}

interface FieldErrors {
  subject?: string
  content?: string
}

const TYPE_OPTIONS = [
  { value: "suggestion", label: "建议" },
  { value: "bug", label: "故障" },
  { value: "appeal", label: "申诉" },
] as const

export function FeedbackForm({
  onSubmit,
  isSubmitting,
  className,
}: FeedbackFormProps) {
  const [subject, setSubject] = React.useState("")
  const [type, setType] = React.useState("suggestion")
  const [content, setContent] = React.useState("")
  const [errors, setErrors] = React.useState<FieldErrors>({})
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  const validate = (): boolean => {
    const next: FieldErrors = {}
    if (!subject || subject.trim().length < 2) {
      next.subject = "主题至少需要 2 个字符"
    }
    if (!content || content.trim().length < 10) {
      next.content = "内容至少需要 10 个字符"
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    try {
      await onSubmit({ subject: subject.trim(), content: content.trim(), type })
      // Reset on success
      setSubject("")
      setType("suggestion")
      setContent("")
      setErrors({})
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "提交失败，请稍后重试"
      setSubmitError(message)
    }
  }

  const inputClasses =
    "w-full rounded-[var(--student-radius-sm)] border border-[var(--student-hairline)] bg-white px-3 py-2 text-sm text-[var(--student-body)] placeholder:text-[var(--student-mute)] outline-none transition-colors focus:border-[var(--student-primary)] focus:ring-[3px] focus:ring-[var(--student-primary-soft)]"

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("space-y-4", className)}
      noValidate
    >
      {/* Subject */}
      <div>
        <label className="mb-1 block text-[13px] font-medium text-[var(--student-ink)]">
          主题
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value)
            if (errors.subject) setErrors((p) => ({ ...p, subject: undefined }))
          }}
          placeholder="简要描述你的问题或建议"
          className={cn(
            inputClasses,
            errors.subject && "border-[var(--student-error)]",
          )}
          disabled={isSubmitting}
        />
        {errors.subject && (
          <p className="mt-1 text-xs text-[var(--student-error)]">
            {errors.subject}
          </p>
        )}
      </div>

      {/* Type */}
      <div>
        <label className="mb-1 block text-[13px] font-medium text-[var(--student-ink)]">
          类型
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={cn(inputClasses, "cursor-pointer")}
          disabled={isSubmitting}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      <div>
        <label className="mb-1 block text-[13px] font-medium text-[var(--student-ink)]">
          内容
        </label>
        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            if (errors.content) setErrors((p) => ({ ...p, content: undefined }))
          }}
          placeholder="详细描述..."
          rows={5}
          className={cn(
            inputClasses,
            "min-h-[120px] resize-y",
            errors.content && "border-[var(--student-error)]",
          )}
          disabled={isSubmitting}
        />
        {errors.content && (
          <p className="mt-1 text-xs text-[var(--student-error)]">
            {errors.content}
          </p>
        )}
      </div>

      {/* Submit error */}
      {submitError && (
        <p className="rounded-[var(--student-radius-sm)] bg-[var(--student-error-soft)] px-3 py-2 text-xs text-[var(--student-error)]">
          {submitError}
        </p>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          "inline-flex w-full items-center justify-center rounded-[var(--student-radius-sm)] bg-[var(--student-primary)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isSubmitting ? "提交中..." : "提交留言"}
      </button>
    </form>
  )
}
