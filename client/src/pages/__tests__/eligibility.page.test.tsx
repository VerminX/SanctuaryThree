import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanupEffect = effect();
      return typeof cleanupEffect === "function" ? cleanupEffect : () => {};
    },
  };
});
import * as React from "react";
import Eligibility from "../eligibility";

jest.mock("@/components/eligibility/analysis-panel", () => () => React.createElement("div", { "data-testid": "analysis-panel" }));
jest.mock("@/components/eligibility/stats-grid", () => ({
  StatsGrid: () => React.createElement("div", { "data-testid": "stats-grid" }),
}));
jest.mock("@/components/eligibility/bulk-data-error-card", () => ({
  BulkDataErrorCard: ({ onRetry }: { onRetry: () => void }) =>
    React.createElement("button", { "data-testid": "button-retry-bulk-data", onClick: onRetry }, "Retry"),
}));
jest.mock("@/components/eligibility/analysis-section", () => ({
  AnalysisSection: () => React.createElement("div", { "data-testid": "analysis-section" }),
}));
jest.mock("@/components/eligibility/recent-analyses-card", () => ({
  RecentAnalysesCard: () => React.createElement("div", { "data-testid": "card-recent-analyses" }),
}));
jest.mock("@/components/eligibility/ai-info-card", () => ({
  AiInfoCard: () => React.createElement("div", { "data-testid": "card-ai-info" }),
}));

const mockToast = jest.fn();
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockUseAuth = jest.fn();
jest.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseEligibilityData = jest.fn();
jest.mock("@/hooks/useEligibilityData", () => ({
  useEligibilityData: (...args: unknown[]) => mockUseEligibilityData(...args),
}));

const mockRedirect = jest.fn();
const mockUseUnauthorizedRedirect = jest.fn(() => mockRedirect);
jest.mock("@/hooks/useUnauthorizedRedirect", () => ({
  useUnauthorizedRedirect: () => mockUseUnauthorizedRedirect(),
}));

jest.mock("@/components/eligibility/eligibility-layout", () => ({
  EligibilityLayout: ({ children, dataTestId }: { children: React.ReactNode; dataTestId: string }) =>
    React.createElement("div", { "data-testid": dataTestId }, children),
}));

jest.mock("@/components/eligibility/no-tenant-card", () => ({
  NoTenantCard: () => React.createElement("div", { "data-testid": "card-no-tenant" }),
}));

jest.mock("@/components/eligibility/invalid-tenant-card", () => ({
  InvalidTenantCard: () => React.createElement("div", { "data-testid": "card-invalid-tenant" }),
}));

const invalidateQueries = jest.fn();
const mutationOptions: Array<{ onError: (error: Error) => void }> = [];

jest.mock("@tanstack/react-query", () => ({
  QueryClient: function MockQueryClient() {
    return {};
  },
  useMutation: (options: { onError: (error: Error) => void }) => {
    mutationOptions.push(options);
    return {
      mutateAsync: jest.fn(),
      isPending: false,
    };
  },
  useQueryClient: () => ({ invalidateQueries }),
}));

const defaultEligibilityData = {
  encounters: [],
  episodes: [],
  checksLoading: false,
  bulkDataLoading: false,
  bulkDataError: null,
  retryBulkData: jest.fn(),
  stats: {
    safeRecentChecks: [],
    totalAnalyses: 0,
    eligible: 0,
    notEligible: 0,
    unclear: 0,
  },
};

describe("Eligibility page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mutationOptions.length = 0;
    mockUseUnauthorizedRedirect.mockReturnValue(mockRedirect);
    mockUseEligibilityData.mockReturnValue(defaultEligibilityData);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a loading state while authentication is loading", () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true, isAuthenticated: false });

    render(React.createElement(Eligibility));

    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("renders the no tenant card when the user lacks tenant access", () => {
    mockUseAuth.mockReturnValue({
      user: { tenants: [] },
      isLoading: false,
      isAuthenticated: true,
    });

    render(React.createElement(Eligibility));

    expect(screen.getByTestId("card-no-tenant")).toBeTruthy();
  });

  it("redirects when authentication resolves as unauthorized", async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false, isAuthenticated: false });

    render(React.createElement(Eligibility));

    await waitFor(() => {
      expect(mockRedirect).toHaveBeenCalled();
    });
  });

  it("uses the unauthorized redirect handler when a mutation fails with 401", async () => {
    mockUseAuth.mockReturnValue({
      user: { tenants: [{ id: "tenant-1234567890" }] },
      isLoading: false,
      isAuthenticated: true,
    });

    mockUseEligibilityData.mockReturnValue({
      ...defaultEligibilityData,
      stats: {
        safeRecentChecks: [],
        totalAnalyses: 0,
        eligible: 0,
        notEligible: 0,
        unclear: 0,
      },
    });

    render(React.createElement(Eligibility));

    expect(mutationOptions).toHaveLength(2);

    mutationOptions[0].onError(new Error("401: Unauthorized"));

    expect(mockRedirect).toHaveBeenCalled();
  });
});
