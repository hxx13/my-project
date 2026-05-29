import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "student-theme-preference";

/** 默认主题标识 */
const DEFAULT = "violet";

/** 所有可用主题 */
export const STUDENT_THEMES = [
  { id: "violet", label: "浅紫", color: "#8b5cf6" },
  { id: "blue", label: "蓝色", color: "#3b82f6" },
  { id: "green", label: "绿色", color: "#22c55e" },
  { id: "amber", label: "琥珀", color: "#f59e0b" },
  { id: "rose", label: "玫瑰", color: "#f43f5e" },
] as const;

export type StudentThemeId = (typeof STUDENT_THEMES)[number]["id"];

function getStoredTheme(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/**
 * 学生端主题管理 hook
 *
 * 将用户选择的主题色持久化到 localStorage，并通过
 * `data-student-theme` 属性驱动 CSS 变量的切换。
 */
export function useStudentTheme() {
  const [theme, setThemeState] = useState<string>(DEFAULT);

  // 初始化：读取 localStorage 中的存储值
  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  // 主题变化时同步到 DOM 属性
  useEffect(() => {
    document.documentElement.setAttribute("data-student-theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: string) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* localStorage 不可用时静默忽略 */
    }
    // 立即生效，不等 React 重渲染
    document.documentElement.setAttribute("data-student-theme", t);
  }, []);

  return { theme, setTheme, themes: STUDENT_THEMES };
}
