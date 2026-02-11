import { 
  Sparkles, 
  DollarSign, 
  Megaphone, 
  MapPin, 
  Settings, 
  LogOut, 
  Upload,
  UtensilsCrossed,
  Activity,
  FileText,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import logoImage from "@assets/a5b36301-f70a-4a41-907e-9f34a1a70b80_1760998717264.png";

const analyticsNav = [
  {
    title: "Assistant",
    url: "/",
    icon: Sparkles,
  },
  {
    title: "Menu Performance",
    url: "/menu-performance",
    icon: UtensilsCrossed,
  },
  {
    title: "Ops Signals",
    url: "/ops-signals",
    icon: Activity,
  },
  {
    title: "Campaign Tracker",
    url: "/campaigns",
    icon: Megaphone,
  },
  {
    title: "Profitability",
    url: "/profitability",
    icon: DollarSign,
  },
  {
    title: "Income Statement",
    url: "/income-statement",
    icon: FileText,
  },
];

const adminNav = [
  {
    title: "Locations",
    url: "/locations",
    icon: MapPin,
  },
  {
    title: "Data Ingestion",
    url: "/automations",
    icon: Upload,
  },
  {
    title: "Admin",
    url: "/admin",
    icon: Settings,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isSuperAdmin } = useAuth();

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "U";

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || "User";

  const roleLabel = user?.role === "super_admin" 
    ? "Super Admin" 
    : user?.role === "brand_admin" 
    ? "Brand Admin" 
    : "User";

  const renderNavItem = (item: typeof analyticsNav[0]) => {
    const isActive = location === item.url;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          className={cn(
            "h-9 text-sm",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
          data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <Link href={item.url}>
            <item.icon className="w-4 h-4" />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar data-testid="sidebar-main">
      <SidebarHeader className="px-4 py-5 border-b">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-md overflow-hidden">
            <img src={logoImage} alt="Spicy Data" className="w-full h-full object-cover" />
          </div>
          <span className="text-sm font-semibold tracking-tight">SPICY DATA</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs text-muted-foreground px-2">Analytics</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {analyticsNav.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs text-muted-foreground px-2">Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminNav
                .filter((item) => {
                  if (item.url === "/automations" || item.url === "/admin") {
                    return isSuperAdmin;
                  }
                  return true;
                })
                .map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 py-3 border-t">
        <div className="flex items-center gap-2.5">
          <Avatar className="w-7 h-7">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">{displayName}</p>
            <p className="text-xs text-muted-foreground" data-testid="text-user-role">{roleLabel}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => window.location.href = "/api/logout"}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
