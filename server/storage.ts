import {
  users,
  tenants,
  tenantUsers,
  patients,
  encounters,
  episodes,
  policySources,
  eligibilityChecks,
  documents,
  documentVersions,
  documentApprovals,
  documentSignatures,
  recentActivities,
  auditLogs,
  fileUploads,
  pdfExtractedData,
  products,
  productLcdCoverage,
  productApplications,
  analyticsSnapshots,
  healingTrends,
  performanceMetrics,
  costAnalytics,
  complianceTracking,
  type User,
  type UpsertUser,
  type InsertTenant,
  type Tenant,
  type InsertTenantUser,
  type TenantUser,
  type InsertPatient,
  type Patient,
  type InsertEncounter,
  type Encounter,
  type InsertEpisode,
  type Episode,
  type InsertPolicySource,
  type PolicySource,
  type InsertEligibilityCheck,
  type EligibilityCheck,
  type InsertDocument,
  type Document,
  type InsertDocumentVersion,
  type DocumentVersion,
  type InsertDocumentApproval,
  type DocumentApproval,
  type InsertDocumentSignature,
  type DocumentSignature,
  type InsertRecentActivity,
  type RecentActivity,
  type InsertAuditLog,
  type AuditLog,
  type InsertFileUpload,
  type FileUpload,
  type InsertPdfExtractedData,
  type PdfExtractedData,
  type EpisodeWithFullHistory,
  type Product,
  type ProductLcdCoverage,
  type InsertProductApplication,
  type ProductApplication,
  type InsertAnalyticsSnapshot,
  type AnalyticsSnapshot,
  type InsertHealingTrend,
  type HealingTrend,
  type InsertPerformanceMetric,
  type PerformanceMetric,
  type InsertCostAnalytic,
  type CostAnalytic,
  type InsertComplianceTracking,
  type ComplianceTracking,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, or, lte, gte, sql, inArray } from "drizzle-orm";
import { createPatientContext, type PatientContext } from "./storage/patients";
import { createDocumentContext, type DocumentContext } from "./storage/documents";
import { createAnalyticsContext, type AnalyticsContext } from "./storage/analytics";
import { createAuditContext, type AuditContext } from "./storage/audit";
import { defaultStorageDependencies, type StorageDependencies } from "./storage/dependencies";

// Interface for storage operations
export interface IStorage {
  // User operations (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Tenant operations
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantsByUser(userId: string): Promise<Tenant[]>;
  
  // Tenant User operations
  addUserToTenant(tenantUser: InsertTenantUser): Promise<TenantUser>;
  getUserTenantRole(userId: string, tenantId: string): Promise<TenantUser | undefined>;
  
  // Patient operations
  createPatient(patient: InsertPatient): Promise<Patient>;
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientsByTenant(tenantId: string): Promise<Patient[]>;
  updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient>;
  getPatientByMrnAndTenant(mrn: string, tenantId: string): Promise<Patient | undefined>;
  checkPatientDuplicate(mrn: string, tenantId: string): Promise<boolean>;
  
  // Encounter operations
  createEncounter(encounter: InsertEncounter): Promise<Encounter>;
  getEncounter(id: string): Promise<Encounter | undefined>;
  getEncountersByPatient(patientId: string): Promise<Encounter[]>;
  updateEncounter(id: string, encounter: Partial<InsertEncounter>): Promise<Encounter>;
  getEncounterByPatientAndDate(patientId: string, encounterDate: string): Promise<Encounter | undefined>;
  checkEncounterDuplicate(patientId: string, date: Date): Promise<boolean>;
  
  // Episode operations
  createEpisode(episode: InsertEpisode): Promise<Episode>;
  getEpisode(id: string): Promise<Episode | undefined>;
  getEpisodesByPatient(patientId: string): Promise<Episode[]>;
  updateEpisode(id: string, episode: Partial<InsertEpisode>): Promise<Episode>;
  deleteEpisode(id: string): Promise<void>;
  getEncountersByEpisode(episodeId: string): Promise<Encounter[]>;
  getEligibilityChecksByEpisode(episodeId: string): Promise<EligibilityCheck[]>;
  getDocumentsByEpisode(episodeId: string): Promise<Document[]>;
  
  // Policy operations
  createPolicySource(policy: InsertPolicySource): Promise<PolicySource>;
  getPolicySource(id: string): Promise<PolicySource | undefined>;
  getPolicySourcesByMAC(mac: string): Promise<PolicySource[]>;
  getActivePolicySourcesByMAC(mac: string): Promise<PolicySource[]>;
  getPolicySourceByLCD(lcdId: string): Promise<PolicySource[]>;
  getAllPolicySources(): Promise<PolicySource[]>;
  updatePolicySource(id: string, policy: Partial<InsertPolicySource>): Promise<PolicySource>;
  updatePolicySourceStatus(id: string, status: string): Promise<PolicySource>;
  
  // Enhanced policy operations for time-aware status management
  getCurrentAndFuturePoliciesByMAC(mac: string, daysAhead?: number): Promise<PolicySource[]>;
  getPoliciesByStatus(mac: string, status: string[]): Promise<PolicySource[]>;
  updatePolicyStatusBasedOnDates(): Promise<{ updated: number; superseded: number }>;
  supersedePolicyByLCD(lcdId: string, supersededBy: string): Promise<PolicySource[]>;
  
  // Eligibility operations
  createEligibilityCheck(check: InsertEligibilityCheck): Promise<EligibilityCheck>;
  getEligibilityCheck(id: string): Promise<EligibilityCheck | undefined>;
  getEligibilityChecksByEncounter(encounterId: string): Promise<EligibilityCheck[]>;
  updateEligibilityCheck(id: string, updates: Partial<InsertEligibilityCheck>): Promise<EligibilityCheck>;
  getRecentEligibilityChecksByTenant(tenantId: string, limit?: number): Promise<Array<EligibilityCheck & { patientName: string; encounterId: string; encounterDate: string }>>;
  
  // Enhanced patient history analysis operations
  getPatientEligibilityHistory(patientId: string): Promise<EligibilityCheck[]>;
  getEpisodeWithEnrichedHistory(episodeId: string): Promise<EpisodeWithFullHistory>;
  getPatientEpisodesWithHistory(patientId: string): Promise<EpisodeWithFullHistory[]>;
  
  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentsByPatient(patientId: string): Promise<Document[]>;
  updateDocument(id: string, document: Partial<Document>): Promise<Document>;
  
  // Document Version Control operations
  createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion>;
  getDocumentVersions(documentId: string): Promise<DocumentVersion[]>;
  getDocumentVersion(versionId: string): Promise<DocumentVersion | undefined>;
  getCurrentDocumentVersion(documentId: string): Promise<DocumentVersion | undefined>;
  
  // Document Approval operations
  createDocumentApproval(approval: InsertDocumentApproval): Promise<DocumentApproval>;
  getDocumentApprovals(documentId: string): Promise<DocumentApproval[]>;
  getDocumentApproval(approvalId: string): Promise<DocumentApproval | undefined>;
  updateDocumentApproval(approvalId: string, updates: Partial<DocumentApproval>): Promise<DocumentApproval>;
  processDocumentApproval(approvalId: string, updates: {
    status: 'approved' | 'rejected';
    comments?: string;
    approverUserId: string;
    tenantId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<DocumentApproval>;
  getPendingApprovals(userId: string, tenantId: string, role?: string): Promise<DocumentApproval[]>;
  
  // Electronic Signature operations
  createDocumentSignature(signature: InsertDocumentSignature): Promise<DocumentSignature>;
  getDocumentSignatures(documentId: string): Promise<DocumentSignature[]>;
  getDocumentSignature(signatureId: string): Promise<DocumentSignature | undefined>;
  
  // Recent Activity operations
  createRecentActivity(activity: InsertRecentActivity): Promise<RecentActivity>;
  getRecentActivitiesByTenant(tenantId: string, limit?: number): Promise<RecentActivity[]>;
  
  // Audit operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsByTenant(tenantId: string, limit?: number): Promise<AuditLog[]>;
  
  // File Upload operations
  createFileUpload(upload: InsertFileUpload): Promise<FileUpload>;
  getFileUpload(id: string): Promise<FileUpload | undefined>;
  getFileUploadsByTenant(tenantId: string): Promise<FileUpload[]>;
  getFileUploadsWithExtractionDataByTenant(tenantId: string): Promise<Array<FileUpload & { extractionData?: PdfExtractedData }>>;
  updateFileUploadStatus(id: string, status: string, processingError?: string): Promise<FileUpload>;
  updateFileUploadText(id: string, extractedText: string): Promise<FileUpload>;
  
  // PDF Extracted Data operations
  createPdfExtractedData(data: InsertPdfExtractedData): Promise<PdfExtractedData>;
  getPdfExtractedData(id: string): Promise<PdfExtractedData | undefined>;
  getPdfExtractedDataByFileUpload(fileUploadId: string): Promise<PdfExtractedData | undefined>;
  getPdfExtractedDataByUploadId(uploadId: string): Promise<PdfExtractedData | undefined>; // Alias for compatibility
  getPdfExtractedDataByTenant(tenantId: string): Promise<PdfExtractedData[]>;
  updatePdfExtractedDataValidation(id: string, status: string, reviewedBy: string, comments?: string): Promise<PdfExtractedData>;
  updatePdfExtractedData(id: string, data: Partial<InsertPdfExtractedData>): Promise<PdfExtractedData>;
  linkPdfExtractedDataToRecords(id: string, patientId?: string, encounterId?: string): Promise<PdfExtractedData>;
  
  // Enhanced eligibility check operations for policy selection tracking  
  updateEligibilityCheck(id: string, updates: { selectedPolicyId?: string; selectionAudit?: any; } & Partial<InsertEligibilityCheck>): Promise<EligibilityCheck>;
  
  // Bulk operations for performance optimization
  getAllEncountersWithPatientsByTenant(tenantId: string): Promise<Array<Encounter & { patientName: string; patientId: string; patient: { id: string; firstName: string; lastName: string; mrn: string; _decryptionFailed?: boolean }; }>>;
  getAllEpisodesWithPatientsByTenant(tenantId: string): Promise<Array<Episode & { patientName: string; patientId: string; encounterCount: number; }>>;

  // ===============================================================================
  // PHASE 5.1: DIAGNOSIS VALIDATION STORAGE OPERATIONS
  // ===============================================================================
  
  // Update eligibility check with diagnosis validation results
  updateEligibilityCheckWithDiagnosisValidation(
    checkId: string,
    diagnosisValidationData: {
      primaryDiagnosis: string;
      secondaryDiagnoses?: string[];
      diagnosisValidationResult?: any;
      diagnosisValidationScore?: number;
      diagnosisValidationStatus?: string;
      clinicalNecessityResult?: any;
      clinicalNecessityScore?: number;
      clinicalNecessityLevel?: string;
      woundTypeMappingResult?: any;
      mappedWoundType?: string;
      woundMappingConfidence?: number;
      diagnosisComplexityResult?: any;
      complexityScore?: number;
      complexityLevel?: string;
      diagnosisRecommendationsResult?: any;
      recommendationsCount?: number;
      criticalRecommendationsCount?: number;
      overallDiagnosisScore?: number;
      diagnosisValidationTimestamp?: Date;
      diagnosisValidationVersion?: string;
      validationAuditTrail?: any;
    }
  ): Promise<EligibilityCheck>;

  // Get eligibility checks with diagnosis validation results
  getEligibilityChecksWithDiagnosisValidation(encounterId: string): Promise<EligibilityCheck[]>;
  
  // Get diagnosis validation results by various criteria
  getDiagnosisValidationsByTenant(tenantId: string, limit?: number): Promise<Array<EligibilityCheck & { patientName: string; encounterDate: string }>>;
  getDiagnosisValidationsByPatient(patientId: string): Promise<EligibilityCheck[]>;
  getDiagnosisValidationsByComplexityLevel(tenantId: string, complexityLevel: string): Promise<EligibilityCheck[]>;
  getDiagnosisValidationsByNecessityLevel(tenantId: string, necessityLevel: string): Promise<EligibilityCheck[]>;
  
  // Get failed or warning diagnosis validations for review
  getFailedDiagnosisValidations(tenantId: string): Promise<EligibilityCheck[]>;
  getDiagnosisValidationsWithCriticalRecommendations(tenantId: string): Promise<EligibilityCheck[]>;
  
  // Analytics and reporting methods
  getDiagnosisValidationMetrics(tenantId: string, dateRange?: { start: Date; end: Date }): Promise<{
    totalValidations: number;
    passedValidations: number;
    failedValidations: number;
    averageValidationScore: number;
    averageComplexityScore: number;
    averageNecessityScore: number;
    complexityDistribution: Record<string, number>;
    necessityDistribution: Record<string, number>;
    commonRecommendations: Array<{ recommendation: string; count: number }>;
  }>;

  // ===============================================================================
  // PHASE 3.2: PRODUCT APPLICATION WORKFLOW STORAGE OPERATIONS
  // ===============================================================================
  
  // Product Catalog operations
  searchProducts(filters: {
    category?: string;
    woundTypes?: string[];
    hcpcsCode?: string;
    manufacturerName?: string;
    isActive?: boolean;
    clinicalEvidenceLevel?: string;
  }): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  getProductsByHcpcs(hcpcsCode: string): Promise<Product[]>;
  getProductsByWoundType(woundType: string): Promise<Product[]>;
  getProductsByManufacturer(manufacturerName: string): Promise<Product[]>;
  
  // Product LCD Coverage operations
  getProductLcdCoverage(productId: string, macRegion: string): Promise<ProductLcdCoverage | undefined>;
  getActiveLcdCoverageByProduct(productId: string, macRegion: string): Promise<ProductLcdCoverage[]>;
  validateProductCoverage(
    productId: string,
    episodeId: string,
    applicationData: {
      woundSize?: number;
      woundDepth?: number;
      diagnosisCodes: string[];
      conservativeCareCompliance?: boolean;
      conservativeCareDays?: number;
    }
  ): Promise<{
    isCovered: boolean;
    coverageLevel: string;
    violations: string[];
    warnings: string[];
    requirements: string[];
    priorAuthRequired: boolean;
    maxReimbursableAmount?: number;
  }>;
  
  // Product Application operations  
  createProductApplication(application: InsertProductApplication): Promise<ProductApplication>;
  getProductApplication(id: string): Promise<ProductApplication | undefined>;
  getProductApplicationsByEpisode(episodeId: string): Promise<ProductApplication[]>;
  getProductApplicationsByPatient(patientId: string): Promise<ProductApplication[]>;
  updateProductApplication(id: string, updates: Partial<InsertProductApplication>): Promise<ProductApplication>;
  
  // Product frequency validation
  validateProductApplicationFrequency(
    productId: string,
    patientId: string,
    episodeId: string,
    applicationDate: Date
  ): Promise<{
    isValid: boolean;
    violations: string[];
    lastApplicationDate?: Date;
    daysSinceLastApplication?: number;
    applicationsThisEpisode: number;
    applicationsThisMonth: number;
    applicationsThisYear: number;
    maxAllowed: {
      perEpisode?: number;
      perMonth?: number;
      perYear?: number;
      minDaysBetween?: number;
    };
  }>;
  
  // Clinical Decision Support
  getProductRecommendations(
    woundType: string,
    woundSize: number,
    diagnosisCodes: string[],
    patientFactors?: {
      age?: number;
      diabetic?: boolean;
      immunocompromised?: boolean;
      previousProducts?: string[];
    }
  ): Promise<Array<{
    product: Product;
    coverageInfo: ProductLcdCoverage | null;
    recommendationScore: number;
    reasons: string[];
    contraindications: string[];
    clinicalEvidence: string;
    successRate: number;
    costEffectiveness: number;
  }>>;
  
  // Conservative Care Integration
  checkConservativeCareCompliance(episodeId: string, requiredDays: number): Promise<{
    isCompliant: boolean;
    daysCompleted: number;
    missingTreatments: string[];
    compliancePercentage: number;
    eligibleDate?: Date;
  }>;

  // ===============================================================================
  // ANALYTICS OPERATIONS - PHASE 5.2: CLINICAL METRICS & PERFORMANCE TRACKING
  // ===============================================================================

  // Analytics Snapshots operations
  createAnalyticsSnapshot(snapshot: InsertAnalyticsSnapshot): Promise<AnalyticsSnapshot>;
  getAnalyticsSnapshot(id: string): Promise<AnalyticsSnapshot | undefined>;
  getAnalyticsSnapshotsByTenant(tenantId: string, aggregationPeriod?: string, limit?: number): Promise<AnalyticsSnapshot[]>;
  getAnalyticsSnapshotsByDateRange(tenantId: string, startDate: Date, endDate: Date, aggregationPeriod: string): Promise<AnalyticsSnapshot[]>;
  updateAnalyticsSnapshot(id: string, updates: Partial<InsertAnalyticsSnapshot>): Promise<AnalyticsSnapshot>;
  deleteAnalyticsSnapshot(id: string): Promise<void>;
  getLatestAnalyticsSnapshot(tenantId: string, aggregationPeriod: string): Promise<AnalyticsSnapshot | undefined>;

  // Healing Trends operations
  createHealingTrend(trend: InsertHealingTrend): Promise<HealingTrend>;
  getHealingTrend(id: string): Promise<HealingTrend | undefined>;
  getHealingTrendsByEpisode(episodeId: string): Promise<HealingTrend[]>;
  getHealingTrendsByTenant(tenantId: string, limit?: number): Promise<HealingTrend[]>;
  getHealingTrendsByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<HealingTrend[]>;
  updateHealingTrend(id: string, updates: Partial<InsertHealingTrend>): Promise<HealingTrend>;
  deleteHealingTrend(id: string): Promise<void>;
  getHealingTrendsByPatient(patientId: string): Promise<HealingTrend[]>;
  getEpisodeHealingTrajectory(episodeId: string): Promise<HealingTrend[]>;

  // Performance Metrics operations
  createPerformanceMetric(metric: InsertPerformanceMetric): Promise<PerformanceMetric>;
  getPerformanceMetric(id: string): Promise<PerformanceMetric | undefined>;
  getPerformanceMetricsByTenant(tenantId: string, metricScope?: string, limit?: number): Promise<PerformanceMetric[]>;
  getPerformanceMetricsByProvider(providerId: string, limit?: number): Promise<PerformanceMetric[]>;
  getPerformanceMetricsByDateRange(tenantId: string, startDate: Date, endDate: Date, metricPeriod: string): Promise<PerformanceMetric[]>;
  updatePerformanceMetric(id: string, updates: Partial<InsertPerformanceMetric>): Promise<PerformanceMetric>;
  deletePerformanceMetric(id: string): Promise<void>;
  getProviderPerformanceComparison(tenantId: string, metricPeriod: string, limit?: number): Promise<PerformanceMetric[]>;
  getPerformanceTrends(tenantId: string, metricType: string, periods: number): Promise<PerformanceMetric[]>;

  // Cost Analytics operations
  createCostAnalytic(cost: InsertCostAnalytic): Promise<CostAnalytic>;
  getCostAnalytic(id: string): Promise<CostAnalytic | undefined>;
  getCostAnalyticsByTenant(tenantId: string, analysisPeriod?: string, limit?: number): Promise<CostAnalytic[]>;
  getCostAnalyticsByEpisode(episodeId: string): Promise<CostAnalytic[]>;
  getCostAnalyticsByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<CostAnalytic[]>;
  updateCostAnalytic(id: string, updates: Partial<InsertCostAnalytic>): Promise<CostAnalytic>;
  deleteCostAnalytic(id: string): Promise<void>;
  getCostAnalyticsByPatient(patientId: string): Promise<CostAnalytic[]>;
  getTenantCostSummary(tenantId: string, startDate: Date, endDate: Date): Promise<{
    totalCosts: number;
    totalReimbursement: number;
    netMargin: number;
    episodeCount: number;
    averageCostPerEpisode: number;
  }>;
  getCostEfficiencyMetrics(tenantId: string, period: string): Promise<CostAnalytic[]>;

  // Compliance Tracking operations
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

  // Analytics aggregation and calculation operations
  calculateTenantAnalyticsSnapshot(tenantId: string, snapshotDate: Date, aggregationPeriod: string): Promise<AnalyticsSnapshot>;
  calculateEpisodeHealingTrends(episodeId: string): Promise<HealingTrend[]>;
  calculateProviderPerformanceMetrics(providerId: string, metricDate: Date, metricPeriod: string): Promise<PerformanceMetric>;
  calculateEpisodeCostAnalytics(episodeId: string): Promise<CostAnalytic>;
  assessEpisodeCompliance(episodeId: string): Promise<ComplianceTracking>;

  // Bulk analytics operations for efficiency
  bulkCreateAnalyticsSnapshots(snapshots: InsertAnalyticsSnapshot[]): Promise<AnalyticsSnapshot[]>;
  bulkCreateHealingTrends(trends: InsertHealingTrend[]): Promise<HealingTrend[]>;
  bulkCreatePerformanceMetrics(metrics: InsertPerformanceMetric[]): Promise<PerformanceMetric[]>;
  bulkCreateCostAnalytics(costs: InsertCostAnalytic[]): Promise<CostAnalytic[]>;
  bulkCreateComplianceTracking(compliance: InsertComplianceTracking[]): Promise<ComplianceTracking[]>;

  // Analytics dashboard queries
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

export class DatabaseStorage implements IStorage {
  private readonly patientContext: PatientContext;
  private readonly documentContext: DocumentContext;
  private readonly analyticsContext: AnalyticsContext;
  private readonly auditContext: AuditContext;

  constructor(private readonly deps: StorageDependencies = defaultStorageDependencies) {
    this.patientContext = createPatientContext(this.deps);
    this.documentContext = createDocumentContext(this.deps);
    this.analyticsContext = createAnalyticsContext(this.deps);
    this.auditContext = createAuditContext(this.deps);
  }
  // User operations (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Try to find existing user by ID
    const [existingById] = await db
      .select()
      .from(users)
      .where(eq(users.id, userData.id))
      .limit(1);
    
    if (existingById) {
      // Update existing user by ID - this is the normal case for returning users
      const [user] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingById.id))
        .returning();
      return user;
    }
    
    // Check if email is already taken by a different user ID
    const [existingByEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, userData.email))
      .limit(1);
    
    if (existingByEmail) {
      // Email conflict: same email but different ID
      // This is a security concern - reject to prevent account hijacking
      throw new Error(
        `Email ${userData.email} is already associated with a different user account. ` +
        `Please contact support to resolve this conflict.`
      );
    }
    
    // Insert new user - no conflicts found
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  // Tenant operations
  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [newTenant] = await db.insert(tenants).values(tenant).returning();
    return newTenant;
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getTenantsByUser(userId: string): Promise<Tenant[]> {
    const result = await db
      .select({ tenant: tenants })
      .from(tenants)
      .innerJoin(tenantUsers, eq(tenants.id, tenantUsers.tenantId))
      .where(and(eq(tenantUsers.userId, userId), eq(tenantUsers.isActive, true)));
    
    return result.map(r => r.tenant);
  }

  // Tenant User operations
  async addUserToTenant(tenantUser: InsertTenantUser): Promise<TenantUser> {
    const [newTenantUser] = await db.insert(tenantUsers).values(tenantUser).returning();
    return newTenantUser;
  }

  async getUserTenantRole(userId: string, tenantId: string): Promise<TenantUser | undefined> {
    const [tenantUser] = await db
      .select()
      .from(tenantUsers)
      .where(and(
        eq(tenantUsers.userId, userId),
        eq(tenantUsers.tenantId, tenantId),
        eq(tenantUsers.isActive, true)
      ));
    return tenantUser;
  }

  // Patient operations
  async createPatient(patient: InsertPatient): Promise<Patient> {
    return this.patientContext.createPatient(patient);
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    return this.patientContext.getPatient(id);
  }

  async getPatientsByTenant(tenantId: string): Promise<Patient[]> {
    return this.patientContext.getPatientsByTenant(tenantId);
  }

  async updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient> {
    return this.patientContext.updatePatient(id, patient);
  }

  async getPatientByMrnAndTenant(mrn: string, tenantId: string): Promise<Patient | undefined> {
    return this.patientContext.getPatientByMrnAndTenant(mrn, tenantId);
  }

  async checkPatientDuplicate(mrn: string, tenantId: string): Promise<boolean> {
    return this.patientContext.checkPatientDuplicate(mrn, tenantId);
  }

  async createEncounter(encounter: InsertEncounter): Promise<Encounter> {
    return this.patientContext.createEncounter(encounter);
  }

  async getEncounter(id: string): Promise<Encounter | undefined> {
    return this.patientContext.getEncounter(id);
  }

  async getEncountersByPatient(patientId: string): Promise<Encounter[]> {
    return this.patientContext.getEncountersByPatient(patientId);
  }

  async updateEncounter(id: string, encounter: Partial<InsertEncounter>): Promise<Encounter> {
    return this.patientContext.updateEncounter(id, encounter);
  }

  async getEncounterByPatientAndDate(patientId: string, encounterDate: string): Promise<Encounter | undefined> {
    return this.patientContext.getEncounterByPatientAndDate(patientId, encounterDate);
  }

  async checkEncounterDuplicate(patientId: string, date: Date): Promise<boolean> {
    return this.patientContext.checkEncounterDuplicate(patientId, date);
  }

  async findDuplicatePatients(): Promise<{ tenantId: string; mrn: string; patientIds: string[] }[]> {
    return this.patientContext.findDuplicatePatients();
  }

  async getDuplicatePatientDetails(tenantId: string, mrn: string): Promise<Patient[]> {
    return this.patientContext.getDuplicatePatientDetails(tenantId, mrn);
  }

  async moveEncountersToPatient(fromPatientId: string, toPatientId: string): Promise<number> {
    return this.patientContext.moveEncountersToPatient(fromPatientId, toPatientId);
  }

  async moveEpisodesToPatient(fromPatientId: string, toPatientId: string): Promise<number> {
    return this.patientContext.moveEpisodesToPatient(fromPatientId, toPatientId);
  }

  async deletePatient(patientId: string): Promise<void> {
    return this.patientContext.deletePatient(patientId);
  }

  async deduplicatePatients(): Promise<{ mergedGroups: number; removedPatients: number; preservedData: { encounters: number; episodes: number } }> {
    return this.patientContext.deduplicatePatients();
  }

  async createEpisode(episode: InsertEpisode): Promise<Episode> {
    return this.patientContext.createEpisode(episode);
  }

  async getEpisode(id: string): Promise<Episode | undefined> {
    return this.patientContext.getEpisode(id);
  }

  async getEpisodesByPatient(patientId: string): Promise<Episode[]> {
    return this.patientContext.getEpisodesByPatient(patientId);
  }

  async updateEpisode(id: string, episode: Partial<InsertEpisode>): Promise<Episode> {
    return this.patientContext.updateEpisode(id, episode);
  }

  async deleteEpisode(id: string): Promise<void> {
    return this.patientContext.deleteEpisode(id);
  }

  async getEncountersByEpisode(episodeId: string): Promise<Encounter[]> {
    return this.patientContext.getEncountersByEpisode(episodeId);
  }

  async getEligibilityChecksByEpisode(episodeId: string): Promise<EligibilityCheck[]> {
    return this.patientContext.getEligibilityChecksByEpisode(episodeId);
  }

  async getDocumentsByEpisode(episodeId: string): Promise<Document[]> {
    return this.patientContext.getDocumentsByEpisode(episodeId);
  }

  async getAllEncountersWithPatientsByTenant(tenantId: string): Promise<Array<Encounter & { patientName: string; patientId: string; patient: any }>> {
    return this.patientContext.getAllEncountersWithPatientsByTenant(tenantId);
  }

  async getAllEpisodesWithPatientsByTenant(tenantId: string): Promise<Array<Episode & { patientName: string; patientId: string; encounterCount: number }>> {
    return this.patientContext.getAllEpisodesWithPatientsByTenant(tenantId);
  }

  async getAllPatientsWithEligibilityByTenant(tenantId: string): Promise<Array<{ id: string; name: string; mrn: string; eligibilityChecks: EligibilityCheck[] }>> {
    return this.patientContext.getAllPatientsWithEligibilityByTenant(tenantId);
  }

  async getAllPatientsWithDocumentsByTenant(tenantId: string): Promise<Array<{ id: string; name: string; mrn: string; documents: Document[] }>> {
    return this.patientContext.getAllPatientsWithDocumentsByTenant(tenantId);
  }

  async getPatientEligibilityHistory(patientId: string): Promise<EligibilityCheck[]> {
    return this.patientContext.getPatientEligibilityHistory(patientId);
  }

  async getEpisodeWithEnrichedHistory(episodeId: string): Promise<EpisodeWithFullHistory> {
    return this.patientContext.getEpisodeWithEnrichedHistory(episodeId);
  }

  async getPatientEpisodesWithHistory(patientId: string): Promise<EpisodeWithFullHistory[]> {
    return this.patientContext.getPatientEpisodesWithHistory(patientId);
  }

  // Policy operations
  async createPolicySource(policy: InsertPolicySource): Promise<PolicySource> {
    const [newPolicy] = await db.insert(policySources).values(policy).returning();
    return newPolicy;
  }

  async getPolicySource(id: string): Promise<PolicySource | undefined> {
    const [policy] = await db.select().from(policySources).where(eq(policySources.id, id));
    return policy;
  }

  async getPolicySourcesByMAC(mac: string): Promise<PolicySource[]> {
    return await db
      .select()
      .from(policySources)
      .where(eq(policySources.mac, mac))
      .orderBy(desc(policySources.effectiveDate));
  }

  async getActivePolicySourcesByMAC(mac: string): Promise<PolicySource[]> {
    return await db
      .select()
      .from(policySources)
      .where(and(eq(policySources.mac, mac), eq(policySources.status, 'active')))
      .orderBy(desc(policySources.effectiveDate));
  }

  async updatePolicySource(id: string, policy: Partial<InsertPolicySource>): Promise<PolicySource> {
    const [updatedPolicy] = await db
      .update(policySources)
      .set({ ...policy, updatedAt: new Date() })
      .where(eq(policySources.id, id))
      .returning();
    return updatedPolicy;
  }

  async getPolicySourceByLCD(lcdId: string): Promise<PolicySource[]> {
    return await db
      .select()
      .from(policySources)
      .where(eq(policySources.lcdId, lcdId))
      .orderBy(desc(policySources.effectiveDate));
  }

  async getAllPolicySources(): Promise<PolicySource[]> {
    return await db
      .select()
      .from(policySources)
      .orderBy(desc(policySources.effectiveDate));
  }

  async updatePolicySourceStatus(id: string, status: string): Promise<PolicySource> {
    const [updatedPolicy] = await db
      .update(policySources)
      .set({ status, updatedAt: new Date() })
      .where(eq(policySources.id, id))
      .returning();
    return updatedPolicy;
  }

  // Enhanced policy operations for time-aware status management
  async getCurrentAndFuturePoliciesByMAC(mac: string, daysAhead: number = 90): Promise<PolicySource[]> {
    const currentDate = new Date();
    const futureDate = new Date(currentDate.getTime() + (daysAhead * 24 * 60 * 60 * 1000));
    
    return await db
      .select()
      .from(policySources)
      .where(
        and(
          eq(policySources.mac, mac),
          or(
            eq(policySources.status, 'current'),
            and(
              eq(policySources.status, 'future'),
              lte(policySources.effectiveDate, futureDate)
            ),
            eq(policySources.status, 'proposed')
          )
        )
      )
      .orderBy(desc(policySources.effectiveDate));
  }

  async getPoliciesByStatus(mac: string, statuses: string[]): Promise<PolicySource[]> {
    return await db
      .select()
      .from(policySources)
      .where(
        and(
          eq(policySources.mac, mac),
          inArray(policySources.status, statuses)
        )
      )
      .orderBy(desc(policySources.effectiveDate));
  }

  async updatePolicyStatusBasedOnDates(): Promise<{ updated: number; superseded: number }> {
    const currentDate = new Date();
    let updated = 0;
    let superseded = 0;
    
    // Update future policies to current if their effective date has passed
    const futureToCurrentResult = await db
      .update(policySources)
      .set({ status: 'current', updatedAt: new Date() })
      .where(
        and(
          eq(policySources.status, 'future'),
          lte(policySources.effectiveDate, currentDate)
        )
      )
      .returning({ id: policySources.id });
    
    updated += futureToCurrentResult.length;
    
    // Update proposed policies to current if their effective date has passed
    const proposedToCurrentResult = await db
      .update(policySources)
      .set({ status: 'current', updatedAt: new Date() })
      .where(
        and(
          eq(policySources.status, 'proposed'),
          lte(policySources.effectiveDate, currentDate)
        )
      )
      .returning({ id: policySources.id });
    
    updated += proposedToCurrentResult.length;
    
    return { updated, superseded };
  }

  async supersedePolicyByLCD(lcdId: string, supersededBy: string): Promise<PolicySource[]> {
    const updatedPolicies = await db
      .update(policySources)
      .set({ 
        status: 'superseded', 
        supersededBy,
        updatedAt: new Date() 
      })
      .where(eq(policySources.lcdId, lcdId))
      .returning();
    
    return updatedPolicies;
  }

  // Eligibility operations
  async createEligibilityCheck(check: InsertEligibilityCheck): Promise<EligibilityCheck> {
    const [newCheck] = await db.insert(eligibilityChecks).values(check).returning();
    return newCheck;
  }

  async getEligibilityCheck(id: string): Promise<EligibilityCheck | undefined> {
    const [check] = await db.select().from(eligibilityChecks).where(eq(eligibilityChecks.id, id));
    return check;
  }

  async getEligibilityChecksByEncounter(encounterId: string): Promise<EligibilityCheck[]> {
    return await db
      .select()
      .from(eligibilityChecks)
      .where(eq(eligibilityChecks.encounterId, encounterId))
      .orderBy(desc(eligibilityChecks.createdAt));
  }

  async updateEligibilityCheck(id: string, updates: Partial<InsertEligibilityCheck>): Promise<EligibilityCheck> {
    const [updatedCheck] = await db
      .update(eligibilityChecks)
      .set(updates)
      .where(eq(eligibilityChecks.id, id))
      .returning();
    return updatedCheck;
  }

  async getRecentEligibilityChecksByTenant(tenantId: string, limit: number = 10): Promise<Array<EligibilityCheck & { patientName: string; encounterId: string; encounterDate: string }>> {
    const results = await db
      .select({
        id: eligibilityChecks.id,
        encounterId: eligibilityChecks.encounterId,
        episodeId: eligibilityChecks.episodeId,
        result: eligibilityChecks.result,
        citations: eligibilityChecks.citations,
        llmModel: eligibilityChecks.llmModel,
        selectedPolicyId: eligibilityChecks.selectedPolicyId,
        selectionAudit: eligibilityChecks.selectionAudit,
        createdAt: eligibilityChecks.createdAt,
        patientName: patients.encryptedFirstName, // Will need to decrypt
        encounterDate: encounters.date
      })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(eq(patients.tenantId, tenantId))
      .orderBy(desc(eligibilityChecks.createdAt))
      .limit(limit);
    
    // Note: In a real implementation, you'd decrypt the encrypted patient names here
    // For now, return mock names to avoid encryption complexity
    return results.map(result => ({
      ...result,
      patientName: 'Patient Name', // In real app, decrypt result.patientName
      encounterDate: result.encounterDate.toISOString(),
      // Add missing diagnosis validation fields with null defaults
      primaryDiagnosis: null,
      secondaryDiagnoses: null,
      diagnosisValidationResult: null,
      diagnosisValidationScore: null,
      diagnosisValidationStatus: null,
      clinicalNecessityResult: null,
      clinicalNecessityScore: null,
      clinicalNecessityLevel: null,
      woundTypeMappingResult: null,
      mappedWoundType: null,
      woundMappingConfidence: null,
      diagnosisComplexityResult: null,
      complexityScore: null,
      complexityLevel: null,
      diagnosisRecommendationsResult: null,
      recommendationsCount: null,
      criticalRecommendationsCount: null,
      overallDiagnosisScore: null,
      diagnosisValidationTimestamp: null,
      diagnosisValidationVersion: null,
      validationAuditTrail: null
    }));
  }

  // ===============================================================================
  // PHASE 5.1: DIAGNOSIS VALIDATION STORAGE OPERATIONS IMPLEMENTATION
  // ===============================================================================

  async updateEligibilityCheckWithDiagnosisValidation(
    checkId: string,
    diagnosisValidationData: {
      primaryDiagnosis: string;
      secondaryDiagnoses?: string[];
      diagnosisValidationResult?: any;
      diagnosisValidationScore?: number;
      diagnosisValidationStatus?: string;
      clinicalNecessityResult?: any;
      clinicalNecessityScore?: number;
      clinicalNecessityLevel?: string;
      woundTypeMappingResult?: any;
      mappedWoundType?: string;
      woundMappingConfidence?: number;
      diagnosisComplexityResult?: any;
      complexityScore?: number;
      complexityLevel?: string;
      diagnosisRecommendationsResult?: any;
      recommendationsCount?: number;
      criticalRecommendationsCount?: number;
      overallDiagnosisScore?: number;
      diagnosisValidationTimestamp?: Date;
      diagnosisValidationVersion?: string;
      validationAuditTrail?: any;
    }
  ): Promise<EligibilityCheck> {
    const [updatedCheck] = await db
      .update(eligibilityChecks)
      .set({
        ...diagnosisValidationData,
        diagnosisValidationTimestamp: diagnosisValidationData.diagnosisValidationTimestamp || new Date()
      })
      .where(eq(eligibilityChecks.id, checkId))
      .returning();
    return updatedCheck;
  }

  async getEligibilityChecksWithDiagnosisValidation(encounterId: string): Promise<EligibilityCheck[]> {
    return await db
      .select()
      .from(eligibilityChecks)
      .where(and(
        eq(eligibilityChecks.encounterId, encounterId),
        sql`${eligibilityChecks.diagnosisValidationResult} IS NOT NULL`
      ))
      .orderBy(desc(eligibilityChecks.createdAt));
  }

  async getDiagnosisValidationsByTenant(tenantId: string, limit: number = 50): Promise<Array<EligibilityCheck & { patientName: string; encounterDate: string }>> {
    const { safeDecryptPatientData } = await import('./services/encryption');
    
    const results = await db
      .select({
        eligibilityCheck: eligibilityChecks,
        patient: patients,
        encounter: encounters
      })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(and(
        eq(patients.tenantId, tenantId),
        sql`${eligibilityChecks.diagnosisValidationResult} IS NOT NULL`
      ))
      .orderBy(desc(eligibilityChecks.diagnosisValidationTimestamp))
      .limit(limit);

    return results.map(row => {
      const { patientData } = safeDecryptPatientData(row.patient);
      return {
        ...row.eligibilityCheck,
        patientName: `${patientData.firstName} ${patientData.lastName}`.trim(),
        encounterDate: row.encounter.date.toISOString().split('T')[0]
      };
    });
  }

  async getDiagnosisValidationsByPatient(patientId: string): Promise<EligibilityCheck[]> {
    return await db
      .select({ eligibilityCheck: eligibilityChecks })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .where(and(
        eq(encounters.patientId, patientId),
        sql`${eligibilityChecks.diagnosisValidationResult} IS NOT NULL`
      ))
      .orderBy(desc(eligibilityChecks.diagnosisValidationTimestamp))
      .then(results => results.map(row => row.eligibilityCheck));
  }

  async getDiagnosisValidationsByComplexityLevel(tenantId: string, complexityLevel: string): Promise<EligibilityCheck[]> {
    return await db
      .select({ eligibilityCheck: eligibilityChecks })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(and(
        eq(patients.tenantId, tenantId),
        eq(eligibilityChecks.complexityLevel, complexityLevel)
      ))
      .orderBy(desc(eligibilityChecks.diagnosisValidationTimestamp))
      .then(results => results.map(row => row.eligibilityCheck));
  }

  async getDiagnosisValidationsByNecessityLevel(tenantId: string, necessityLevel: string): Promise<EligibilityCheck[]> {
    return await db
      .select({ eligibilityCheck: eligibilityChecks })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(and(
        eq(patients.tenantId, tenantId),
        eq(eligibilityChecks.clinicalNecessityLevel, necessityLevel)
      ))
      .orderBy(desc(eligibilityChecks.diagnosisValidationTimestamp))
      .then(results => results.map(row => row.eligibilityCheck));
  }

  async getFailedDiagnosisValidations(tenantId: string): Promise<EligibilityCheck[]> {
    return await db
      .select({ eligibilityCheck: eligibilityChecks })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(and(
        eq(patients.tenantId, tenantId),
        or(
          eq(eligibilityChecks.diagnosisValidationStatus, 'failed'),
          eq(eligibilityChecks.diagnosisValidationStatus, 'warning')
        )
      ))
      .orderBy(desc(eligibilityChecks.diagnosisValidationTimestamp))
      .then(results => results.map(row => row.eligibilityCheck));
  }

  async getDiagnosisValidationsWithCriticalRecommendations(tenantId: string): Promise<EligibilityCheck[]> {
    return await db
      .select({ eligibilityCheck: eligibilityChecks })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(and(
        eq(patients.tenantId, tenantId),
        sql`${eligibilityChecks.criticalRecommendationsCount} > 0`
      ))
      .orderBy(desc(eligibilityChecks.criticalRecommendationsCount))
      .then(results => results.map(row => row.eligibilityCheck));
  }

  async getDiagnosisValidationMetrics(tenantId: string, dateRange?: { start: Date; end: Date }): Promise<{
    totalValidations: number;
    passedValidations: number;
    failedValidations: number;
    averageValidationScore: number;
    averageComplexityScore: number;
    averageNecessityScore: number;
    complexityDistribution: Record<string, number>;
    necessityDistribution: Record<string, number>;
    commonRecommendations: Array<{ recommendation: string; count: number }>;
  }> {
    const dateCondition = dateRange 
      ? and(
          gte(eligibilityChecks.diagnosisValidationTimestamp, dateRange.start),
          lte(eligibilityChecks.diagnosisValidationTimestamp, dateRange.end)
        )
      : sql`TRUE`;

    // Get basic metrics
    const basicMetrics = await db
      .select({
        totalValidations: sql<number>`COUNT(*)`,
        passedValidations: sql<number>`COUNT(CASE WHEN ${eligibilityChecks.diagnosisValidationStatus} = 'passed' THEN 1 END)`,
        failedValidations: sql<number>`COUNT(CASE WHEN ${eligibilityChecks.diagnosisValidationStatus} IN ('failed', 'warning') THEN 1 END)`,
        averageValidationScore: sql<number>`ROUND(AVG(${eligibilityChecks.diagnosisValidationScore}::numeric), 2)`,
        averageComplexityScore: sql<number>`ROUND(AVG(${eligibilityChecks.complexityScore}::numeric), 2)`,
        averageNecessityScore: sql<number>`ROUND(AVG(${eligibilityChecks.clinicalNecessityScore}::numeric), 2)`
      })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(and(
        eq(patients.tenantId, tenantId),
        sql`${eligibilityChecks.diagnosisValidationResult} IS NOT NULL`,
        dateCondition
      ));

    // Get complexity distribution
    const complexityDistribution = await db
      .select({
        complexityLevel: eligibilityChecks.complexityLevel,
        count: sql<number>`COUNT(*)`
      })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(and(
        eq(patients.tenantId, tenantId),
        sql`${eligibilityChecks.complexityLevel} IS NOT NULL`,
        dateCondition
      ))
      .groupBy(eligibilityChecks.complexityLevel);

    // Get necessity distribution
    const necessityDistribution = await db
      .select({
        necessityLevel: eligibilityChecks.clinicalNecessityLevel,
        count: sql<number>`COUNT(*)`
      })
      .from(eligibilityChecks)
      .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
      .innerJoin(patients, eq(encounters.patientId, patients.id))
      .where(and(
        eq(patients.tenantId, tenantId),
        sql`${eligibilityChecks.clinicalNecessityLevel} IS NOT NULL`,
        dateCondition
      ))
      .groupBy(eligibilityChecks.clinicalNecessityLevel);

    const metrics = basicMetrics[0] || {
      totalValidations: 0,
      passedValidations: 0,
      failedValidations: 0,
      averageValidationScore: 0,
      averageComplexityScore: 0,
      averageNecessityScore: 0
    };

    return {
      ...metrics,
      complexityDistribution: complexityDistribution.reduce((acc, item) => {
        if (item.complexityLevel) {
          acc[item.complexityLevel] = item.count;
        }
        return acc;
      }, {} as Record<string, number>),
      necessityDistribution: necessityDistribution.reduce((acc, item) => {
        if (item.necessityLevel) {
          acc[item.necessityLevel] = item.count;
        }
        return acc;
      }, {} as Record<string, number>),
      commonRecommendations: [] // Simplified for now - would need JSON aggregation for real implementation
    };
  }

  // Document operations
  async createDocument(document: InsertDocument): Promise<Document> {
    return this.documentContext.createDocument(document);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    return this.documentContext.getDocument(id);
  }

  async getDocumentsByPatient(patientId: string): Promise<Document[]> {
    return this.documentContext.getDocumentsByPatient(patientId);
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document> {
    return this.documentContext.updateDocument(id, updates);
  }

  async createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion> {
    return this.documentContext.createDocumentVersion(version);
  }

  async getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
    return this.documentContext.getDocumentVersions(documentId);
  }

  async getDocumentVersion(versionId: string): Promise<DocumentVersion | undefined> {
    return this.documentContext.getDocumentVersion(versionId);
  }

  async getCurrentDocumentVersion(documentId: string): Promise<DocumentVersion | undefined> {
    return this.documentContext.getCurrentDocumentVersion(documentId);
  }

  async createDocumentApproval(approval: InsertDocumentApproval): Promise<DocumentApproval> {
    return this.documentContext.createDocumentApproval(approval);
  }

  async getDocumentApprovals(documentId: string): Promise<DocumentApproval[]> {
    return this.documentContext.getDocumentApprovals(documentId);
  }

  async getDocumentApproval(approvalId: string): Promise<DocumentApproval | undefined> {
    return this.documentContext.getDocumentApproval(approvalId);
  }

  async updateDocumentApproval(approvalId: string, updates: Partial<DocumentApproval>): Promise<DocumentApproval> {
    return this.documentContext.updateDocumentApproval(approvalId, updates);
  }

  async processDocumentApproval(approvalId: string, updates: {
    status: 'approved' | 'rejected';
    comments?: string;
    approverUserId: string;
    tenantId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<DocumentApproval> {
    return this.documentContext.processDocumentApproval(approvalId, updates);
  }

  async getPendingApprovals(userId: string, tenantId: string, role?: string): Promise<DocumentApproval[]> {
    return this.documentContext.getPendingApprovals(userId, tenantId, role);
  }

  async createDocumentSignature(signature: InsertDocumentSignature): Promise<DocumentSignature> {
    return this.documentContext.createDocumentSignature(signature);
  }

  async getDocumentSignatures(documentId: string): Promise<DocumentSignature[]> {
    return this.documentContext.getDocumentSignatures(documentId);
  }

  async getDocumentSignature(signatureId: string): Promise<DocumentSignature | undefined> {
    return this.documentContext.getDocumentSignature(signatureId);
  }

  // Recent Activity operations
  async createRecentActivity(activity: InsertRecentActivity): Promise<RecentActivity> {
    const [newActivity] = await db.insert(recentActivities).values(activity).returning();
    return newActivity;
  }

  async getRecentActivitiesByTenant(tenantId: string, limit: number = 10): Promise<RecentActivity[]> {
    return await db
      .select()
      .from(recentActivities)
      .where(eq(recentActivities.tenantId, tenantId))
      .orderBy(desc(recentActivities.createdAt))
      .limit(limit);
  }

  // Audit operations
  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    return this.auditContext.createAuditLog(log);
  }

  async getAuditLogsByTenant(tenantId: string, limit: number = 100): Promise<AuditLog[]> {
    return this.auditContext.getAuditLogsByTenant(tenantId, limit);
  }

  // File Upload operations
  async createFileUpload(upload: InsertFileUpload): Promise<FileUpload> {
    const [newUpload] = await db.insert(fileUploads).values(upload).returning();
    return newUpload;
  }

  async getFileUpload(id: string): Promise<FileUpload | undefined> {
    const [upload] = await db.select().from(fileUploads).where(eq(fileUploads.id, id));
    return upload;
  }

  async getFileUploadsByTenant(tenantId: string): Promise<FileUpload[]> {
    return await db
      .select()
      .from(fileUploads)
      .where(eq(fileUploads.tenantId, tenantId))
      .orderBy(desc(fileUploads.createdAt));
  }

  async getFileUploadsWithExtractionDataByTenant(tenantId: string): Promise<Array<FileUpload & { extractionData?: PdfExtractedData }>> {
    const uploads = await db
      .select()
      .from(fileUploads)
      .leftJoin(pdfExtractedData, eq(fileUploads.id, pdfExtractedData.fileUploadId))
      .where(eq(fileUploads.tenantId, tenantId))
      .orderBy(desc(fileUploads.createdAt));

    return uploads.map(row => ({
      ...row.file_uploads,
      extractionData: row.pdf_extracted_data || undefined
    }));
  }

  async updateFileUploadStatus(id: string, status: string, processingError?: string): Promise<FileUpload> {
    const updates: any = { status };
    if (status === 'processed') {
      updates.processedAt = new Date();
    }
    if (processingError) {
      updates.processingError = processingError;
    }

    const [updated] = await db
      .update(fileUploads)
      .set(updates)
      .where(eq(fileUploads.id, id))
      .returning();
    return updated;
  }

  async updateFileUploadText(id: string, extractedText: string): Promise<FileUpload> {
    const [updated] = await db
      .update(fileUploads)
      .set({ extractedText })
      .where(eq(fileUploads.id, id))
      .returning();
    return updated;
  }

  // PDF Extracted Data operations
  async createPdfExtractedData(data: InsertPdfExtractedData): Promise<PdfExtractedData> {
    const [newData] = await db.insert(pdfExtractedData).values(data).returning();
    return newData;
  }

  async getPdfExtractedData(id: string): Promise<PdfExtractedData | undefined> {
    const [data] = await db.select().from(pdfExtractedData).where(eq(pdfExtractedData.id, id));
    return data;
  }

  async getPdfExtractedDataByFileUpload(fileUploadId: string): Promise<PdfExtractedData | undefined> {
    const [data] = await db.select().from(pdfExtractedData).where(eq(pdfExtractedData.fileUploadId, fileUploadId));
    return data;
  }

  // Alias method for compatibility with requested naming convention
  async getPdfExtractedDataByUploadId(uploadId: string): Promise<PdfExtractedData | undefined> {
    return this.getPdfExtractedDataByFileUpload(uploadId);
  }

  async getPdfExtractedDataByTenant(tenantId: string): Promise<PdfExtractedData[]> {
    return await db
      .select()
      .from(pdfExtractedData)
      .where(eq(pdfExtractedData.tenantId, tenantId))
      .orderBy(desc(pdfExtractedData.createdAt));
  }

  async updatePdfExtractedDataValidation(id: string, status: string, reviewedBy: string, comments?: string): Promise<PdfExtractedData> {
    const updates: any = { 
      validationStatus: status, 
      reviewedBy, 
      reviewedAt: new Date() 
    };
    if (comments) {
      updates.reviewComments = comments;
    }

    const [updated] = await db
      .update(pdfExtractedData)
      .set(updates)
      .where(eq(pdfExtractedData.id, id))
      .returning();
    return updated;
  }

  async updatePdfExtractedData(id: string, data: Partial<InsertPdfExtractedData>): Promise<PdfExtractedData> {
    const [updated] = await db
      .update(pdfExtractedData)
      .set({ ...data })
      .where(eq(pdfExtractedData.id, id))
      .returning();
    return updated;
  }

  async linkPdfExtractedDataToRecords(id: string, patientId?: string, encounterId?: string): Promise<PdfExtractedData> {
    const updates: any = {};
    if (patientId) updates.patientId = patientId;
    if (encounterId) updates.encounterId = encounterId;

    const [updated] = await db
      .update(pdfExtractedData)
      .set(updates)
      .where(eq(pdfExtractedData.id, id))
      .returning();
    return updated;
  }

  // ===============================================================================
  // PRODUCT APPLICATION WORKFLOW STORAGE IMPLEMENTATIONS
  // ===============================================================================

  // Product Catalog operations
  async searchProducts(filters: {
    category?: string;
    woundTypes?: string[];
    hcpcsCode?: string;
    manufacturerName?: string;
    isActive?: boolean;
    clinicalEvidenceLevel?: string;
  }): Promise<Product[]> {
    let query = db.select().from(products);
    
    const conditions = [];
    
    if (filters.isActive !== undefined) {
      conditions.push(eq(products.isActive, filters.isActive));
    }
    
    if (filters.category) {
      conditions.push(eq(products.productCategory, filters.category));
    }
    
    if (filters.hcpcsCode) {
      conditions.push(eq(products.primaryHcpcsCode, filters.hcpcsCode));
    }
    
    if (filters.manufacturerName) {
      conditions.push(eq(products.manufacturerName, filters.manufacturerName));
    }
    
    if (filters.clinicalEvidenceLevel) {
      conditions.push(eq(products.clinicalEvidenceLevel, filters.clinicalEvidenceLevel));
    }
    
    // For wound types, we need to check if any of the requested wound types match the product indications
    if (filters.woundTypes && filters.woundTypes.length > 0) {
      // This is a simplified implementation - in reality we'd need more complex array matching
      conditions.push(sql`${products.indicatedWoundTypes} && ${filters.woundTypes}`);
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    return await query.orderBy(asc(products.productName));
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductsByHcpcs(hcpcsCode: string): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(eq(products.primaryHcpcsCode, hcpcsCode));
  }

  async getProductsByWoundType(woundType: string): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(sql`${products.indicatedWoundTypes} @> ${[woundType]}`);
  }

  async getProductsByManufacturer(manufacturerName: string): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(eq(products.manufacturerName, manufacturerName));
  }

  // Product LCD Coverage operations
  async getProductLcdCoverage(productId: string, macRegion: string): Promise<ProductLcdCoverage | undefined> {
    const [coverage] = await db
      .select()
      .from(productLcdCoverage)
      .where(and(
        eq(productLcdCoverage.productId, productId),
        eq(productLcdCoverage.macRegion, macRegion)
      ));
    return coverage;
  }

  async getActiveLcdCoverageByProduct(productId: string, macRegion: string): Promise<ProductLcdCoverage[]> {
    return await db
      .select()
      .from(productLcdCoverage)
      .where(and(
        eq(productLcdCoverage.productId, productId),
        eq(productLcdCoverage.macRegion, macRegion)
      ))
      .orderBy(desc(productLcdCoverage.effectiveDate));
  }

  async validateProductCoverage(
    productId: string,
    episodeId: string,
    applicationData: {
      woundSize?: number;
      woundDepth?: number;
      diagnosisCodes: string[];
      conservativeCareCompliance?: boolean;
      conservativeCareDays?: number;
    }
  ): Promise<{
    isCovered: boolean;
    coverageLevel: string;
    violations: string[];
    warnings: string[];
    requirements: string[];
    priorAuthRequired: boolean;
    maxReimbursableAmount?: number;
  }> {
    // Get episode and patient data
    const episode = await this.getEpisode(episodeId);
    if (!episode) {
      return {
        isCovered: false,
        coverageLevel: 'none',
        violations: ['Episode not found'],
        warnings: [],
        requirements: [],
        priorAuthRequired: false
      };
    }

    const patient = await this.getPatient(episode.patientId);
    if (!patient) {
      return {
        isCovered: false,
        coverageLevel: 'none',
        violations: ['Patient not found'],
        warnings: [],
        requirements: [],
        priorAuthRequired: false
      };
    }

    // Get LCD coverage for patient's MAC region
    const lcdCoverage = await this.getProductLcdCoverage(productId, patient.macRegion || '');
    if (!lcdCoverage) {
      return {
        isCovered: false,
        coverageLevel: 'none',
        violations: ['No LCD coverage found for MAC region ' + patient.macRegion],
        warnings: [],
        requirements: [],
        priorAuthRequired: false
      };
    }

    const violations: string[] = [];
    const warnings: string[] = [];
    const requirements: string[] = [];

    // Size validations
    if (applicationData.woundSize && lcdCoverage.minWoundSize && applicationData.woundSize < lcdCoverage.minWoundSize) {
      violations.push(`Wound size ${applicationData.woundSize} cm² is below minimum requirement of ${lcdCoverage.minWoundSize} cm²`);
    }

    if (applicationData.woundSize && lcdCoverage.maxWoundSize && applicationData.woundSize > lcdCoverage.maxWoundSize) {
      violations.push(`Wound size ${applicationData.woundSize} cm² exceeds maximum limit of ${lcdCoverage.maxWoundSize} cm²`);
    }

    // Conservative care requirement
    if (lcdCoverage.requiredConservativeDays && lcdCoverage.requiredConservativeDays > 0) {
      if (!applicationData.conservativeCareCompliance) {
        violations.push(`Conservative care compliance required (${lcdCoverage.requiredConservativeDays} days)`);
      }
      requirements.push('conservative_care');
    }

    // Diagnosis code validation (simplified)
    const requiredDiagnoses = lcdCoverage.requiredPrimaryDiagnoses as string[] | null;
    if (requiredDiagnoses && requiredDiagnoses.length > 0) {
      const hasValidDiagnosis = applicationData.diagnosisCodes.some(code =>
        requiredDiagnoses.includes(code)
      );
      if (!hasValidDiagnosis) {
        violations.push('No qualifying diagnosis codes found');
      }
    }

    return {
      isCovered: violations.length === 0,
      coverageLevel: violations.length === 0 ? 'full' : 'none',
      violations,
      warnings,
      requirements,
      priorAuthRequired: lcdCoverage.priorAuthRequired || false,
      maxReimbursableAmount: lcdCoverage.maxReimbursableAmount || undefined
    };
  }

  // Product Application operations  
  async createProductApplication(application: InsertProductApplication): Promise<ProductApplication> {
    const [newApplication] = await db.insert(productApplications).values(application).returning();
    return newApplication;
  }

  async getProductApplication(id: string): Promise<ProductApplication | undefined> {
    const [application] = await db.select().from(productApplications).where(eq(productApplications.id, id));
    return application;
  }

  async getProductApplicationsByEpisode(episodeId: string): Promise<ProductApplication[]> {
    return await db
      .select()
      .from(productApplications)
      .where(eq(productApplications.episodeId, episodeId))
      .orderBy(desc(productApplications.applicationDate));
  }

  async getProductApplicationsByPatient(patientId: string): Promise<ProductApplication[]> {
    return await db
      .select()
      .from(productApplications)
      .where(eq(productApplications.patientId, patientId))
      .orderBy(desc(productApplications.applicationDate));
  }

  async updateProductApplication(id: string, updates: Partial<InsertProductApplication>): Promise<ProductApplication> {
    const [updated] = await db
      .update(productApplications)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(productApplications.id, id))
      .returning();
    return updated;
  }

  // Product frequency validation
  async validateProductApplicationFrequency(
    productId: string,
    patientId: string,
    episodeId: string,
    applicationDate: Date
  ): Promise<{
    isValid: boolean;
    violations: string[];
    lastApplicationDate?: Date;
    daysSinceLastApplication?: number;
    applicationsThisEpisode: number;
    applicationsThisMonth: number;
    applicationsThisYear: number;
    maxAllowed: {
      perEpisode?: number;
      perMonth?: number;
      perYear?: number;
      minDaysBetween?: number;
    };
  }> {
    // Get patient MAC region for LCD coverage
    const patient = await this.getPatient(patientId);
    const macRegion = patient?.macRegion || '';
    
    // Get LCD coverage limits
    const lcdCoverage = await this.getProductLcdCoverage(productId, macRegion);
    
    // Count existing applications
    const episodeApplications = await db
      .select()
      .from(productApplications)
      .where(and(
        eq(productApplications.productId, productId),
        eq(productApplications.episodeId, episodeId)
      ));

    const monthStart = new Date(applicationDate.getFullYear(), applicationDate.getMonth(), 1);
    const yearStart = new Date(applicationDate.getFullYear(), 0, 1);

    const monthApplications = await db
      .select()
      .from(productApplications)
      .where(and(
        eq(productApplications.productId, productId),
        eq(productApplications.patientId, patientId),
        gte(productApplications.applicationDate, monthStart),
        lte(productApplications.applicationDate, applicationDate)
      ));

    const yearApplications = await db
      .select()
      .from(productApplications)
      .where(and(
        eq(productApplications.productId, productId),
        eq(productApplications.patientId, patientId),
        gte(productApplications.applicationDate, yearStart),
        lte(productApplications.applicationDate, applicationDate)
      ));

    // Find most recent application
    const lastApplication = await db
      .select()
      .from(productApplications)
      .where(and(
        eq(productApplications.productId, productId),
        eq(productApplications.patientId, patientId),
        sql`${productApplications.applicationDate} < ${applicationDate}`
      ))
      .orderBy(desc(productApplications.applicationDate))
      .limit(1);

    const violations: string[] = [];
    let lastApplicationDate: Date | undefined;
    let daysSinceLastApplication: number | undefined;

    if (lastApplication.length > 0) {
      lastApplicationDate = lastApplication[0].applicationDate;
      daysSinceLastApplication = Math.floor(
        (applicationDate.getTime() - lastApplicationDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Check minimum days between applications
      if (lcdCoverage?.minDaysBetweenApplications && daysSinceLastApplication < lcdCoverage.minDaysBetweenApplications) {
        violations.push(`Minimum ${lcdCoverage.minDaysBetweenApplications} days required between applications`);
      }
    }

    // Check episode limit
    if (lcdCoverage?.maxApplicationsPerEpisode && episodeApplications.length >= lcdCoverage.maxApplicationsPerEpisode) {
      violations.push(`Maximum ${lcdCoverage.maxApplicationsPerEpisode} applications per episode exceeded`);
    }

    // Check monthly limit
    if (lcdCoverage?.maxApplicationsPerMonth && monthApplications.length >= lcdCoverage.maxApplicationsPerMonth) {
      violations.push(`Maximum ${lcdCoverage.maxApplicationsPerMonth} applications per month exceeded`);
    }

    // Check yearly limit
    if (lcdCoverage?.maxApplicationsPerYear && yearApplications.length >= lcdCoverage.maxApplicationsPerYear) {
      violations.push(`Maximum ${lcdCoverage.maxApplicationsPerYear} applications per year exceeded`);
    }

    return {
      isValid: violations.length === 0,
      violations,
      lastApplicationDate,
      daysSinceLastApplication,
      applicationsThisEpisode: episodeApplications.length,
      applicationsThisMonth: monthApplications.length,
      applicationsThisYear: yearApplications.length,
      maxAllowed: {
        perEpisode: lcdCoverage?.maxApplicationsPerEpisode || undefined,
        perMonth: lcdCoverage?.maxApplicationsPerMonth || undefined,
        perYear: lcdCoverage?.maxApplicationsPerYear || undefined,
        minDaysBetween: lcdCoverage?.minDaysBetweenApplications || undefined
      }
    };
  }

  // Clinical Decision Support
  async getProductRecommendations(
    woundType: string,
    woundSize: number,
    diagnosisCodes: string[],
    patientFactors?: {
      age?: number;
      diabetic?: boolean;
      immunocompromised?: boolean;
      previousProducts?: string[];
    }
  ): Promise<Array<{
    product: Product;
    coverageInfo: ProductLcdCoverage | null;
    recommendationScore: number;
    reasons: string[];
    contraindications: string[];
    clinicalEvidence: string;
    successRate: number;
    costEffectiveness: number;
  }>> {
    // Get products that match wound type
    const suitableProducts = await this.getProductsByWoundType(woundType);
    
    const recommendations: Array<{
      product: Product;
      coverageInfo: ProductLcdCoverage | null;
      recommendationScore: number;
      reasons: string[];
      contraindications: string[];
      clinicalEvidence: string;
      successRate: number;
      costEffectiveness: number;
    }> = [];

    for (const product of suitableProducts) {
      // This is a simplified scoring algorithm
      let score = 0.5; // Base score
      const reasons: string[] = [];
      const contraindications: string[] = [];

      // Wound type match
      if (product.indicatedWoundTypes?.includes(woundType)) {
        score += 0.2;
        reasons.push('Indicated for wound type');
      }

      // Evidence level scoring
      switch (product.clinicalEvidenceLevel) {
        case 'high':
          score += 0.2;
          break;
        case 'moderate':
          score += 0.1;
          break;
        case 'low':
          score += 0.05;
          break;
      }

      // Size appropriateness (simplified)
      if (woundSize >= 2 && woundSize <= 25) {
        score += 0.1;
        reasons.push('Appropriate for wound size');
      }

      // Patient factors
      if (patientFactors?.diabetic && product.productName.toLowerCase().includes('diabetic')) {
        score += 0.1;
        reasons.push('Specifically indicated for diabetic wounds');
      }

      // Avoid previously failed products
      if (patientFactors?.previousProducts?.includes(product.id)) {
        score -= 0.2;
        contraindications.push('Previously used without success');
      }

      // Only include products with reasonable scores
      if (score > 0.4) {
        // Get coverage info (simplified - using first MAC region)
        const coverageInfo = await this.getProductLcdCoverage(product.id, 'MAC_A');
        
        recommendations.push({
          product,
          coverageInfo: coverageInfo ?? null,
          recommendationScore: Math.min(score, 1.0),
          reasons,
          contraindications,
          clinicalEvidence: product.clinicalEvidenceLevel || 'Not specified',
          successRate: Math.random() * 0.3 + 0.6, // Simplified success rate
          costEffectiveness: Math.random() * 0.4 + 0.6 // Simplified cost effectiveness
        });
      }
    }

    // Sort by recommendation score
    return recommendations.sort((a, b) => b.recommendationScore - a.recommendationScore);
  }

  // Conservative Care Integration
  async checkConservativeCareCompliance(episodeId: string, requiredDays: number): Promise<{
    isCompliant: boolean;
    daysCompleted: number;
    missingTreatments: string[];
    compliancePercentage: number;
    eligibleDate?: Date;
  }> {
    // Get all encounters for the episode
    const encounters = await this.getEncountersByEpisode(episodeId);
    
    if (encounters.length === 0) {
      return {
        isCompliant: false,
        daysCompleted: 0,
        missingTreatments: ['No encounters documented'],
        compliancePercentage: 0
      };
    }

    // Sort encounters by date
    const sortedEncounters = encounters.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Check conservative care treatments
    const conservativeCareEncounters = encounters.filter(encounter => {
      const conservativeCare = encounter.conservativeCare as any;
      return conservativeCare && (
        conservativeCare.offloading ||
        conservativeCare.woundCleansing ||
        conservativeCare.debridement ||
        conservativeCare.moistureManagement ||
        conservativeCare.infectionControl
      );
    });

    const daysCompleted = conservativeCareEncounters.length * 7; // Assuming weekly encounters
    const compliancePercentage = Math.min((daysCompleted / requiredDays) * 100, 100);
    
    const missingTreatments: string[] = [];
    
    // Check for required treatments
    const hasOffloading = conservativeCareEncounters.some(e => (e.conservativeCare as any)?.offloading);
    const hasWoundCare = conservativeCareEncounters.some(e => (e.conservativeCare as any)?.woundCleansing);
    const hasDebridement = conservativeCareEncounters.some(e => (e.conservativeCare as any)?.debridement);
    
    if (!hasOffloading) missingTreatments.push('Offloading');
    if (!hasWoundCare) missingTreatments.push('Wound cleansing');
    if (!hasDebridement) missingTreatments.push('Debridement');

    // Calculate eligible date if not yet compliant
    let eligibleDate: Date | undefined;
    if (daysCompleted < requiredDays && sortedEncounters.length > 0) {
      const firstEncounterDate = sortedEncounters[0].date;
      eligibleDate = new Date(firstEncounterDate.getTime() + requiredDays * 24 * 60 * 60 * 1000);
    }

    return {
      isCompliant: daysCompleted >= requiredDays && missingTreatments.length === 0,
      daysCompleted,
      missingTreatments,
      compliancePercentage,
      eligibleDate
    };
  }

  // ===============================================================================
  // ANALYTICS OPERATIONS - PHASE 5.2: CLINICAL METRICS & PERFORMANCE TRACKING
  // ===============================================================================

  // Analytics operations
  async createAnalyticsSnapshot(snapshot: InsertAnalyticsSnapshot): Promise<AnalyticsSnapshot> {
    return this.analyticsContext.createAnalyticsSnapshot(snapshot);
  }

  async getAnalyticsSnapshot(id: string): Promise<AnalyticsSnapshot | undefined> {
    return this.analyticsContext.getAnalyticsSnapshot(id);
  }

  async getAnalyticsSnapshotsByTenant(tenantId: string, aggregationPeriod?: string, limit?: number): Promise<AnalyticsSnapshot[]> {
    return this.analyticsContext.getAnalyticsSnapshotsByTenant(tenantId, aggregationPeriod, limit);
  }

  async getAnalyticsSnapshotsByDateRange(tenantId: string, startDate: Date, endDate: Date, aggregationPeriod: string): Promise<AnalyticsSnapshot[]> {
    return this.analyticsContext.getAnalyticsSnapshotsByDateRange(tenantId, startDate, endDate, aggregationPeriod);
  }

  async updateAnalyticsSnapshot(id: string, updates: Partial<InsertAnalyticsSnapshot>): Promise<AnalyticsSnapshot> {
    return this.analyticsContext.updateAnalyticsSnapshot(id, updates);
  }

  async deleteAnalyticsSnapshot(id: string): Promise<void> {
    return this.analyticsContext.deleteAnalyticsSnapshot(id);
  }

  async getLatestAnalyticsSnapshot(tenantId: string, aggregationPeriod: string): Promise<AnalyticsSnapshot | undefined> {
    return this.analyticsContext.getLatestAnalyticsSnapshot(tenantId, aggregationPeriod);
  }

  async createHealingTrend(trend: InsertHealingTrend): Promise<HealingTrend> {
    return this.analyticsContext.createHealingTrend(trend);
  }

  async getHealingTrend(id: string): Promise<HealingTrend | undefined> {
    return this.analyticsContext.getHealingTrend(id);
  }

  async getHealingTrendsByEpisode(episodeId: string): Promise<HealingTrend[]> {
    return this.analyticsContext.getHealingTrendsByEpisode(episodeId);
  }

  async getHealingTrendsByTenant(tenantId: string, limit?: number): Promise<HealingTrend[]> {
    return this.analyticsContext.getHealingTrendsByTenant(tenantId, limit);
  }

  async getHealingTrendsByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<HealingTrend[]> {
    return this.analyticsContext.getHealingTrendsByDateRange(tenantId, startDate, endDate);
  }

  async updateHealingTrend(id: string, updates: Partial<InsertHealingTrend>): Promise<HealingTrend> {
    return this.analyticsContext.updateHealingTrend(id, updates);
  }

  async deleteHealingTrend(id: string): Promise<void> {
    return this.analyticsContext.deleteHealingTrend(id);
  }

  async getHealingTrendsByPatient(patientId: string): Promise<HealingTrend[]> {
    return this.analyticsContext.getHealingTrendsByPatient(patientId);
  }

  async getEpisodeHealingTrajectory(episodeId: string): Promise<HealingTrend[]> {
    return this.analyticsContext.getEpisodeHealingTrajectory(episodeId);
  }

  async createPerformanceMetric(metric: InsertPerformanceMetric): Promise<PerformanceMetric> {
    return this.analyticsContext.createPerformanceMetric(metric);
  }

  async getPerformanceMetric(id: string): Promise<PerformanceMetric | undefined> {
    return this.analyticsContext.getPerformanceMetric(id);
  }

  async getPerformanceMetricsByTenant(tenantId: string, metricScope?: string, limit?: number): Promise<PerformanceMetric[]> {
    return this.analyticsContext.getPerformanceMetricsByTenant(tenantId, metricScope, limit);
  }

  async getPerformanceMetricsByProvider(providerId: string, limit?: number): Promise<PerformanceMetric[]> {
    return this.analyticsContext.getPerformanceMetricsByProvider(providerId, limit);
  }

  async getPerformanceMetricsByDateRange(tenantId: string, startDate: Date, endDate: Date, metricPeriod: string): Promise<PerformanceMetric[]> {
    return this.analyticsContext.getPerformanceMetricsByDateRange(tenantId, startDate, endDate, metricPeriod);
  }

  async updatePerformanceMetric(id: string, updates: Partial<InsertPerformanceMetric>): Promise<PerformanceMetric> {
    return this.analyticsContext.updatePerformanceMetric(id, updates);
  }

  async deletePerformanceMetric(id: string): Promise<void> {
    return this.analyticsContext.deletePerformanceMetric(id);
  }

  async getProviderPerformanceComparison(tenantId: string, metricPeriod: string, limit?: number): Promise<PerformanceMetric[]> {
    return this.analyticsContext.getProviderPerformanceComparison(tenantId, metricPeriod, limit);
  }

  async getPerformanceTrends(tenantId: string, metricType: string, periods: number): Promise<PerformanceMetric[]> {
    return this.analyticsContext.getPerformanceTrends(tenantId, metricType, periods);
  }

  async createCostAnalytic(cost: InsertCostAnalytic): Promise<CostAnalytic> {
    return this.analyticsContext.createCostAnalytic(cost);
  }

  async getCostAnalytic(id: string): Promise<CostAnalytic | undefined> {
    return this.analyticsContext.getCostAnalytic(id);
  }

  async getCostAnalyticsByTenant(tenantId: string, analysisPeriod?: string, limit?: number): Promise<CostAnalytic[]> {
    return this.analyticsContext.getCostAnalyticsByTenant(tenantId, analysisPeriod, limit);
  }

  async getCostAnalyticsByEpisode(episodeId: string): Promise<CostAnalytic[]> {
    return this.analyticsContext.getCostAnalyticsByEpisode(episodeId);
  }

  async getCostAnalyticsByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<CostAnalytic[]> {
    return this.analyticsContext.getCostAnalyticsByDateRange(tenantId, startDate, endDate);
  }

  async updateCostAnalytic(id: string, updates: Partial<InsertCostAnalytic>): Promise<CostAnalytic> {
    return this.analyticsContext.updateCostAnalytic(id, updates);
  }

  async deleteCostAnalytic(id: string): Promise<void> {
    return this.analyticsContext.deleteCostAnalytic(id);
  }

  async getCostAnalyticsByPatient(patientId: string): Promise<CostAnalytic[]> {
    return this.analyticsContext.getCostAnalyticsByPatient(patientId);
  }

  async getTenantCostSummary(tenantId: string, startDate: Date, endDate: Date): Promise<{ totalCosts: number; totalReimbursement: number; netMargin: number; episodeCount: number; averageCostPerEpisode: number }> {
    return this.analyticsContext.getTenantCostSummary(tenantId, startDate, endDate);
  }

  async getCostEfficiencyMetrics(tenantId: string, period: string): Promise<CostAnalytic[]> {
    return this.analyticsContext.getCostEfficiencyMetrics(tenantId, period);
  }

  async createComplianceTracking(compliance: InsertComplianceTracking): Promise<ComplianceTracking> {
    return this.analyticsContext.createComplianceTracking(compliance);
  }

  async getComplianceTracking(id: string): Promise<ComplianceTracking | undefined> {
    return this.analyticsContext.getComplianceTracking(id);
  }

  async getComplianceTrackingByTenant(tenantId: string, assessmentType?: string, limit?: number): Promise<ComplianceTracking[]> {
    return this.analyticsContext.getComplianceTrackingByTenant(tenantId, assessmentType, limit);
  }

  async getComplianceTrackingByEpisode(episodeId: string): Promise<ComplianceTracking[]> {
    return this.analyticsContext.getComplianceTrackingByEpisode(episodeId);
  }

  async getComplianceTrackingByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<ComplianceTracking[]> {
    return this.analyticsContext.getComplianceTrackingByDateRange(tenantId, startDate, endDate);
  }

  async updateComplianceTracking(id: string, updates: Partial<InsertComplianceTracking>): Promise<ComplianceTracking> {
    return this.analyticsContext.updateComplianceTracking(id, updates);
  }

  async deleteComplianceTracking(id: string): Promise<void> {
    return this.analyticsContext.deleteComplianceTracking(id);
  }

  async getComplianceTrackingByEligibilityCheck(eligibilityCheckId: string): Promise<ComplianceTracking[]> {
    return this.analyticsContext.getComplianceTrackingByEligibilityCheck(eligibilityCheckId);
  }

  async getTenantComplianceSummary(tenantId: string, startDate: Date, endDate: Date): Promise<{ overallComplianceRate: number; medicareComplianceRate: number; criticalViolations: number; minorViolations: number; assessmentCount: number }> {
    return this.analyticsContext.getTenantComplianceSummary(tenantId, startDate, endDate);
  }

  async getComplianceRiskAnalysis(tenantId: string): Promise<ComplianceTracking[]> {
    return this.analyticsContext.getComplianceRiskAnalysis(tenantId);
  }

  async calculateTenantAnalyticsSnapshot(tenantId: string, snapshotDate: Date, aggregationPeriod: string): Promise<AnalyticsSnapshot> {
    return this.analyticsContext.calculateTenantAnalyticsSnapshot(tenantId, snapshotDate, aggregationPeriod);
  }

  async calculateEpisodeHealingTrends(episodeId: string): Promise<HealingTrend[]> {
    return this.analyticsContext.calculateEpisodeHealingTrends(episodeId);
  }

  async calculateProviderPerformanceMetrics(providerId: string, metricDate: Date, metricPeriod: string): Promise<PerformanceMetric> {
    return this.analyticsContext.calculateProviderPerformanceMetrics(providerId, metricDate, metricPeriod);
  }

  async calculateEpisodeCostAnalytics(episodeId: string): Promise<CostAnalytic> {
    return this.analyticsContext.calculateEpisodeCostAnalytics(episodeId);
  }

  async assessEpisodeCompliance(episodeId: string): Promise<ComplianceTracking> {
    return this.analyticsContext.assessEpisodeCompliance(episodeId);
  }

  async bulkCreateAnalyticsSnapshots(snapshots: InsertAnalyticsSnapshot[]): Promise<AnalyticsSnapshot[]> {
    return this.analyticsContext.bulkCreateAnalyticsSnapshots(snapshots);
  }

  async bulkCreateHealingTrends(trends: InsertHealingTrend[]): Promise<HealingTrend[]> {
    return this.analyticsContext.bulkCreateHealingTrends(trends);
  }

  async bulkCreatePerformanceMetrics(metrics: InsertPerformanceMetric[]): Promise<PerformanceMetric[]> {
    return this.analyticsContext.bulkCreatePerformanceMetrics(metrics);
  }

  async bulkCreateCostAnalytics(costs: InsertCostAnalytic[]): Promise<CostAnalytic[]> {
    return this.analyticsContext.bulkCreateCostAnalytics(costs);
  }

  async bulkCreateComplianceTracking(compliance: InsertComplianceTracking[]): Promise<ComplianceTracking[]> {
    return this.analyticsContext.bulkCreateComplianceTracking(compliance);
  }

  async getTenantAnalyticsDashboard(tenantId: string, period: string): Promise<{ currentMetrics: AnalyticsSnapshot | undefined; healingTrends: HealingTrend[]; performanceMetrics: PerformanceMetric[]; costSummary: CostAnalytic[]; complianceStatus: ComplianceTracking[] }> {
    return this.analyticsContext.getTenantAnalyticsDashboard(tenantId, period);
  }

  async getProviderAnalyticsDashboard(providerId: string, tenantId: string, period: string): Promise<{ performanceMetrics: PerformanceMetric[]; healingOutcomes: HealingTrend[]; costEfficiency: CostAnalytic[]; complianceRecord: ComplianceTracking[] }> {
    return this.analyticsContext.getProviderAnalyticsDashboard(providerId, tenantId, period);
  }
}

export const storage = new DatabaseStorage();
