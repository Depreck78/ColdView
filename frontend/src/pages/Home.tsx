import { Link } from "react-router-dom";
import { ArrowRight, Bot, BarChart3, Zap, UserCircle2, MessageSquarePlus, SearchCode, LineChart, ShieldCheck, Snowflake } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LogoMark } from "@/components/common/Logo";

export function Home() {
  const { t } = useTranslation();

  const FEATURES = [
    { icon: Bot, title: t("home.featureAgent"), desc: t("home.featureAgentDesc") },
    { icon: BarChart3, title: t("home.featureBacktest"), desc: t("home.featureBacktestDesc") },
    { icon: Zap, title: t("home.featureStreaming"), desc: t("home.featureStreamingDesc") },
    { icon: UserCircle2, title: t("home.featureReplay"), desc: t("home.featureReplayDesc") },
  ];

  const STEPS = [
    { icon: MessageSquarePlus, title: t("home.step1Title"), desc: t("home.step1Desc") },
    { icon: SearchCode, title: t("home.step2Title"), desc: t("home.step2Desc") },
    { icon: LineChart, title: t("home.step3Title"), desc: t("home.step3Desc") },
    { icon: ShieldCheck, title: t("home.step4Title"), desc: t("home.step4Desc") },
  ];

  return (
    <div className="relative flex flex-col items-center px-6 pb-20">
      {/* Icy ambient hero backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden"
      >
        <div className="absolute left-1/2 top-[-160px] h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute left-1/4 top-[-120px] h-[300px] w-[420px] -translate-x-1/2 rounded-full bg-accent/10 blur-[110px]" />
      </div>

      {/* Hero */}
      <div className="relative mt-20 max-w-3xl text-center">
        <LogoMark className="cv-float mx-auto mb-6 h-16 w-16" />

        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Snowflake className="h-3 w-3" />
          {t("home.tagline", "Cold, clear market intelligence")}
        </span>

        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
          {t("home.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {t("home.subtitle")}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/agent"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:shadow-primary/40"
          >
            {t("home.startResearch")} <ArrowRight className="h-4 w-4 rtl:flip-x" />
          </Link>
          <Link
            to="/alpha-zoo"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-6 py-3 font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
          >
            {t("layout.alphaZoo")}
          </Link>
        </div>
      </div>

      {/* How it works */}
      <div className="relative mt-20 w-full max-w-5xl">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("home.howItWorksTitle")}
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, desc }, index) => (
            <div key={title} className="cv-frost-card relative rounded-xl p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-mono text-muted-foreground/60">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
              {index < STEPS.length - 1 && (
                <ArrowRight className="absolute top-1/2 -right-5 hidden h-4 w-4 -translate-y-1/2 text-primary/30 md:block rtl:flip-x" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Feature grid */}
      <div className="relative mt-12 grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="cv-frost-card rounded-xl p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 text-primary">
              <Icon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
