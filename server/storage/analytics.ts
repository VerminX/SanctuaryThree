import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  analyticsSnapshots,
  healingTrends,
  performanceMetrics,
  costAnalytics,
  complianceTracking,
  encounters,
  eligibilityChecks,
  episodes,
  tenantUsers,
  type AnalyticsSnapshot,
  type InsertAnalyticsSnapshot,
  type HealingTrend,
  type InsertHealingTrend,
  type PerformanceMetric,
  type InsertPerformanceMetric,
  type CostAnalytic,
  type InsertCostAnalytic,
  type ComplianceTracking,
  type InsertComplianceTracking,
} from "@shared/schema";
import type { StorageDependencies } from "./dependencies";

interface TenantCostSummary {
  totalCosts: number;
  totalReimbursement: number;
  netMargin: number;
  episodeCount: number;
  averageCostPerEpisode: number;
}

export interface AnalyticsContext {
  createAnalyticsSnapshot(snapshot: InsertAnalyticsSnapshot): Promise<AnalyticsSnapshot>;
  getAnalyticsSnapshot(id: string): Promise<AnalyticsSnapshot | undefined>;
  getAnalyticsSnapshotsByTenant(tenantId: string, aggregationPeriod?: string, limit?: number): Promise<AnalyticsSnapshot[]>;
  getAnalyticsSnapshotsByDateRange(tenantId: string, startDate: Date, endDate: Date, aggregationPeriod: string): Promise<AnalyticsSnapshot[]>;
  updateAnalyticsSnapshot(id: string, updates: Partial<InsertAnalyticsSnapshot>): Promise<AnalyticsSnapshot>;
  deleteAnalyticsSnapshot(id: string): Promise<void>;
  getLatestAnalyticsSnapshot(tenantId: string, aggregationPeriod: string): Promise<AnalyticsSnapshot | undefined>;
  createHealingTrend(trend: InsertHealingTrend): Promise<HealingTrend>;
  getHealingTrend(id: string): Promise<HealingTrend | undefined>;
  getHealingTrendsByEpisode(episodeId: string): Promise<HealingTrend[]>;
  getHealingTrendsByTenant(tenantId: string, limit?: number): Promise<HealingTrend[]>;
  getHealingTrendsByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<HealingTrend[]>;
  updateHealingTrend(id: string, updates: Partial<InsertHealingTrend>): Promise<HealingTrend>;
  deleteHealingTrend(id: string): Promise<void>;
  getHealingTrendsByPatient(patientId: string): Promise<HealingTrend[]>;
  getEpisodeHealingTrajectory(episodeId: string): Promise<HealingTrend[]>;
  createPerformanceMetric(metric: InsertPerformanceMetric): Promise<PerformanceMetric>;
  getPerformanceMetric(id: string): Promise<PerformanceMetric | undefined>;
  getPerformanceMetricsByTenant(tenantId: string, metricScope?: string, limit?: number): Promise<PerformanceMetric[]>;
  getPerformanceMetricsByProvider(providerId: string, limit?: number): Promise<PerformanceMetric[]>;
  getPerformanceMetricsByDateRange(tenantId: string, startDate: Date, endDate: Date, metricPeriod: string): Promise<PerformanceMetric[]>;
  updatePerformanceMetric(id: string, updates: Partial<InsertPerformanceMetric>): Promise<PerformanceMetric>;
  deletePerformanceMetric(id: string): Promise<void>;
  getProviderPerformanceComparison(tenantId: string, metricPeriod: string, limit?: number): Promise<PerformanceMetric[]>;
  getPerformanceTrends(tenantId: string, metricType: string, periods: number): Promise<PerformanceMetric[]>;
  createCostAnalytic(cost: InsertCostAnalytic): Promise<CostAnalytic>;
  getCostAnalytic(id: string): Promise<CostAnalytic | undefined>;
  getCostAnalyticsByTenant(tenantId: string, analysisPeriod?: string, limit?: number): Promise<CostAnalytic[]>;
  getCostAnalyticsByEpisode(episodeId: string): Promise<CostAnalytic[]>;
  getCostAnalyticsByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<CostAnalytic[]>;
  updateCostAnalytic(id: string, updates: Partial<InsertCostAnalytic>): Promise<CostAnalytic>;
  deleteCostAnalytic(id: string): Promise<void>;
  getCostAnalyticsByPatient(patientId: string): Promise<CostAnalytic[]>;
  getTenantCostSummary(tenantId: string, startDate: Date, endDate: Date): Promise<TenantCostSummary>;
  getCostEfficiencyMetrics(tenantId: string, period: string): Promise<CostAnalytic[]>;
  createComplianceTracking(compliance: InsertComplianceTracking): Promise<ComplianceTracking>;
  getComplianceTracking(id: string): Promise<ComplianceTracking | undefined>;
  getComplianceTrackingByTenant(tenantId: string, assessmentType?: string, limit?: number): Promise<ComplianceTracking[]>;
  getComplianceTrackingByEpisode(episodeId: string): Promise<ComplianceTracking[]>;
  getComplianceTrackingByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<ComplianceTracking[]>;
  updateComplianceTracking(id: string, updates: Partial<InsertComplianceTracking>): Promise<ComplianceTracking>;
  deleteComplianceTracking(id: string): Promise<void>;
  getComplianceTrackingByEligibilityCheck(eligibilityCheckId: string): Promise<ComplianceTracking[]>;
  getTenantComplianceSummary(tenantId: string, startDate: Date, endDate: Date): Promise<{
    overallComplianceRate: number;
    medicareComplianceRate: number;
    criticalViolations: number;
    minorViolations: number;
    assessmentCount: number;
  }>;
  getComplianceRiskAnalysis(tenantId: string): Promise<ComplianceTracking[]>;
  calculateTenantAnalyticsSnapshot(tenantId: string, snapshotDate: Date, aggregationPeriod: string): Promise<AnalyticsSnapshot>;
  calculateEpisodeHealingTrends(episodeId: string): Promise<HealingTrend[]>;
  calculateProviderPerformanceMetrics(providerId: string, metricDate: Date, metricPeriod: string): Promise<PerformanceMetric>;
  calculateEpisodeCostAnalytics(episodeId: string): Promise<CostAnalytic>;
  assessEpisodeCompliance(episodeId: string): Promise<ComplianceTracking>;
  bulkCreateAnalyticsSnapshots(snapshots: InsertAnalyticsSnapshot[]): Promise<AnalyticsSnapshot[]>;
  bulkCreateHealingTrends(trends: InsertHealingTrend[]): Promise<HealingTrend[]>;
  bulkCreatePerformanceMetrics(metrics: InsertPerformanceMetric[]): Promise<PerformanceMetric[]>;
  bulkCreateCostAnalytics(costs: InsertCostAnalytic[]): Promise<CostAnalytic[]>;
  bulkCreateComplianceTracking(compliance: InsertComplianceTracking[]): Promise<ComplianceTracking[]>;
  getTenantAnalyticsDashboard(tenantId: string, period: string): Promise<{
    currentMetrics: AnalyticsSnapshot | undefined;
    healingTrends: HealingTrend[];
    performanceMetrics: PerformanceMetric[];
    costSummary: CostAnalytic[];
    complianceStatus: ComplianceTracking[];
  }>;
  getProviderAnalyticsDashboard(providerId: string, tenantId: string, period: string): Promise<{
    performanceMetrics: PerformanceMetric[];
    healingOutcomes: HealingTrend[];
    costEfficiency: CostAnalytic[];
    complianceRecord: ComplianceTracking[];
  }>;
}

export function createAnalyticsContext(deps: StorageDependencies): AnalyticsContext {
  const logError = (event: string, meta: Record<string, unknown>, error: unknown) => {
    deps.logger.error(event, { ...meta, message: error instanceof Error ? error.message : String(error) });
  };

  const context: AnalyticsContext = {
    async createAnalyticsSnapshot(snapshot) {
      try {
        const [result] = await deps.db.insert(analyticsSnapshots).values(snapshot).returning();
        return result;
      } catch (error) {
        logError("ANALYTICS_SNAPSHOT_CREATE_FAILED", { tenantId: snapshot.tenantId }, error);
        throw new Error(`Failed to create analytics snapshot: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getAnalyticsSnapshot(id) {
      try {
        const [result] = await deps.db.select().from(analyticsSnapshots).where(eq(analyticsSnapshots.id, id));
        return result;
      } catch (error) {
        logError("ANALYTICS_SNAPSHOT_FETCH_FAILED", { snapshotId: id }, error);
        throw new Error(`Failed to fetch analytics snapshot: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getAnalyticsSnapshotsByTenant(tenantId, aggregationPeriod, limit) {
      try {
        const conditions = [eq(analyticsSnapshots.tenantId, tenantId)];

        if (aggregationPeriod) {
          conditions.push(eq(analyticsSnapshots.aggregationPeriod, aggregationPeriod));
        }

        let query = deps.db
          .select()
          .from(analyticsSnapshots)
          .where(and(...conditions))
          .orderBy(desc(analyticsSnapshots.snapshotDate));

        if (limit) {
          query = query.limit(limit);
        }

        return await query;
      } catch (error) {
        logError("ANALYTICS_SNAPSHOTS_TENANT_FAILED", { tenantId, aggregationPeriod }, error);
        throw new Error(`Failed to fetch analytics snapshots: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getAnalyticsSnapshotsByDateRange(tenantId, startDate, endDate, aggregationPeriod) {
      try {
        return deps.db
          .select()
          .from(analyticsSnapshots)
          .where(
            and(
              eq(analyticsSnapshots.tenantId, tenantId),
              eq(analyticsSnapshots.aggregationPeriod, aggregationPeriod),
              gte(analyticsSnapshots.snapshotDate, startDate),
              lte(analyticsSnapshots.snapshotDate, endDate),
            ),
          )
          .orderBy(desc(analyticsSnapshots.snapshotDate));
      } catch (error) {
        logError("ANALYTICS_SNAPSHOTS_RANGE_FAILED", { tenantId, aggregationPeriod }, error);
        throw new Error(`Failed to fetch analytics snapshots: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async updateAnalyticsSnapshot(id, updates) {
      try {
        const [result] = await deps.db
          .update(analyticsSnapshots)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(analyticsSnapshots.id, id))
          .returning();
        return result;
      } catch (error) {
        logError("ANALYTICS_SNAPSHOT_UPDATE_FAILED", { snapshotId: id }, error);
        throw new Error(`Failed to update analytics snapshot: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async deleteAnalyticsSnapshot(id) {
      try {
        await deps.db.delete(analyticsSnapshots).where(eq(analyticsSnapshots.id, id));
      } catch (error) {
        logError("ANALYTICS_SNAPSHOT_DELETE_FAILED", { snapshotId: id }, error);
        throw new Error(`Failed to delete analytics snapshot: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getLatestAnalyticsSnapshot(tenantId, aggregationPeriod) {
      try {
        const [result] = await deps.db
          .select()
          .from(analyticsSnapshots)
          .where(and(eq(analyticsSnapshots.tenantId, tenantId), eq(analyticsSnapshots.aggregationPeriod, aggregationPeriod)))
          .orderBy(desc(analyticsSnapshots.snapshotDate))
          .limit(1);
        return result;
      } catch (error) {
        logError("ANALYTICS_SNAPSHOT_LATEST_FAILED", { tenantId, aggregationPeriod }, error);
        throw new Error(`Failed to fetch latest analytics snapshot: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async createHealingTrend(trend) {
      try {
        const [result] = await deps.db.insert(healingTrends).values(trend).returning();
        return result;
      } catch (error) {
        logError("HEALING_TREND_CREATE_FAILED", { episodeId: trend.episodeId }, error);
        throw new Error(`Failed to create healing trend: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getHealingTrend(id) {
      try {
        const [result] = await deps.db.select().from(healingTrends).where(eq(healingTrends.id, id));
        return result;
      } catch (error) {
        logError("HEALING_TREND_FETCH_FAILED", { trendId: id }, error);
        throw new Error(`Failed to fetch healing trend: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getHealingTrendsByEpisode(episodeId) {
      try {
        return deps.db
          .select()
          .from(healingTrends)
          .where(eq(healingTrends.episodeId, episodeId))
          .orderBy(asc(healingTrends.trendDate));
      } catch (error) {
        logError("HEALING_TRENDS_EPISODE_FAILED", { episodeId }, error);
        throw new Error(`Failed to fetch healing trends: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getHealingTrendsByTenant(tenantId, limit) {
      try {
        let query = deps.db
          .select()
          .from(healingTrends)
          .where(eq(healingTrends.tenantId, tenantId))
          .orderBy(desc(healingTrends.trendDate));

        if (limit) {
          query = query.limit(limit);
        }

        return await query;
      } catch (error) {
        logError("HEALING_TRENDS_TENANT_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch healing trends: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getHealingTrendsByDateRange(tenantId, startDate, endDate) {
      try {
        return deps.db
          .select()
          .from(healingTrends)
          .where(
            and(
              eq(healingTrends.tenantId, tenantId),
              gte(healingTrends.trendDate, startDate),
              lte(healingTrends.trendDate, endDate),
            ),
          )
          .orderBy(asc(healingTrends.trendDate));
      } catch (error) {
        logError("HEALING_TRENDS_RANGE_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch healing trends: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async updateHealingTrend(id, updates) {
      try {
        const [result] = await deps.db
          .update(healingTrends)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(healingTrends.id, id))
          .returning();
        return result;
      } catch (error) {
        logError("HEALING_TREND_UPDATE_FAILED", { trendId: id }, error);
        throw new Error(`Failed to update healing trend: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async deleteHealingTrend(id) {
      try {
        await deps.db.delete(healingTrends).where(eq(healingTrends.id, id));
      } catch (error) {
        logError("HEALING_TREND_DELETE_FAILED", { trendId: id }, error);
        throw new Error(`Failed to delete healing trend: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getHealingTrendsByPatient(patientId) {
      try {
        return deps.db
          .select()
          .from(healingTrends)
          .where(eq(healingTrends.patientId, patientId))
          .orderBy(desc(healingTrends.trendDate));
      } catch (error) {
        logError("HEALING_TRENDS_PATIENT_FAILED", { patientId }, error);
        throw new Error(`Failed to fetch healing trends: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getEpisodeHealingTrajectory(episodeId) {
      try {
        return deps.db
          .select()
          .from(healingTrends)
          .where(eq(healingTrends.episodeId, episodeId))
          .orderBy(asc(healingTrends.trendDate));
      } catch (error) {
        logError("HEALING_TRENDS_TRAJECTORY_FAILED", { episodeId }, error);
        throw new Error(`Failed to fetch healing trajectory: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async createPerformanceMetric(metric) {
      try {
        const [result] = await deps.db.insert(performanceMetrics).values(metric).returning();
        return result;
      } catch (error) {
        logError("PERFORMANCE_METRIC_CREATE_FAILED", { tenantId: metric.tenantId }, error);
        throw new Error(`Failed to create performance metric: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getPerformanceMetric(id) {
      try {
        const [result] = await deps.db.select().from(performanceMetrics).where(eq(performanceMetrics.id, id));
        return result;
      } catch (error) {
        logError("PERFORMANCE_METRIC_FETCH_FAILED", { metricId: id }, error);
        throw new Error(`Failed to fetch performance metric: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getPerformanceMetricsByTenant(tenantId, metricScope, limit) {
      try {
        const conditions = [eq(performanceMetrics.tenantId, tenantId)];

        if (metricScope) {
          conditions.push(eq(performanceMetrics.metricScope, metricScope));
        }

        let query = deps.db
          .select()
          .from(performanceMetrics)
          .where(and(...conditions))
          .orderBy(desc(performanceMetrics.metricDate));

        if (limit) {
          query = query.limit(limit);
        }

        return await query;
      } catch (error) {
        logError("PERFORMANCE_METRICS_TENANT_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch performance metrics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getPerformanceMetricsByProvider(providerId, limit) {
      try {
        let query = deps.db
          .select()
          .from(performanceMetrics)
          .where(eq(performanceMetrics.providerId, providerId))
          .orderBy(desc(performanceMetrics.metricDate));

        if (limit) {
          query = query.limit(limit);
        }

        return await query;
      } catch (error) {
        logError("PERFORMANCE_METRICS_PROVIDER_FAILED", { providerId }, error);
        throw new Error(`Failed to fetch performance metrics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getPerformanceMetricsByDateRange(tenantId, startDate, endDate, metricPeriod) {
      try {
        return deps.db
          .select()
          .from(performanceMetrics)
          .where(
            and(
              eq(performanceMetrics.tenantId, tenantId),
              eq(performanceMetrics.metricPeriod, metricPeriod),
              gte(performanceMetrics.metricDate, startDate),
              lte(performanceMetrics.metricDate, endDate),
            ),
          )
          .orderBy(desc(performanceMetrics.metricDate));
      } catch (error) {
        logError("PERFORMANCE_METRICS_RANGE_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch performance metrics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async updatePerformanceMetric(id, updates) {
      try {
        const [result] = await deps.db
          .update(performanceMetrics)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(performanceMetrics.id, id))
          .returning();
        return result;
      } catch (error) {
        logError("PERFORMANCE_METRIC_UPDATE_FAILED", { metricId: id }, error);
        throw new Error(`Failed to update performance metric: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async deletePerformanceMetric(id) {
      try {
        await deps.db.delete(performanceMetrics).where(eq(performanceMetrics.id, id));
      } catch (error) {
        logError("PERFORMANCE_METRIC_DELETE_FAILED", { metricId: id }, error);
        throw new Error(`Failed to delete performance metric: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getProviderPerformanceComparison(tenantId, metricPeriod, limit) {
      try {
        let query = deps.db
          .select()
          .from(performanceMetrics)
          .where(and(eq(performanceMetrics.tenantId, tenantId), eq(performanceMetrics.metricPeriod, metricPeriod)))
          .orderBy(desc(performanceMetrics.metricDate));

        if (limit) {
          query = query.limit(limit);
        }

        return await query;
      } catch (error) {
        logError("PERFORMANCE_METRIC_COMPARISON_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch provider performance comparison: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getPerformanceTrends(tenantId, metricType, periods) {
      try {
        return deps.db
          .select()
          .from(performanceMetrics)
          .where(and(eq(performanceMetrics.tenantId, tenantId), eq(performanceMetrics.metricType, metricType)))
          .orderBy(desc(performanceMetrics.metricDate))
          .limit(periods);
      } catch (error) {
        logError("PERFORMANCE_METRIC_TRENDS_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch performance trends: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async createCostAnalytic(cost) {
      try {
        const [result] = await deps.db.insert(costAnalytics).values(cost).returning();
        return result;
      } catch (error) {
        logError("COST_ANALYTIC_CREATE_FAILED", { tenantId: cost.tenantId }, error);
        throw new Error(`Failed to create cost analytic: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getCostAnalytic(id) {
      try {
        const [result] = await deps.db.select().from(costAnalytics).where(eq(costAnalytics.id, id));
        return result;
      } catch (error) {
        logError("COST_ANALYTIC_FETCH_FAILED", { costId: id }, error);
        throw new Error(`Failed to fetch cost analytic: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getCostAnalyticsByTenant(tenantId, analysisPeriod, limit) {
      try {
        const conditions = [eq(costAnalytics.tenantId, tenantId)];

        if (analysisPeriod) {
          conditions.push(eq(costAnalytics.analysisPeriod, analysisPeriod));
        }

        let query = deps.db
          .select()
          .from(costAnalytics)
          .where(and(...conditions))
          .orderBy(desc(costAnalytics.analysisDate));

        if (limit) {
          query = query.limit(limit);
        }

        return await query;
      } catch (error) {
        logError("COST_ANALYTICS_TENANT_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch cost analytics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getCostAnalyticsByEpisode(episodeId) {
      try {
        return deps.db
          .select()
          .from(costAnalytics)
          .where(eq(costAnalytics.episodeId, episodeId))
          .orderBy(desc(costAnalytics.analysisDate));
      } catch (error) {
        logError("COST_ANALYTICS_EPISODE_FAILED", { episodeId }, error);
        throw new Error(`Failed to fetch cost analytics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getCostAnalyticsByDateRange(tenantId, startDate, endDate) {
      try {
        return deps.db
          .select()
          .from(costAnalytics)
          .where(
            and(
              eq(costAnalytics.tenantId, tenantId),
              gte(costAnalytics.analysisDate, startDate),
              lte(costAnalytics.analysisDate, endDate),
            ),
          )
          .orderBy(desc(costAnalytics.analysisDate));
      } catch (error) {
        logError("COST_ANALYTICS_RANGE_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch cost analytics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async updateCostAnalytic(id, updates) {
      try {
        const [result] = await deps.db
          .update(costAnalytics)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(costAnalytics.id, id))
          .returning();
        return result;
      } catch (error) {
        logError("COST_ANALYTIC_UPDATE_FAILED", { costId: id }, error);
        throw new Error(`Failed to update cost analytic: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async deleteCostAnalytic(id) {
      try {
        await deps.db.delete(costAnalytics).where(eq(costAnalytics.id, id));
      } catch (error) {
        logError("COST_ANALYTIC_DELETE_FAILED", { costId: id }, error);
        throw new Error(`Failed to delete cost analytic: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getCostAnalyticsByPatient(patientId) {
      try {
        return deps.db
          .select()
          .from(costAnalytics)
          .where(eq(costAnalytics.patientId, patientId))
          .orderBy(desc(costAnalytics.analysisDate));
      } catch (error) {
        logError("COST_ANALYTICS_PATIENT_FAILED", { patientId }, error);
        throw new Error(`Failed to fetch cost analytics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getTenantCostSummary(tenantId, startDate, endDate) {
      try {
        const [result] = await deps.db
          .select({
            totalCosts: sql<number>`COALESCE(SUM(${costAnalytics.totalCost}), 0)`,
            totalReimbursement: sql<number>`COALESCE(SUM(${costAnalytics.totalReimbursement}), 0)`,
            episodeCount: sql<number>`COUNT(DISTINCT ${costAnalytics.episodeId})`,
          })
          .from(costAnalytics)
          .where(
            and(
              eq(costAnalytics.tenantId, tenantId),
              gte(costAnalytics.analysisDate, startDate),
              lte(costAnalytics.analysisDate, endDate),
            ),
          );

        const totals = result || { totalCosts: 0, totalReimbursement: 0, episodeCount: 0 };
        const netMargin = totals.totalReimbursement - totals.totalCosts;
        const averageCostPerEpisode = totals.episodeCount > 0 ? totals.totalCosts / totals.episodeCount : 0;

        return {
          totalCosts: totals.totalCosts,
          totalReimbursement: totals.totalReimbursement,
          netMargin,
          episodeCount: totals.episodeCount,
          averageCostPerEpisode,
        };
      } catch (error) {
        logError("COST_SUMMARY_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch tenant cost summary: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getCostEfficiencyMetrics(tenantId, period) {
      try {
        return deps.db
          .select()
          .from(costAnalytics)
          .where(and(eq(costAnalytics.tenantId, tenantId), eq(costAnalytics.analysisPeriod, period)))
          .orderBy(desc(costAnalytics.analysisDate));
      } catch (error) {
        logError("COST_EFFICIENCY_FAILED", { tenantId, period }, error);
        throw new Error(`Failed to fetch cost efficiency metrics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async createComplianceTracking(compliance) {
      try {
        const [result] = await deps.db.insert(complianceTracking).values(compliance).returning();
        return result;
      } catch (error) {
        logError("COMPLIANCE_CREATE_FAILED", { tenantId: compliance.tenantId }, error);
        throw new Error(`Failed to create compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getComplianceTracking(id) {
      try {
        const [result] = await deps.db.select().from(complianceTracking).where(eq(complianceTracking.id, id));
        return result;
      } catch (error) {
        logError("COMPLIANCE_FETCH_FAILED", { complianceId: id }, error);
        throw new Error(`Failed to fetch compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getComplianceTrackingByTenant(tenantId, assessmentType, limit) {
      try {
        const conditions = [eq(complianceTracking.tenantId, tenantId)];

        if (assessmentType) {
          conditions.push(eq(complianceTracking.assessmentType, assessmentType));
        }

        let query = deps.db
          .select()
          .from(complianceTracking)
          .where(and(...conditions))
          .orderBy(desc(complianceTracking.assessedAt));

        if (limit) {
          query = query.limit(limit);
        }

        return await query;
      } catch (error) {
        logError("COMPLIANCE_TENANT_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getComplianceTrackingByEpisode(episodeId) {
      try {
        return deps.db
          .select()
          .from(complianceTracking)
          .where(eq(complianceTracking.episodeId, episodeId))
          .orderBy(desc(complianceTracking.assessedAt));
      } catch (error) {
        logError("COMPLIANCE_EPISODE_FAILED", { episodeId }, error);
        throw new Error(`Failed to fetch compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getComplianceTrackingByDateRange(tenantId, startDate, endDate) {
      try {
        return deps.db
          .select()
          .from(complianceTracking)
          .where(
            and(
              eq(complianceTracking.tenantId, tenantId),
              gte(complianceTracking.assessedAt, startDate),
              lte(complianceTracking.assessedAt, endDate),
            ),
          )
          .orderBy(desc(complianceTracking.assessedAt));
      } catch (error) {
        logError("COMPLIANCE_RANGE_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async updateComplianceTracking(id, updates) {
      try {
        const [result] = await deps.db
          .update(complianceTracking)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(complianceTracking.id, id))
          .returning();
        return result;
      } catch (error) {
        logError("COMPLIANCE_UPDATE_FAILED", { complianceId: id }, error);
        throw new Error(`Failed to update compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async deleteComplianceTracking(id) {
      try {
        await deps.db.delete(complianceTracking).where(eq(complianceTracking.id, id));
      } catch (error) {
        logError("COMPLIANCE_DELETE_FAILED", { complianceId: id }, error);
        throw new Error(`Failed to delete compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getComplianceTrackingByEligibilityCheck(eligibilityCheckId) {
      try {
        return deps.db
          .select()
          .from(complianceTracking)
          .where(eq(complianceTracking.eligibilityCheckId, eligibilityCheckId))
          .orderBy(desc(complianceTracking.assessedAt));
      } catch (error) {
        logError("COMPLIANCE_ELIGIBILITY_FAILED", { eligibilityCheckId }, error);
        throw new Error(`Failed to fetch compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getTenantComplianceSummary(tenantId, startDate, endDate) {
      try {
        const [result] = await deps.db
          .select({
            overallComplianceRate: sql<number>`COALESCE(AVG(${complianceTracking.overallComplianceScore}), 0)`,
            medicareComplianceRate: sql<number>`COALESCE(AVG(${complianceTracking.medicareComplianceScore}), 0)`,
            criticalViolations: sql<number>`COALESCE(SUM(${complianceTracking.criticalViolations}), 0)`,
            minorViolations: sql<number>`COALESCE(SUM(${complianceTracking.minorViolations}), 0)`,
            assessmentCount: sql<number>`COUNT(*)`,
          })
          .from(complianceTracking)
          .where(
            and(
              eq(complianceTracking.tenantId, tenantId),
              gte(complianceTracking.assessedAt, startDate),
              lte(complianceTracking.assessedAt, endDate),
            ),
          );

        return {
          overallComplianceRate: Number(result?.overallComplianceRate || 0),
          medicareComplianceRate: Number(result?.medicareComplianceRate || 0),
          criticalViolations: Number(result?.criticalViolations || 0),
          minorViolations: Number(result?.minorViolations || 0),
          assessmentCount: Number(result?.assessmentCount || 0),
        };
      } catch (error) {
        logError("COMPLIANCE_SUMMARY_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch compliance summary: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getComplianceRiskAnalysis(tenantId) {
      try {
        return deps.db
          .select()
          .from(complianceTracking)
          .where(eq(complianceTracking.tenantId, tenantId))
          .orderBy(desc(complianceTracking.assessedAt));
      } catch (error) {
        logError("COMPLIANCE_RISK_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch compliance risk analysis: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async calculateTenantAnalyticsSnapshot(tenantId, snapshotDate, aggregationPeriod) {
      try {
        const [encounterMetrics] = await deps.db
          .select({
            totalEncounters: sql<number>`COUNT(*)`,
            uniquePatients: sql<number>`COUNT(DISTINCT ${encounters.patientId})`,
          })
          .from(encounters)
          .where(eq(encounters.tenantId, tenantId));

        const [eligibilityMetrics] = await deps.db
          .select({
            totalEligibilityChecks: sql<number>`COUNT(*)`,
            passedDiagnosisValidation: sql<number>`SUM(CASE WHEN ${eligibilityChecks.diagnosisValidationStatus} = 'passed' THEN 1 ELSE 0 END)`,
            avgDiagnosisScore: sql<number>`AVG(${eligibilityChecks.diagnosisValidationScore})`,
            avgNecessityScore: sql<number>`AVG(${eligibilityChecks.clinicalNecessityScore})`,
            avgComplexityScore: sql<number>`AVG(${eligibilityChecks.complexityScore})`,
          })
          .from(eligibilityChecks)
          .where(eq(eligibilityChecks.tenantId, tenantId));

        const snapshot: InsertAnalyticsSnapshot = {
          tenantId,
          snapshotDate,
          aggregationPeriod,
          totalEncounters: Number(encounterMetrics?.totalEncounters || 0),
          totalPatients: Number(encounterMetrics?.uniquePatients || 0),
          totalEligibilityChecks: Number(eligibilityMetrics?.totalEligibilityChecks || 0),
          passedDiagnosisValidation: Number(eligibilityMetrics?.passedDiagnosisValidation || 0),
          averageDiagnosisValidationScore: eligibilityMetrics?.avgDiagnosisScore?.toString(),
          averageClinicalNecessityScore: eligibilityMetrics?.avgNecessityScore?.toString(),
          averageComplexityScore: eligibilityMetrics?.avgComplexityScore?.toString(),
          calculationVersion: "1.0",
          calculatedAt: new Date(),
        };

        return context.createAnalyticsSnapshot(snapshot);
      } catch (error) {
        logError("ANALYTICS_CALCULATION_FAILED", { tenantId }, error);
        throw new Error(`Failed to calculate tenant analytics snapshot: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async calculateEpisodeHealingTrends(episodeId) {
      try {
        const episode = await deps.db
          .select()
          .from(episodes)
          .where(eq(episodes.id, episodeId))
          .limit(1);

        if (!episode.length) {
          throw new Error(`Episode not found: ${episodeId}`);
        }

        const episodeEncounters = await deps.db
          .select()
          .from(encounters)
          .where(eq(encounters.episodeId, episodeId))
          .orderBy(asc(encounters.date));

        const trends: HealingTrend[] = [];
        let baselineWoundArea: number | null = null;

        for (const encounter of episodeEncounters) {
          const encounterDate = new Date(encounter.date);
          const daysSinceStart = Math.floor(
            (encounterDate.getTime() - new Date(episode[0].episodeStartDate).getTime()) / (1000 * 60 * 60 * 24),
          );
          const weekNumber = Math.floor(daysSinceStart / 7) + 1;

          const woundDetails = encounter.woundDetails as any;
          let currentWoundArea: number | null = null;

          if (woundDetails?.currentMeasurement?.area) {
            currentWoundArea = woundDetails.currentMeasurement.area;
            if (baselineWoundArea === null) {
              baselineWoundArea = currentWoundArea;
            }
          }

          let areaReductionFromBaseline: number | null = null;
          let healingVelocity: number | null = null;

          if (baselineWoundArea && currentWoundArea) {
            areaReductionFromBaseline = ((baselineWoundArea - currentWoundArea) / baselineWoundArea) * 100;
            if (daysSinceStart > 0) {
              healingVelocity = (baselineWoundArea - currentWoundArea) / daysSinceStart;
            }
          }

          const trend: InsertHealingTrend = {
            tenantId: episode[0].patientId,
            episodeId,
            patientId: episode[0].patientId,
            trendDate: encounterDate,
            daysSinceEpisodeStart: daysSinceStart,
            weekNumber,
            currentWoundArea: currentWoundArea?.toString(),
            baselineWoundArea: baselineWoundArea?.toString(),
            areaReductionFromBaseline: areaReductionFromBaseline?.toString(),
            healingVelocity: healingVelocity?.toString(),
            meetsTwentyPercentReduction: areaReductionFromBaseline ? areaReductionFromBaseline >= 20 : false,
            woundCondition: woundDetails?.woundCondition || "stable",
            calculatedAt: new Date(),
          };

          const createdTrend = await context.createHealingTrend(trend);
          trends.push(createdTrend);
        }

        return trends;
      } catch (error) {
        logError("HEALING_TRENDS_CALCULATION_FAILED", { episodeId }, error);
        throw new Error(`Failed to calculate episode healing trends: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async calculateProviderPerformanceMetrics(providerId, metricDate, metricPeriod) {
      try {
        const providerTenants = await deps.db
          .select()
          .from(tenantUsers)
          .where(eq(tenantUsers.userId, providerId))
          .limit(1);

        if (!providerTenants.length) {
          throw new Error(`Provider not found in any tenant: ${providerId}`);
        }

        const tenantId = providerTenants[0].tenantId;

        let startDate: Date;
        let endDate: Date;

        switch (metricPeriod) {
          case "daily":
            startDate = new Date(metricDate);
            endDate = new Date(metricDate);
            break;
          case "weekly":
            startDate = new Date(metricDate);
            startDate.setDate(startDate.getDate() - startDate.getDay());
            endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 6);
            break;
          case "monthly":
            startDate = new Date(metricDate.getFullYear(), metricDate.getMonth(), 1);
            endDate = new Date(metricDate.getFullYear(), metricDate.getMonth() + 1, 0);
            break;
          default:
            throw new Error(`Unsupported metric period: ${metricPeriod}`);
        }

        const [encounterMetrics] = await deps.db
          .select({
            totalEncounters: sql<number>`COUNT(*)`,
            uniquePatients: sql<number>`COUNT(DISTINCT ${encounters.patientId})`,
          })
          .from(encounters)
          .where(
            and(
              eq(encounters.tenantId, tenantId),
              gte(encounters.date, startDate),
              lte(encounters.date, endDate),
            ),
          );

        const metric: InsertPerformanceMetric = {
          tenantId,
          providerId,
          metricType: "encounter_volume",
          metricScope: "provider",
          metricPeriod,
          metricDate,
          metricValue: Number(encounterMetrics?.totalEncounters || 0),
          comparisonValue: Number(encounterMetrics?.uniquePatients || 0),
          calculatedAt: new Date(),
        };

        return context.createPerformanceMetric(metric);
      } catch (error) {
        logError("PERFORMANCE_CALCULATION_FAILED", { providerId }, error);
        throw new Error(`Failed to calculate provider performance metrics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async calculateEpisodeCostAnalytics(episodeId) {
      try {
        const episodeResult = await deps.db
          .select()
          .from(episodes)
          .where(eq(episodes.id, episodeId))
          .limit(1);

        const episode = episodeResult[0];
        if (!episode) {
          throw new Error(`Episode not found: ${episodeId}`);
        }

        const episodeEncounters = await deps.db
          .select()
          .from(encounters)
          .where(eq(encounters.episodeId, episodeId));

        const totalEncounters = episodeEncounters.length;
        const estimatedLaborCostPerEncounter = 150;
        const totalLaborCosts = totalEncounters * estimatedLaborCostPerEncounter;

        const episodeStartDate = new Date(episode.episodeStartDate);
        const episodeEndDate = episode.episodeEndDate ? new Date(episode.episodeEndDate) : new Date();

        const analytic: InsertCostAnalytic = {
          tenantId: episode.patientId,
          episodeId,
          patientId: episode.patientId,
          analysisDate: new Date(),
          analysisPeriod: "episode",
          costPeriodStart: episodeStartDate,
          costPeriodEnd: episodeEndDate,
          laborCosts: totalLaborCosts.toString(),
          totalDirectCosts: totalLaborCosts.toString(),
          totalCosts: totalLaborCosts.toString(),
          encounterCount: totalEncounters,
          calculationMethod: "standard",
          calculationVersion: "1.0",
          calculatedAt: new Date(),
        };

        return context.createCostAnalytic(analytic);
      } catch (error) {
        logError("COST_ANALYTICS_CALCULATION_FAILED", { episodeId }, error);
        throw new Error(`Failed to calculate episode cost analytics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async assessEpisodeCompliance(episodeId) {
      try {
        const episodeResult = await deps.db
          .select()
          .from(episodes)
          .where(eq(episodes.id, episodeId))
          .limit(1);

        const episode = episodeResult[0];
        if (!episode) {
          throw new Error(`Episode not found: ${episodeId}`);
        }

        const episodeEncounters = await deps.db
          .select()
          .from(encounters)
          .where(eq(encounters.episodeId, episodeId));

        const hasBaseline = episodeEncounters.some((encounter) => {
          const woundDetails = encounter.woundDetails as any;
          return woundDetails?.baselineMeasurement;
        });

        const hasFourWeekMeasurement = episodeEncounters.length >= 2;
        const hasDocumentation = episodeEncounters.every((enc) => enc.encryptedNotes);

        let overallScore = 0;
        if (hasBaseline) overallScore += 30;
        if (hasFourWeekMeasurement) overallScore += 30;
        if (hasDocumentation) overallScore += 40;

        const compliance: InsertComplianceTracking = {
          tenantId: episode.patientId,
          episodeId,
          patientId: episode.patientId,
          assessmentDate: new Date(),
          assessmentType: "episode",
          complianceScope: "medicare_lcd",
          medicareRequirements: {
            baseline_measurement: true,
            four_week_measurement: true,
            documentation: true,
          },
          metRequirements: {
            baseline_measurement: hasBaseline,
            four_week_measurement: hasFourWeekMeasurement,
            documentation: hasDocumentation,
          },
          unmetRequirements: {
            baseline_measurement: !hasBaseline,
            four_week_measurement: !hasFourWeekMeasurement,
            documentation: !hasDocumentation,
          },
          documentationCompliance: hasDocumentation,
          measurementCompliance: hasBaseline && hasFourWeekMeasurement,
          overallComplianceScore: overallScore,
          reviewStatus: "pending",
          assessmentVersion: "1.0",
          calculatedAt: new Date(),
        };

        return context.createComplianceTracking(compliance);
      } catch (error) {
        logError("COMPLIANCE_ASSESSMENT_FAILED", { episodeId }, error);
        throw new Error(`Failed to assess episode compliance: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async bulkCreateAnalyticsSnapshots(snapshots) {
      try {
        const results = await deps.db.insert(analyticsSnapshots).values(snapshots).returning();
        return results;
      } catch (error) {
        logError("ANALYTICS_SNAPSHOT_BULK_CREATE_FAILED", { count: snapshots.length }, error);
        throw new Error(`Failed to bulk create analytics snapshots: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async bulkCreateHealingTrends(trends) {
      try {
        const results = await deps.db.insert(healingTrends).values(trends).returning();
        return results;
      } catch (error) {
        logError("HEALING_TRENDS_BULK_CREATE_FAILED", { count: trends.length }, error);
        throw new Error(`Failed to bulk create healing trends: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async bulkCreatePerformanceMetrics(metrics) {
      try {
        const results = await deps.db.insert(performanceMetrics).values(metrics).returning();
        return results;
      } catch (error) {
        logError("PERFORMANCE_METRICS_BULK_CREATE_FAILED", { count: metrics.length }, error);
        throw new Error(`Failed to bulk create performance metrics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async bulkCreateCostAnalytics(costs) {
      try {
        const results = await deps.db.insert(costAnalytics).values(costs).returning();
        return results;
      } catch (error) {
        logError("COST_ANALYTICS_BULK_CREATE_FAILED", { count: costs.length }, error);
        throw new Error(`Failed to bulk create cost analytics: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async bulkCreateComplianceTracking(compliance) {
      try {
        const results = await deps.db.insert(complianceTracking).values(compliance).returning();
        return results;
      } catch (error) {
        logError("COMPLIANCE_BULK_CREATE_FAILED", { count: compliance.length }, error);
        throw new Error(`Failed to bulk create compliance tracking: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getTenantAnalyticsDashboard(tenantId, period) {
      try {
        const [currentMetrics, healingTrends, performanceMetrics, costSummary, complianceStatus] = await Promise.all([
          context.getLatestAnalyticsSnapshot(tenantId, period),
          context.getHealingTrendsByTenant(tenantId, 30),
          context.getPerformanceMetricsByTenant(tenantId, undefined, 20),
          context.getCostAnalyticsByTenant(tenantId, period, 15),
          context.getComplianceTrackingByTenant(tenantId, undefined, 20),
        ]);

        return {
          currentMetrics,
          healingTrends,
          performanceMetrics,
          costSummary,
          complianceStatus,
        };
      } catch (error) {
        logError("ANALYTICS_DASHBOARD_FAILED", { tenantId }, error);
        throw new Error(`Failed to fetch tenant analytics dashboard: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },

    async getProviderAnalyticsDashboard(providerId, tenantId, period) {
      try {
        const [performanceMetrics, healingOutcomes, costEfficiency, complianceRecord] = await Promise.all([
          context.getPerformanceMetricsByProvider(providerId, 20),
          context.getHealingTrendsByTenant(tenantId, 30),
          context.getCostAnalyticsByTenant(tenantId, period, 15),
          context.getComplianceTrackingByTenant(tenantId, undefined, 20),
        ]);

        return {
          performanceMetrics,
          healingOutcomes,
          costEfficiency,
          complianceRecord,
        };
      } catch (error) {
        logError("PROVIDER_ANALYTICS_DASHBOARD_FAILED", { providerId, tenantId }, error);
        throw new Error(`Failed to fetch provider analytics dashboard: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
  };

  return context;
}
