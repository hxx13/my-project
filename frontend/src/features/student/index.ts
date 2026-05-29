// 学生端功能模块 — 顶层入口
// 使用方式: import { StudentButton, useStudentTheme, verifyQrCode } from "@/features/student";

// === UI 组件 ===
export {
  StudentButton,
  studentButtonVariants,
  StudentInput,
  StudentCard,
  studentCardVariants,
  StudentSelect,
  Badge,
  Avatar,
  Skeleton,
  EmptyState,
  ErrorRetry,
  Switch,
  Checkbox,
  Tabs,
  Tooltip,
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Table,
  showToast,
  ThemePicker,
  THEMES,
} from "./components/ui";
export type {
  StudentButtonProps,
  StudentInputProps,
  StudentCardProps,
  Column,
  TableProps,
} from "./components/ui";

// === 布局组件 ===
export { StudentLayout, StudentSidebar, StudentHeader } from "./components/layout";

// === QR 组件 ===
export { QrUploader } from "./components/qr";

// === Hooks ===
export { useStudentTheme, STUDENT_THEMES, useStudentProfile, useStudentAccessRecords } from "./hooks";
export type { StudentThemeId } from "./hooks";

// === API ===
export {
  verifyQrCode,
  registerStudent,
  fetchStudentProfile,
  fetchStudentAccessRecords,
  fetchStudentPermissions,
} from "./api";
export type {
  StudentQrVerifyResponse,
  StudentProfile,
  StudentAccessRecord,
  StudentPermission,
} from "./api";
