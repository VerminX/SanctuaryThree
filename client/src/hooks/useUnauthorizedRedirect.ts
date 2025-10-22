import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

export function useUnauthorizedRedirect() {
  const { toast } = useToast();

  return useCallback(() => {
    toast({
      title: "Unauthorized",
      description: "You are logged out. Logging in again...",
      variant: "destructive",
    });

    window.setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);
  }, [toast]);
}
