import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl",
        "bg-gradient-to-r from-gray-100 via-gray-200/50 to-gray-100 dark:from-gray-800 dark:via-gray-700/50 dark:to-gray-800",
        "after:absolute after:inset-0",
        "after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent",
        "after:animate-pulse",
        className
      )}
      {...props}
    />
  )
}
