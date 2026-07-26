import i18n, { SUPPORTED_LANGUAGES } from "@/i18n";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";
import { SettingsPage, fieldClass } from "./shared";

export function ProfileSettings() {
  // Subscribe to i18n so the language select re-renders on change.
  useTranslation();
  const { dark, toggle } = useDarkMode();
  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES.find((l) => i18n.languages?.includes(l.code)) ??
    SUPPORTED_LANGUAGES[0];

  return (
    <SettingsPage title="Profile" description="Personalize how Coldview looks and reads for you.">
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-medium">{"Appearance"}</div>
            <div className="inline-flex rounded-lg border bg-background p-1">
              <button
                type="button"
                onClick={() => { if (dark) toggle(); }}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition", !dark ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Sun className="h-4 w-4" /> {"Light"}
              </button>
              <button
                type="button"
                onClick={() => { if (!dark) toggle(); }}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition", dark ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Moon className="h-4 w-4" /> {"Dark"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{"Color theme for this browser."}</p>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{"Language"}</div>
            <select
              value={currentLang.code}
              onChange={(event) => { i18n.changeLanguage(event.target.value).catch(() => {}); }}
              className={`${fieldClass} max-w-xs`}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-muted-foreground">{"Interface language."}</p>
          </div>
        </div>
      </section>
    </SettingsPage>
  );
}
