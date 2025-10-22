import { PropsWithChildren } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

interface EligibilityLayoutProps extends PropsWithChildren {
  dataTestId: string;
}

export function EligibilityLayout({ dataTestId, children }: EligibilityLayoutProps) {
  return (
    <div className="min-h-screen flex bg-background" data-testid={dataTestId}>
      <Sidebar />

      <main className="flex-1">
        <Header
          title="Eligibility Analysis"
          subtitle="AI-powered Medicare LCD policy checking and coverage determination"
        />

        <div className="p-6 space-y-6">{children}</div>
      </main>
    </div>
  );
}
