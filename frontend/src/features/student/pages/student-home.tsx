import { FileText, Key, User } from "lucide-react";
import { StudentCard } from "../components/ui";

const cards = [
  {
    icon: FileText,
    title: "出入记录",
    description: "此模块即将上线",
  },
  {
    icon: Key,
    title: "门禁权限",
    description: "此模块即将上线",
  },
  {
    icon: User,
    title: "个人档案",
    description: "此模块即将上线",
  },
] as const;

export default function StudentHomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--student-foreground)]">
        欢迎回来
      </h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <StudentCard key={card.title} padding="lg">
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div className="flex items-center justify-center size-12 rounded-full bg-[var(--student-primary-soft)] text-[var(--student-primary)]">
                <card.icon className="size-6" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--student-foreground)]">
                  {card.title}
                </h3>
                <p className="text-xs text-[var(--student-mute-foreground)] mt-1">
                  {card.description}
                </p>
              </div>
            </div>
          </StudentCard>
        ))}
      </div>
    </div>
  );
}
