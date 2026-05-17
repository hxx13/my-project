const STORAGE_PREFIX = "aro.llm-insight.user-prompt.v1";

function key(reportKey: string) {
  return `${STORAGE_PREFIX}.${reportKey}`;
}

export function loadSavedUserPrompt(reportKey: string): string | null {
  try {
    const v = localStorage.getItem(key(reportKey));
    return v?.trim() ? v : null;
  } catch {
    return null;
  }
}

export function saveUserPromptLocally(reportKey: string, prompt: string) {
  localStorage.setItem(key(reportKey), prompt.trim());
}

export function clearSavedUserPrompt(reportKey: string) {
  localStorage.removeItem(key(reportKey));
}
