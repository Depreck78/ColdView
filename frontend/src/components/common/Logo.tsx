import { cn } from "@/lib/utils";

/**
 * Coldview brand mark — an icy crystalline hexagon "viewport": the crystal
 * facets evoke "cold", the central aperture evokes "view". Rendered as inline
 * SVG so it can carry the brand gradient and the cold drop-shadow glow. The
 * gradient id is suffixed so multiple marks on one page never collide.
 */
export function LogoMark({
  className,
  glow = true,
  idSuffix = "default",
}: {
  className?: string;
  glow?: boolean;
  idSuffix?: string;
}) {
  const gid = `cv-ice-${idSuffix}`;
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", glow && "cv-logo-glow", className)}
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <path d="M16 3 L27 9.5 L27 22.5 L16 29 L5 22.5 L5 9.5 Z" fill={`url(#${gid})`} />
      <path d="M16 3 L27 9.5 L16 16 L5 9.5 Z" fill="#ffffff" opacity="0.22" />
      <path d="M16 16 L27 9.5 L27 22.5 L16 29 Z" fill="#0b1622" opacity="0.16" />
      <circle cx="16" cy="16" r="3.6" fill="hsl(var(--card))" />
      <circle cx="16" cy="16" r="1.5" fill="#e0f7ff" />
    </svg>
  );
}

/**
 * Full horizontal lockup: mark + "Coldview" wordmark (gradient on the "view").
 */
export function LogoLockup({
  className,
  markClassName = "h-6 w-6",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("flex items-center gap-2 font-bold tracking-tight", className)}>
      <LogoMark className={markClassName} idSuffix="lockup" />
      <span className="text-foreground">
        Cold<span className="cv-brand-gradient">view</span>
      </span>
    </span>
  );
}
