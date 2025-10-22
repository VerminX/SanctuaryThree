import { useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUnauthorizedRedirect } from "@/hooks/useUnauthorizedRedirect";

export function useProtectedPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const redirectToLogin = useUnauthorizedRedirect();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      redirectToLogin();
    }
  }, [isAuthenticated, isLoading, redirectToLogin]);

  const currentTenant = user?.tenants?.[0] ?? null;

  const tenantState = useMemo(() => {
    const tenantId = currentTenant?.id ?? null;
    const isValidTenant = Boolean(tenantId && typeof tenantId === "string" && tenantId.length >= 10);

    return {
      tenantId,
      isValidTenant,
    };
  }, [currentTenant?.id]);

  return {
    user,
    isAuthenticated,
    isLoading,
    currentTenant,
    ...tenantState,
  } as const;
}
