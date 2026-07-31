import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared layout + typography primitives for the authenticated area.
 * Every page uses the same container width, horizontal padding, vertical
 * rhythm and heading scale so nothing looks "hibi jibi" between routes.
 */

type Width = "md" | "lg" | "xl";

const WIDTH: Record<Width, string> = {
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
};

export function PageShell({
  children,
  width = "lg",
  className,
}: {
  children: ReactNode;
  width?: Width;
  className?: string;
}) {
  return (
    <main className={cn("min-h-dvh bg-ink-100 text-ink-900", className)}>
      <div
        className={cn(
          "mx-auto w-full px-4 py-8 sm:px-6 lg:px-8 lg:py-10",
          WIDTH[width],
        )}
      >
        {children}
      </div>
    </main>
  );
}

/** Top action row (back link on the left, actions on the right). */
export function PageBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 sm:gap-3", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mt-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Consistent vertical rhythm between page blocks. */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mt-8 space-y-6", className)}>{children}</div>;
}

export function PageSection({
  title,
  description,
  actions,
  children,
  padded = true,
  className,
  labelledById,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
  labelledById?: string;
}) {
  const headingId = labelledById ?? (title ? slug(title) : undefined);
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-2xl border border-ink-200 bg-white shadow-ds-xs",
        padded ? "p-5 sm:p-6" : "p-0",
        className,
      )}
    >
      {(title || actions) && (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-3",
            padded ? "" : "px-5 pt-5 sm:px-6 sm:pt-6",
          )}
        >
          <div className="min-w-0">
            {title ? (
              <h2
                id={headingId}
                className="font-display text-base font-semibold tracking-tight text-ink-900 sm:text-lg"
              >
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-500">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      <div
        className={cn(
          title || actions ? "mt-4" : "",
          padded ? "" : "px-5 pb-5 sm:px-6 sm:pb-6",
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function PageStatGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-3", className)}>{children}</div>
  );
}

export function PageStat({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4 shadow-ds-xs sm:p-5">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-500">
        {label}
      </p>
      <p className="mt-1.5 font-display text-xl font-semibold tracking-tight text-ink-900">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-ink-500">{hint}</p> : null}
      {children}
    </div>
  );
}

export function PageNote({
  children,
  tone = "muted",
  role,
}: {
  children: ReactNode;
  tone?: "muted" | "danger";
  role?: "status" | "alert";
}) {
  return (
    <p
      role={role}
      className={cn(
        "text-xs leading-relaxed",
        tone === "danger" ? "text-red-600" : "text-ink-500",
      )}
    >
      {children}
    </p>
  );
}

export function PageEmpty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-ink-500">{children}</p>;
}

function slug(value: string) {
  return `sec-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}
