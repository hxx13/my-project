import type { ReactNode } from "react";

/**
 * Wrapper for admin pages that need full-width layout.
 *
 * AdminLayout wraps all pages in <div class="p-6 sm:p-8"> to provide
 * standard page-level padding. This works well for forms and simple
 * content, but multi-column dashboards, card grids, wide tables, and
 * split-panel layouts need the full available width.
 *
 * Usage:
 *   export default function MyPage() {
 *     return <AdminFullWidthPage>...your content...</AdminFullWidthPage>;
 *   }
 *
 * Design standard: UI设计规范与主题标准.md 原则六 + 原则八
 */
export function AdminFullWidthPage({ children }: { children: ReactNode }) {
  return <div className="page-full-bleed">{children}</div>;
}
