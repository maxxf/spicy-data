import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/useAuth";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import LocationsPage from "@/pages/locations";
import PromosPage from "@/pages/campaigns";
import AdminPage from "@/pages/admin";
import IncomeStatement from "@/pages/income-statement";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show landing page for logged-out users or while loading
  if (isLoading || !isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    );
  }

  // Show dashboard and protected routes for logged-in users
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/locations" component={LocationsPage} />
      <Route path="/campaigns" component={PromosPage} />
      <Route path="/income-statement" component={IncomeStatement} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <AuthenticatedLayout />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

// Layout component that shows sidebar only for authenticated users
function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show landing page without sidebar for logged-out users
  if (isLoading || !isAuthenticated) {
    return <Router />;
  }

  // Show sidebar and header for logged-in users
  return (
    <div className="flex h-screen w-full">
      <AppSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b bg-background">
          <SidebarTrigger data-testid="button-sidebar-toggle" />
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-y-auto">
          <Router />
        </main>
      </div>
    </div>
  );
}
