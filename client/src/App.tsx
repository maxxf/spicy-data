import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { CommandBar } from "@/components/command-bar";
import { ClientProvider } from "@/contexts/client-context";
import AssistantPage from "@/pages/assistant";
import Dashboard from "@/pages/dashboard";
import LocationsPage from "@/pages/locations";
import PromosPage from "@/pages/campaigns";
import AdminPage from "@/pages/admin";
import IncomeStatement from "@/pages/income-statement";
import MenuPerformancePage from "@/pages/menu-performance";
import OpsSignalsPage from "@/pages/ops-signals";
import AutomationsPage from "@/pages/automations";
import Welcome from "@/pages/welcome";
import NotFound from "@/pages/not-found";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/" component={AssistantPage} />
      <Route path="/menu-performance" component={MenuPerformancePage} />
      <Route path="/ops-signals" component={OpsSignalsPage} />
      <Route path="/campaigns" component={PromosPage} />
      <Route path="/profitability" component={Dashboard} />
      <Route path="/income-statement" component={IncomeStatement} />
      <Route path="/locations" component={LocationsPage} />
      <Route path="/automations" component={AutomationsPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/welcome" component={Welcome} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const [location] = useLocation();
  const isPublicRoute = location.startsWith("/welcome");

  const style = {
    "--sidebar-width": "13rem",
    "--sidebar-width-icon": "3rem",
  };

  if (isPublicRoute) {
    return (
      <>
        <PublicRouter />
        <Toaster />
      </>
    );
  }

  return (
    <ClientProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex items-center gap-3 px-4 py-2 border-b bg-background sticky top-0 z-50">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <CommandBar />
              <ThemeToggle />
            </header>
            <main className="flex-1 overflow-y-auto">
              <AuthenticatedRouter />
            </main>
          </div>
        </div>
      </SidebarProvider>
      <Toaster />
    </ClientProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
