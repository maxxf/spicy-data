// Replit Auth integration - useAuth hook
import { useQuery } from "@tanstack/react-query";
import type { User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isSuperAdmin: user?.role === "super_admin",
    isBrandAdmin: user?.role === "brand_admin" || user?.role === "super_admin",
  };
}
