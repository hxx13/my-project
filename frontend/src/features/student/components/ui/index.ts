// 学生端 UI 组件库 — 统一入口
// 使用方式: import { StudentButton, Badge, Switch } from "@/features/student/components/ui";

// 基础组件（带 Student 前缀以避免与 shadcn 冲突）
export { StudentButton, studentButtonVariants } from "./button";
export type { StudentButtonProps } from "./button";

export { StudentInput } from "./input";
export type { StudentInputProps } from "./input";

export { StudentCard, studentCardVariants } from "./card";
export type { StudentCardProps } from "./card";

export { StudentSelect } from "./select";

// 展示类组件
export { Badge } from "./badge";
export { Avatar } from "./avatar";
export { Skeleton } from "./skeleton";
export { EmptyState } from "./empty-state";
export { ErrorRetry } from "./error-retry";

// 交互类组件
export { Switch } from "./switch";
export { Checkbox } from "./checkbox";
export { Tabs } from "./tabs";
export { Tooltip } from "./tooltip";

// 高级组件
export { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./dialog";
export { Table } from "./table";
export type { Column, TableProps } from "./table";
export { showToast } from "./toast";
export { ThemePicker, THEMES } from "./theme-picker";

export { RoomCard } from "./room-card";
export type { RoomCardProps } from "./room-card";

export { CellDetailModal } from "./cell-detail-modal";
export { ViewToggle } from "./view-toggle";
export type { ViewToggleProps } from "./view-toggle";
export { BarChart } from "./bar-chart";
export type { BarChartProps, BarChartDataItem } from "./bar-chart";

// 业务组件
export { StatPanel } from "./stat-panel";
export type { StatPanelProps } from "./stat-panel";
export { NotificationItem } from "./notification-item";
export type { NotificationItemProps } from "./notification-item";
export { FaqAccordion } from "./faq-accordion";
export type { FaqGroup, FaqAccordionProps } from "./faq-accordion";
export { FeedbackForm } from "./feedback-form";
export type { FeedbackFormProps } from "./feedback-form";
