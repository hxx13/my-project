import * as React from "react";
import { Button, type buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

/** 管理端四态，映射到 shadcn Button（见 docs/admin-ui-design-system.md） */
export type AdminButtonTone = "primary" | "secondary" | "ghost" | "destructive";

const toneToVariant: Record<AdminButtonTone, VariantProps<typeof buttonVariants>["variant"]> = {
  primary: "default",
  secondary: "outline",
  ghost: "ghost",
  destructive: "destructive",
};

export type AdminButtonProps = Omit<React.ComponentProps<typeof Button>, "variant"> & {
  tone?: AdminButtonTone;
};

export function AdminButton({ tone = "primary", className, ...props }: AdminButtonProps) {
  return <Button variant={toneToVariant[tone]} className={cn(className)} {...props} />;
}
