import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { User, Tenant } from "@shared/schema";

interface AuthUser extends User {
  tenants: Tenant[];
}

export function useAuth() {
  const { data: user, isLoading, error } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 0, // Always fetch fresh user data
    refetchOnMount: 'always', // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
  };
}
