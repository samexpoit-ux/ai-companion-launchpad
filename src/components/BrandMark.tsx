import nexuraLogo from "@/assets/nexura-mark.png";
import { cn } from "@/lib/utils";

type BrandSize = "sm" | "md" | "lg";

/**
 * Nexura AI logo mark with the small "AI" badge.
 * The badge scales with the mark and stays legible on mobile and in dark mode.
 */
const MARK: Record<BrandSize, string> = {
  // mobile-first: slightly smaller on small screens so the badge never overflows
  sm: "h-9 w-9 sm:h-10 sm:w-10",
  md: "h-10 w-10 sm:h-12 sm:w-12",
  lg: "h-16 w-16 sm:h-20 sm:w-20",
};

const BADGE: Record<BrandSize, string> = {
  sm: "-bottom-0.5 -right-1 px-[3px] py-[1px] text-[6.5px] sm:text-[7px] rounded-[4px]",
  md: "-bottom-0.5 -right-1 px-1 py-[1px] text-[7px] sm:text-[8px] rounded-[4px]",
  lg: "-bottom-1 -right-1 px-1.5 py-[2px] text-[9px] sm:text-[10px] rounded-md",
};

const PIXELS: Record<BrandSize, number> = { sm: 40, md: 48, lg: 80 };

export function BrandMark({
  size = "md",
  className,
}: {
  size?: BrandSize;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <img
        src={nexuraLogo}
        alt="Nexura AI logo"
        width={PIXELS[size]}
        height={PIXELS[size]}
        className={cn("object-contain", MARK[size])}
      />
      <span
        aria-hidden="true"
        className={cn(
          "absolute inline-flex items-center justify-center font-bold leading-none tracking-[0.08em]",
          "bg-[color:var(--color-iris)] text-white",
          // keeps contrast on both light and dark surfaces
          "ring-1 ring-white/80 dark:ring-black/60 shadow-[0_2px_6px_-2px_rgba(11,15,26,0.55)]",
          BADGE[size],
        )}
      >
        AI
      </span>
    </span>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-tight text-ink-900", className)}>
      Nexura <span className="text-[color:var(--color-iris)]">AI</span>
    </span>
  );
}
