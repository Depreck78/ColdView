import { Suspense, lazy, type ComponentType } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { SettingsLayout } from "@/components/layout/SettingsLayout";

const Home = lazy(() => import("@/pages/Home").then((m) => ({ default: m.Home })));
const Onboarding = lazy(() => import("@/pages/Onboarding").then((m) => ({ default: m.Onboarding })));
const Morning = lazy(() => import("@/pages/Morning").then((m) => ({ default: m.Morning })));
const Journal = lazy(() => import("@/pages/Journal").then((m) => ({ default: m.Journal })));
const Agent = lazy(() => import("@/pages/Agent").then((m) => ({ default: m.Agent })));
const RunDetail = lazy(() =>
  import("@/pages/RunDetail").then((m) => ({ default: m.RunDetail })),
);
const Compare = lazy(() =>
  import("@/pages/Compare").then((m) => ({ default: m.Compare })),
);
const ProfileSettings = lazy(() =>
  import("@/pages/settings/ProfileSettings").then((m) => ({ default: m.ProfileSettings })),
);
const AiSettings = lazy(() =>
  import("@/pages/settings/AiSettings").then((m) => ({ default: m.AiSettings })),
);
const BrokersSettings = lazy(() =>
  import("@/pages/settings/BrokersSettings").then((m) => ({ default: m.BrokersSettings })),
);
const DataSettings = lazy(() =>
  import("@/pages/settings/DataSettings").then((m) => ({ default: m.DataSettings })),
);
const ConnectionsSettings = lazy(() =>
  import("@/pages/settings/ConnectionsSettings").then((m) => ({ default: m.ConnectionsSettings })),
);
const ApiAccessSettings = lazy(() =>
  import("@/pages/settings/ApiAccessSettings").then((m) => ({ default: m.ApiAccessSettings })),
);
const Runtime = lazy(() =>
  import("@/pages/Runtime").then((m) => ({ default: m.Runtime })),
);
const Reports = lazy(() =>
  import("@/pages/Reports").then((m) => ({ default: m.Reports })),
);
const Correlation = lazy(() =>
  import("@/pages/Correlation").then((m) => ({ default: m.Correlation })),
);
const AlphaZoo = lazy(() =>
  import("@/pages/AlphaZoo").then((m) => ({ default: m.AlphaZoo })),
);

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

function wrap(Component: ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: "/onboarding", element: wrap(Onboarding) },
  {
    element: <Layout />,
    children: [
      { path: "/", element: wrap(Home) },
      { path: "/morning", element: wrap(Morning) },
      { path: "/journal", element: wrap(Journal) },
      { path: "/agent", element: wrap(Agent) },
      { path: "/runtime", element: wrap(Runtime) },
      { path: "/reports", element: wrap(Reports) },
      { path: "/runs/:runId", element: wrap(RunDetail) },
      { path: "/compare", element: wrap(Compare) },
      { path: "/correlation", element: wrap(Correlation) },
      { path: "/alpha-zoo", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/bench", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/compare", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/:alphaId", element: wrap(AlphaZoo) },
    ],
  },
  {
    element: <SettingsLayout />,
    children: [
      { path: "/settings", element: <Navigate to="/settings/profile" replace /> },
      { path: "/settings/profile", element: wrap(ProfileSettings) },
      { path: "/settings/ai", element: wrap(AiSettings) },
      { path: "/settings/brokers", element: wrap(BrokersSettings) },
      { path: "/settings/data", element: wrap(DataSettings) },
      { path: "/settings/connections", element: wrap(ConnectionsSettings) },
      { path: "/settings/api-access", element: wrap(ApiAccessSettings) },
    ],
  },
]);
