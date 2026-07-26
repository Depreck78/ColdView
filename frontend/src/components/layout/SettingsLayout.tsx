import { Link, NavLink, Outlet } from "react-router-dom";
import { ArrowLeft, UserCircle2, Bot, Building2, Database, MessageSquareMore, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "@/components/common/Logo";

// Each section is its own route under /settings.
const SETTINGS_SECTIONS = [
  { to: "/settings/profile", label: "Profile", icon: UserCircle2 },
  { to: "/settings/ai", label: "AI Settings", icon: Bot },
  { to: "/settings/brokers", label: "Brokers", icon: Building2 },
  { to: "/settings/data", label: "Data sources", icon: Database },
  { to: "/settings/connections", label: "Connections", icon: MessageSquareMore },
  { to: "/settings/api-access", label: "API access", icon: KeyRound },
];

/**
 * Dedicated shell for the Settings area: a settings-specific left rail that
 * fully replaces the main app sidebar. Each rail item navigates to its own
 * sub-route, rendered in the <Outlet />.
 */
export function SettingsLayout() {
  return (
    <div className="flex h-screen bg-background">
      {/* Settings rail — replaces the main sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-e cv-glass">
        <div className="border-b p-4">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:flip-x" /> Back to Coldview
          </Link>
          <div className="flex items-center gap-2">
            <LogoMark className="h-6 w-6" />
            <span className="text-base font-bold tracking-tight">Settings</span>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-auto p-2">
          {SETTINGS_SECTIONS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
