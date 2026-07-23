import toast from "react-hot-toast"

export function showToast(
  message: string,
  type: "success" | "error" | "info" = "info"
) {
  const styles = {
    success: {
      background: "var(--student-success-soft)",
      color: "var(--student-success)",
    },
    error: {
      background: "var(--student-error-soft)",
      color: "var(--student-error)",
    },
    info: {
      background: "var(--student-primary-soft)",
      color: "var(--student-primary)",
    },
  }

  toast(message, {
    style: {
      ...styles[type],
      fontSize: "14px",
      borderRadius: "var(--student-radius-sm)",
    },
    duration: 3000,
  })
}
