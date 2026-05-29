import * as React from "react";
import { cn } from "@/lib/utils";

type AvatarSize = "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
};

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  size?: AvatarSize;
}

function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function Avatar({ className, src, alt = "", name, size = "md", ...props }: AvatarProps) {
  const [imgError, setImgError] = React.useState(false);
  const initials = getInitials(name);

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden",
        "bg-[var(--student-mute)] text-[var(--student-mute-foreground)]",
        "ring-2 ring-[var(--student-border)]",
        sizeClasses[size],
        className,
      )}
      title={name ?? alt}
      {...props}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={alt || name || "avatar"}
          className="size-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="font-medium leading-none select-none">{initials}</span>
      )}
    </div>
  );
}
