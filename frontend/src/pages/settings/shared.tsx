import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

// Shared input styling used across all settings pages.
export const fieldClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
export const labelClass = "text-sm font-medium";
export const hintClass = "text-xs text-muted-foreground";

/** Consistent page shell for every settings sub-route. */
export function SettingsPage({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {children}
    </div>
  );
}

/** Centered loading / error state for pages that fetch backend settings. */
export function SettingsLoader({ error }: { error?: string | null }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border bg-card p-5 text-sm text-muted-foreground">
      {error ? (
        <div className="text-center">
          <div className="font-medium text-foreground">{"Settings are unavailable"}</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {"Loading..."}
        </>
      )}
    </div>
  );
}
