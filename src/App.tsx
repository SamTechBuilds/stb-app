import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./features/auth/AuthProvider";
import { AuthErrorScreen, LoginScreen, MfaScreen, NotConfigured, UnauthorizedScreen } from "./features/auth/AuthScreens";
import { isConfigured } from "./lib/supabase";
import { Layout } from "./components/Layout";
import { Loading, ToastProvider } from "./components/ui";
import { lazy, Suspense } from "react";
import { Overview } from "./features/overview/Overview";
import { DeliveriesList, NewDelivery } from "./features/deliveries/DeliveriesList";

const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const ClientsList = named(() => import("./features/clients/Clients"), "ClientsList");
const ClientEdit = named(() => import("./features/clients/Clients"), "ClientEdit");
const ProjectsList = named(() => import("./features/projects/Projects"), "ProjectsList");
const ProjectEdit = named(() => import("./features/projects/Projects"), "ProjectEdit");
const DeliveryEditor = named(() => import("./features/deliveries/DeliveryEditor"), "DeliveryEditor");
const Settings = named(() => import("./features/settings/Settings"), "Settings");
const page = (el: React.ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 }, mutations: { retry: 0 } },
});

function NotFound() {
  return <><h1>Page not found</h1><p><a href="/">Go to the overview</a></p></>;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Overview /> },
      { path: "/deliveries", element: <DeliveriesList /> },
      { path: "/deliveries/new", element: <NewDelivery /> },
      { path: "/deliveries/:id", element: page(<DeliveryEditor />) },
      { path: "/projects", element: page(<ProjectsList />) },
      { path: "/projects/new", element: page(<ProjectEdit />) },
      { path: "/projects/:id", element: page(<ProjectEdit />) },
      { path: "/clients", element: page(<ClientsList />) },
      { path: "/clients/new", element: page(<ClientEdit />) },
      { path: "/clients/:id", element: page(<ClientEdit />) },
      { path: "/settings", element: page(<Settings />) },
      { path: "/login", element: <Navigate to="/" replace /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

function Gate() {
  const { state } = useAuth();
  switch (state.kind) {
    case "loading": return <div className="auth"><Loading label="Checking your sign-in…" /></div>;
    case "signed_out": return <LoginScreen />;
    case "mfa_required": return <MfaScreen email={state.email} />;
    case "unauthorized": return <UnauthorizedScreen email={state.email} />;
    case "error": return <AuthErrorScreen message={state.message} />;
    case "authorized": return <RouterProvider router={router} />;
  }
}

export function App() {
  if (!isConfigured) return <NotConfigured />;
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
