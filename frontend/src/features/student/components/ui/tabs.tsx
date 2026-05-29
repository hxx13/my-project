import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

type TabVariant = "underline" | "pills";

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: TabVariant;
}

export function Tabs({ tabs, activeTab, onTabChange, variant = "underline" }: TabsProps) {
  if (variant === "pills") {
    return (
      <div className="inline-flex items-center gap-1 rounded-[var(--student-radius-lg)] bg-[var(--student-canvas-soft-2)] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "px-3 py-1.5 text-sm font-medium rounded-[var(--student-radius-md)] transition-colors",
              activeTab === tab.id
                ? "bg-white text-[var(--student-primary)] shadow-sm"
                : "text-[var(--student-mute)] hover:text-[var(--student-body)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  // underline variant
  return (
    <div className="flex border-b border-[var(--student-hairline)]" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "relative px-4 py-2 text-sm font-medium transition-colors",
            activeTab === tab.id
              ? "text-[var(--student-primary)]"
              : "text-[var(--student-mute)] hover:text-[var(--student-body)]"
          )}
        >
          {tab.label}
          {activeTab === tab.id && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--student-primary)] rounded-[var(--student-radius-full)]" />
          )}
        </button>
      ))}
    </div>
  );
}
