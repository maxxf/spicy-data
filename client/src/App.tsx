import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { ClientProvider } from "@/contexts/client-context";
import Dashboard from "@/pages/dashboard";
import LocationsPage from "@/pages/locations";
import PromosPage from "@/pages/campaigns";
import AdminPage from "@/pages/admin";
import IncomeStatement from "@/pages/income-statement";
import NotFound from "@/pages/not-found";

function Router() {
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
        <ClientProvider>
          <SidebarProvider style={style as React.CSSProperties}>
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
          </SidebarProvider>
        </ClientProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
