import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  uuid,
  unique,
  uniqueIndex,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenants (Clinics)
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  npi: varchar("npi", { length: 10 }).notNull(),
  tin: varchar("tin", { length: 9 }).notNull(),
  macRegion: varchar("mac_region", { length: 50 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Tenant Users (User-Tenant relationship with roles)
export const tenantUsers = pgTable("tenant_users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(), // Admin, Physician, Staff
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Patients
export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  mrn: varchar("mrn", { length: 50 }).notNull(),
  encryptedFirstName: text("encrypted_first_name").notNull(),
  encryptedLastName: text("encrypted_last_name").notNull(),
  encryptedDob: text("encrypted_dob"), // encrypted date of birth
  payerType: varchar("payer_type", { length: 50 }).notNull(), // Original Medicare, Medicare Advantage
  planName: varchar("plan_name", { length: 255 }),
  insuranceId: varchar("insurance_id", { length: 100 }), // Primary insurance ID
  // Secondary insurance fields for comprehensive coverage analysis
  secondaryPayerType: varchar("secondary_payer_type", { length: 50 }), // BCBS, Aetna, etc.
  secondaryPlanName: varchar("secondary_plan_name", { length: 255 }),
  secondaryInsuranceId: varchar("secondary_insurance_id", { length: 100 }),
  macRegion: varchar("mac_region", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("unique_mrn_tenant").on(table.mrn, table.tenantId)
]);

// Encounters
export const encounters = pgTable("encounters", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  encryptedNotes: jsonb("encrypted_notes").notNull(), // Array of encrypted encounter notes
  woundDetails: jsonb("wound_details").notNull(), // Wound type, location, measurements, duration
  conservativeCare: jsonb("conservative_care").notNull(), // Prior conservative care details with durations
  // CPT/HCPCS codes for procedures performed
  procedureCodes: jsonb("procedure_codes"), // Array of {code, description, modifier, units}
  // Vascular assessment for comprehensive wound care evaluation
  vascularAssessment: jsonb("vascular_assessment"), // {dorsalisPedis, posteriorTibial, capillaryRefill, edema, varicosities}
  // Functional and mobility status for Medicare requirements
  functionalStatus: jsonb("functional_status"), // {selfCare, mobility, assistiveDevice, adlScore}
  // Diabetic status explicitly tracked
  diabeticStatus: varchar("diabetic_status", { length: 20 }), // diabetic, nondiabetic, prediabetic
  infectionStatus: varchar("infection_status", { length: 100 }),
  comorbidities: jsonb("comorbidities"),
  attachmentMetadata: jsonb("attachment_metadata"), // Metadata for encrypted image blobs
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Episodes - Group related encounters for the same wound/condition
export const episodes = pgTable("episodes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  woundType: varchar("wound_type", { length: 100 }).notNull(), // DFU, VLU, etc.
  woundLocation: varchar("wound_location", { length: 100 }).notNull(),
  episodeStartDate: timestamp("episode_start_date").notNull(),
  episodeEndDate: timestamp("episode_end_date"), // Null if ongoing
  status: varchar("status", { length: 20 }).default("active"), // active, resolved, chronic
  primaryDiagnosis: varchar("primary_diagnosis", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Policy Sources (Medicare LCDs, MAC documentation, etc.)
export const policySources = pgTable("policy_sources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  mac: varchar("mac", { length: 100 }).notNull(),
  lcdId: varchar("lcd_id", { length: 50 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  url: text("url").notNull(),
  effectiveDate: timestamp("effective_date").notNull(),
  effectiveThrough: timestamp("effective_through"), // End date for policy effectiveness
  postponedDate: timestamp("postponed_date"),
  proposedDate: timestamp("proposed_date"), // When policy was proposed
  supersededBy: varchar("superseded_by", { length: 50 }), // LCD ID that supersedes this one
  versionNumber: varchar("version_number", { length: 20 }), // Policy version identifier
  sourceHash: varchar("source_hash", { length: 64 }), // SHA-256 hash for change detection
  lastVerified: timestamp("last_verified"), // Last time policy was verified against source
  changeHistory: jsonb("change_history"), // Array of change records
  policyType: varchar("policy_type", { length: 20 }).notNull().default('final'), // final, proposed
  status: varchar("status", { length: 20 }).notNull(), // current, future, proposed, superseded, postponed
  content: text("content").notNull(),
  embeddedVector: text("embedded_vector"), // Serialized vector for RAG
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Eligibility Checks
export const eligibilityChecks = pgTable("eligibility_checks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  encounterId: uuid("encounter_id").notNull().references(() => encounters.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }), // Episode-level eligibility analysis
  result: jsonb("result").notNull(), // {status, rationale, gaps}
  citations: jsonb("citations").notNull(), // Array of citation objects
  llmModel: varchar("llm_model", { length: 50 }).notNull(),
  selectedPolicyId: uuid("selected_policy_id").references(() => policySources.id, { onDelete: "set null" }), // Reference to the selected LCD policy
  selectionAudit: jsonb("selection_audit"), // Audit trail from selectBestPolicy explaining why this policy was chosen
  
  // ===============================================================================
  // PHASE 5.1: DIAGNOSIS VALIDATION RESULTS STORAGE
  // ===============================================================================
  
  // Primary diagnosis codes being validated
  primaryDiagnosis: varchar("primary_diagnosis", { length: 10 }), // ICD-10 primary diagnosis code
  secondaryDiagnoses: jsonb("secondary_diagnoses"), // Array of secondary ICD-10 codes
  
  // Diagnosis validation results from validateDiagnosisCodes()
  diagnosisValidationResult: jsonb("diagnosis_validation_result"), // Complete DiagnosisValidationResult object
  diagnosisValidationScore: integer("diagnosis_validation_score"), // 0-100 score for quick filtering
  diagnosisValidationStatus: varchar("diagnosis_validation_status", { length: 20 }).default("pending"), // passed, failed, warning, pending
  
  // Clinical necessity assessment results from assessClinicalNecessity()
  clinicalNecessityResult: jsonb("clinical_necessity_result"), // Complete ClinicalNecessityResult object
  clinicalNecessityScore: integer("clinical_necessity_score"), // 0-100 score for Medicare LCD compliance
  clinicalNecessityLevel: varchar("clinical_necessity_level", { length: 20 }), // minimal, moderate, substantial, critical
  
  // ICD-10 to wound type mapping results from mapICD10ToWoundType()
  woundTypeMappingResult: jsonb("wound_type_mapping_result"), // Complete ICD10WoundMappingResult object
  mappedWoundType: varchar("mapped_wound_type", { length: 50 }), // Primary wound type identified
  woundMappingConfidence: integer("wound_mapping_confidence"), // 0-100 confidence score
  
  // Diagnosis complexity analysis results from analyzeDiagnosisComplexity()
  diagnosisComplexityResult: jsonb("diagnosis_complexity_result"), // Complete DiagnosisComplexityResult object
  complexityScore: integer("complexity_score"), // 0-100 complexity score
  complexityLevel: varchar("complexity_level", { length: 20 }), // simple, moderate, complex, highly_complex
  
  // Diagnosis recommendations from generateDiagnosisRecommendations()
  diagnosisRecommendationsResult: jsonb("diagnosis_recommendations_result"), // Complete DiagnosisRecommendationsResult object
  recommendationsCount: integer("recommendations_count"), // Number of recommendations generated
  criticalRecommendationsCount: integer("critical_recommendations_count"), // Number of critical priority recommendations
  overallDiagnosisScore: integer("overall_diagnosis_score"), // 0-100 combined score from all validations
  
  // Audit and tracking fields for diagnosis validation
  diagnosisValidationTimestamp: timestamp("diagnosis_validation_timestamp"), // When diagnosis validation was performed
  diagnosisValidationVersion: varchar("diagnosis_validation_version", { length: 20 }).default("5.1"), // Version of validation logic used
  validationAuditTrail: jsonb("validation_audit_trail"), // Combined audit trails from all validation functions
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Documents (Pre-Determination Letters, LMNs) - Main document record
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }), // Episode-level document generation
  type: varchar("type", { length: 50 }).notNull(), // PreDetermination, LMN
  currentVersion: integer("current_version").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, pending_approval, approved, signed, rejected
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document Versions - Track all versions of each document
export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  docxUrl: varchar("docx_url", { length: 500 }),
  citations: jsonb("citations").notNull(),
  changeLog: text("change_log"), // Description of changes made
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document Approvals - Track approval workflow
export const documentApprovals = pgTable("document_approvals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => documentVersions.id, { onDelete: "cascade" }),
  approverRole: varchar("approver_role", { length: 50 }).notNull(), // Physician, Admin, Reviewer
  approverUserId: varchar("approver_user_id"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, approved, rejected
  comments: text("comments"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Electronic Signatures - Track digital signatures
export const documentSignatures = pgTable("document_signatures", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => documentVersions.id, { onDelete: "cascade" }),
  signerUserId: varchar("signer_user_id").notNull(),
  signerName: varchar("signer_name", { length: 255 }).notNull(),
  signerRole: varchar("signer_role", { length: 100 }).notNull(),
  signatureData: text("signature_data"), // Base64 encoded signature image
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  signedAt: timestamp("signed_at").defaultNow(),
});

// Recent Activities
export const recentActivities = pgTable("recent_activities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 255 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(), // Patient, Document, Encounter, etc.
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  entityName: varchar("entity_name", { length: 255 }), // Safe, non-PHI description for display
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_recent_activities_tenant_created").on(table.tenantId, table.createdAt)
]);

// Audit Logs
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), // Nullable for system-level operations
  userId: varchar("user_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(), // Surrogate key, not actual PHI
  timestamp: timestamp("timestamp").defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  previousHash: varchar("previous_hash", { length: 64 }),
  currentHash: varchar("current_hash", { length: 64 }).notNull(),
});

// File Uploads - Track uploaded files and processing status
export const fileUploads = pgTable("file_uploads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(), // PDF, DOC, etc
  fileSize: integer("file_size").notNull(), // File size in bytes
  objectPath: varchar("object_path", { length: 500 }).notNull(), // Object storage path
  status: varchar("status", { length: 20 }).notNull().default("uploaded"), // uploaded, processing, processed, data_extracted, failed, extraction_failed
  processingError: text("processing_error"), // Error message if processing failed
  extractedText: text("extracted_text"), // Raw text extracted from PDF
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// PDF Extracted Data - Structured data extracted from PDFs before creating patient/encounter records
export const pdfExtractedData = pgTable("pdf_extracted_data", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fileUploadId: uuid("file_upload_id").notNull().references(() => fileUploads.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), // User who initiated extraction
  documentType: varchar("document_type", { length: 50 }).notNull(), // registration_form, medical_record, encounter_note
  extractedText: text("extracted_text"), // Raw extracted text from PDF (encrypted)
  extractedPatientData: jsonb("extracted_patient_data"), // Patient demographics, primary & secondary insurance
  extractedEncounterData: jsonb("extracted_encounter_data"), // Encounter details, CPT codes, vascular/functional assessments
  extractionConfidence: decimal("extraction_confidence", { precision: 3, scale: 2 }), // 0.00 to 1.00 (stored as string)
  validationScore: decimal("validation_score", { precision: 3, scale: 2 }), // 0.00 to 1.00 validation score (stored as string)
  validationStatus: varchar("validation_status", { length: 20 }).notNull().default("pending"), // pending, reviewed, approved, rejected
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewComments: text("review_comments"),
  patientId: uuid("patient_id").references(() => patients.id), // Set after patient is created
  encounterId: uuid("encounter_id").references(() => encounters.id), // Set after encounter is created
  episodeId: uuid("episode_id").references(() => episodes.id), // Set when linked to episode
  isAttachedToChart: boolean("is_attached_to_chart").default(true), // PDF attachment to chart records
  createdAt: timestamp("created_at").defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

// Wound Measurement History - Comprehensive temporal tracking for Medicare LCD compliance
export const woundMeasurementHistory = pgTable("wound_measurement_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Foreign key references
  episodeId: uuid("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  encounterId: uuid("encounter_id").references(() => encounters.id, { onDelete: "cascade" }), // Optional encounter linkage
  
  // Temporal tracking for Medicare LCD requirements
  measurementTimestamp: timestamp("measurement_timestamp").notNull(),
  daysSinceEpisodeStart: integer("days_since_episode_start"), // Calculated field for timeline tracking
  
  // Core measurement fields with decimal precision for regulatory accuracy
  length: decimal("length", { precision: 8, scale: 2 }), // Length in specified units (cm/mm)
  width: decimal("width", { precision: 8, scale: 2 }), // Width in specified units
  depth: decimal("depth", { precision: 8, scale: 2 }), // Depth in specified units (optional)
  calculatedArea: decimal("calculated_area", { precision: 10, scale: 4 }), // Length × Width (cm²)
  volume: decimal("volume", { precision: 12, scale: 4 }), // Calculated when depth available (cm³)
  unitOfMeasurement: varchar("unit_of_measurement", { length: 10 }).notNull().default("cm"), // cm, mm, inches
  
  // Measurement methodology for audit trail
  measurementMethod: varchar("measurement_method", { length: 50 }).notNull(), // ruler, digital_caliper, wound_imaging, etc.
  measurementDevice: varchar("measurement_device", { length: 100 }), // Specific device/tool used
  
  // User and validation tracking
  recordedBy: varchar("recorded_by").notNull().references(() => users.id, { onDelete: "restrict" }), // Clinical staff recording
  validationStatus: varchar("validation_status", { length: 20 }).notNull().default("pending"), // validated, flagged, needs_review
  validatedBy: varchar("validated_by").references(() => users.id, { onDelete: "set null" }), // Validator user ID
  validationTimestamp: timestamp("validation_timestamp"), // When validation occurred
  
  // Progression calculation fields for Medicare LCD 20% reduction tracking
  baselineArea: decimal("baseline_area", { precision: 10, scale: 4 }), // First measurement area for comparison
  areaReductionPercentage: decimal("area_reduction_percentage", { precision: 5, scale: 2 }), // % reduction from baseline
  previousMeasurementId: uuid("previous_measurement_id"), // Previous measurement for delta - will add reference after table definition
  areaDelta: decimal("area_delta", { precision: 10, scale: 4 }), // Change from previous measurement
  healingVelocity: decimal("healing_velocity", { precision: 8, scale: 4 }), // Area reduction per day (cm²/day)
  
  // Data quality and audit fields for regulatory compliance
  dataQualityScore: integer("data_quality_score").default(100), // 0-100 quality score
  isOutlier: boolean("is_outlier").default(false), // Statistical outlier detection
  outlierReason: varchar("outlier_reason", { length: 255 }), // Reason for outlier classification
  confidenceScore: decimal("confidence_score", { precision: 3, scale: 2 }), // Measurement confidence (0.00-1.00)
  
  // Clinical context and notes
  encryptedNotes: jsonb("encrypted_notes"), // Encrypted clinical notes about measurement context
  woundCondition: varchar("wound_condition", { length: 100 }), // improving, stable, deteriorating
  photographicEvidence: boolean("photographic_evidence").default(false), // Whether photos were taken
  imageMetadata: jsonb("image_metadata"), // Encrypted image reference metadata
  
  // Environmental and patient factors affecting measurement
  patientPosition: varchar("patient_position", { length: 50 }), // supine, prone, sitting, standing
  measurementTemperature: decimal("measurement_temperature", { precision: 4, scale: 1 }), // Room temperature (°F/°C)
  edemaPresent: boolean("edema_present").default(false), // Presence of edema affecting measurement
  drainageAmount: varchar("drainage_amount", { length: 20 }), // none, minimal, moderate, copious
  
  // Audit trail timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Database integrity constraints for regulatory compliance
  unique("unique_episode_measurement_timestamp").on(table.episodeId, table.measurementTimestamp),
  foreignKey({
    columns: [table.previousMeasurementId],
    foreignColumns: [table.id],
    name: "fk_previous_measurement_self_ref"
  }),
  
  // CHECK constraints for non-negative measurement values
  check("check_length_non_negative", sql`${table.length} IS NULL OR ${table.length} >= 0`),
  check("check_width_non_negative", sql`${table.width} IS NULL OR ${table.width} >= 0`),
  check("check_depth_non_negative", sql`${table.depth} IS NULL OR ${table.depth} >= 0`),
  check("check_calculated_area_non_negative", sql`${table.calculatedArea} IS NULL OR ${table.calculatedArea} >= 0`),
  check("check_volume_non_negative", sql`${table.volume} IS NULL OR ${table.volume} >= 0`),
  check("check_baseline_area_non_negative", sql`${table.baselineArea} IS NULL OR ${table.baselineArea} >= 0`),
  
  // CHECK constraints for score ranges
  check("check_data_quality_score_range", sql`${table.dataQualityScore} >= 0 AND ${table.dataQualityScore} <= 100`),
  check("check_confidence_score_range", sql`${table.confidenceScore} IS NULL OR (${table.confidenceScore} >= 0 AND ${table.confidenceScore} <= 1)`),
  
  // Performance indexes for temporal queries and progression analysis
  index("idx_wound_measurements_episode_timestamp").on(table.episodeId, table.measurementTimestamp),
  index("idx_wound_measurements_encounter_date").on(table.encounterId, table.measurementTimestamp),
  index("idx_wound_measurements_validation_status").on(table.validationStatus),
  index("idx_wound_measurements_recorded_by").on(table.recordedBy, table.measurementTimestamp),
  index("idx_wound_measurements_progression").on(table.episodeId, table.daysSinceEpisodeStart),
  index("idx_wound_measurements_outliers").on(table.isOutlier, table.validationStatus),
  // Composite index for Medicare LCD 20% reduction analysis
  index("idx_wound_measurements_lcd_analysis").on(table.episodeId, table.areaReductionPercentage, table.daysSinceEpisodeStart)
]);

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  tenantUsers: many(tenantUsers),
  patients: many(patients),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ many }) => ({
  tenantUsers: many(tenantUsers),
  auditLogs: many(auditLogs),
  recordedMeasurements: many(woundMeasurementHistory, { relationName: "recordedByUser" }),
  validatedMeasurements: many(woundMeasurementHistory, { relationName: "validatedByUser" }),
}));

export const tenantUsersRelations = relations(tenantUsers, ({ one }) => ({
  user: one(users, { fields: [tenantUsers.userId], references: [users.id] }),
  tenant: one(tenants, { fields: [tenantUsers.tenantId], references: [tenants.id] }),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  tenant: one(tenants, { fields: [patients.tenantId], references: [tenants.id] }),
  encounters: many(encounters),
  episodes: many(episodes),
  documents: many(documents),
}));

export const encountersRelations = relations(encounters, ({ one, many }) => ({
  patient: one(patients, { fields: [encounters.patientId], references: [patients.id] }),
  episode: one(episodes, { fields: [encounters.episodeId], references: [episodes.id] }),
  eligibilityChecks: many(eligibilityChecks),
  woundMeasurements: many(woundMeasurementHistory),
}));

export const episodesRelations = relations(episodes, ({ one, many }) => ({
  patient: one(patients, { fields: [episodes.patientId], references: [patients.id] }),
  encounters: many(encounters),
  eligibilityChecks: many(eligibilityChecks),
  documents: many(documents),
  woundMeasurements: many(woundMeasurementHistory),
}));

export const policySourcesRelations = relations(policySources, ({ many }) => ({
  eligibilityChecks: many(eligibilityChecks),
}));

export const eligibilityChecksRelations = relations(eligibilityChecks, ({ one }) => ({
  encounter: one(encounters, { fields: [eligibilityChecks.encounterId], references: [encounters.id] }),
  episode: one(episodes, { fields: [eligibilityChecks.episodeId], references: [episodes.id] }),
  selectedPolicy: one(policySources, { fields: [eligibilityChecks.selectedPolicyId], references: [policySources.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  patient: one(patients, { fields: [documents.patientId], references: [patients.id] }),
  episode: one(episodes, { fields: [documents.episodeId], references: [episodes.id] }),
  versions: many(documentVersions),
  approvals: many(documentApprovals),
  signatures: many(documentSignatures),
}));

export const documentVersionsRelations = relations(documentVersions, ({ one, many }) => ({
  document: one(documents, { fields: [documentVersions.documentId], references: [documents.id] }),
  approvals: many(documentApprovals),
  signatures: many(documentSignatures),
}));

export const documentApprovalsRelations = relations(documentApprovals, ({ one }) => ({
  document: one(documents, { fields: [documentApprovals.documentId], references: [documents.id] }),
  version: one(documentVersions, { fields: [documentApprovals.versionId], references: [documentVersions.id] }),
}));

export const documentSignaturesRelations = relations(documentSignatures, ({ one }) => ({
  document: one(documents, { fields: [documentSignatures.documentId], references: [documents.id] }),
  version: one(documentVersions, { fields: [documentSignatures.versionId], references: [documentVersions.id] }),
}));

export const recentActivitiesRelations = relations(recentActivities, ({ one }) => ({
  tenant: one(tenants, { fields: [recentActivities.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [recentActivities.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

export const fileUploadsRelations = relations(fileUploads, ({ one, many }) => ({
  tenant: one(tenants, { fields: [fileUploads.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [fileUploads.userId], references: [users.id] }),
  extractedData: many(pdfExtractedData),
}));

export const pdfExtractedDataRelations = relations(pdfExtractedData, ({ one }) => ({
  fileUpload: one(fileUploads, { fields: [pdfExtractedData.fileUploadId], references: [fileUploads.id] }),
  tenant: one(tenants, { fields: [pdfExtractedData.tenantId], references: [tenants.id] }),
  reviewer: one(users, { fields: [pdfExtractedData.reviewedBy], references: [users.id] }),
  patient: one(patients, { fields: [pdfExtractedData.patientId], references: [patients.id] }),
  encounter: one(encounters, { fields: [pdfExtractedData.encounterId], references: [encounters.id] }),
  episode: one(episodes, { fields: [pdfExtractedData.episodeId], references: [episodes.id] }),
}));

// Wound Measurement History Relations - Comprehensive tracking for Medicare LCD compliance
export const woundMeasurementHistoryRelations = relations(woundMeasurementHistory, ({ one }) => ({
  episode: one(episodes, { fields: [woundMeasurementHistory.episodeId], references: [episodes.id] }),
  encounter: one(encounters, { fields: [woundMeasurementHistory.encounterId], references: [encounters.id] }),
  recordedByUser: one(users, { 
    fields: [woundMeasurementHistory.recordedBy], 
    references: [users.id],
    relationName: "recordedByUser"
  }),
  validatedByUser: one(users, { 
    fields: [woundMeasurementHistory.validatedBy], 
    references: [users.id],
    relationName: "validatedByUser"
  }),
  previousMeasurement: one(woundMeasurementHistory, { 
    fields: [woundMeasurementHistory.previousMeasurementId], 
    references: [woundMeasurementHistory.id],
    relationName: "previousMeasurement"
  }),
}));

// Enums for better type safety - declared before use in Zod schemas
export const POLICY_STATUS = {
  CURRENT: 'current',      // Currently active and effective
  FUTURE: 'future',        // Will be effective in the future
  PROPOSED: 'proposed',    // In comment period, not yet final
  SUPERSEDED: 'superseded', // Replaced by newer version
  POSTPONED: 'postponed'   // Implementation delayed
} as const;

export const POLICY_TYPE = {
  FINAL: 'final',         // Final LCD policy
  PROPOSED: 'proposed'    // Proposed LCD policy
} as const;

// File upload status enums for better type safety
export const FILE_UPLOAD_STATUS = {
  UPLOADED: 'uploaded',               // File successfully uploaded to storage
  PROCESSING: 'processing',           // File is being processed
  PROCESSED: 'processed',            // Basic processing complete (text extracted)
  DATA_EXTRACTED: 'data_extracted',  // Structured data extraction complete
  FAILED: 'failed',                  // General processing failure
  EXTRACTION_FAILED: 'extraction_failed' // Data extraction specifically failed
} as const;

// PDF validation status enums
export const PDF_VALIDATION_STATUS = {
  PENDING: 'pending',     // Awaiting review
  REVIEWED: 'reviewed',   // Under review
  APPROVED: 'approved',   // Approved for use
  REJECTED: 'rejected'    // Rejected, needs correction
} as const;

// Wound measurement validation status enums for regulatory compliance
export const WOUND_MEASUREMENT_VALIDATION_STATUS = {
  VALIDATED: 'validated',         // Measurement validated and approved
  FLAGGED: 'flagged',            // Measurement flagged for review
  NEEDS_REVIEW: 'needs_review',  // Requires clinical review
  OUTLIER: 'outlier',            // Statistical outlier detected
  PENDING: 'pending',            // Awaiting validation
  REJECTED: 'rejected'           // Measurement rejected
} as const;

// Wound measurement methods for accuracy tracking
export const WOUND_MEASUREMENT_METHODS = {
  RULER: 'ruler',                    // Traditional ruler measurement
  DIGITAL_CALIPER: 'digital_caliper', // Digital caliper measurement
  WOUND_IMAGING: 'wound_imaging',     // Digital imaging/photography
  PLANIMETRY: 'planimetry',          // Planimetric measurement
  STRUCTURED_LIGHT: 'structured_light', // 3D structured light scanning
  MOBILE_APP: 'mobile_app',          // Mobile application measurement
  ACETATE_TRACING: 'acetate_tracing'  // Acetate tracing method
} as const;

// Wound condition status for clinical assessment
export const WOUND_CONDITION = {
  IMPROVING: 'improving',           // Wound showing signs of improvement
  STABLE: 'stable',                // Wound condition stable/unchanged
  DETERIORATING: 'deteriorating'   // Wound condition worsening
} as const;

// Wound drainage amount categories for clinical documentation
export const WOUND_DRAINAGE_AMOUNT = {
  NONE: 'none',         // No drainage present
  MINIMAL: 'minimal',   // Minimal drainage
  MODERATE: 'moderate', // Moderate drainage
  COPIOUS: 'copious'    // Copious/heavy drainage
} as const;

// Patient position options for measurement context
export const PATIENT_POSITION = {
  SUPINE: 'supine',     // Patient lying on back
  PRONE: 'prone',       // Patient lying face down
  SITTING: 'sitting',   // Patient in sitting position
  STANDING: 'standing'  // Patient in standing position
} as const;

// Zod schemas for validation
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTenantUserSchema = createInsertSchema(tenantUsers).omit({ id: true, createdAt: true });
export const insertPatientSchema = createInsertSchema(patients).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEncounterSchema = createInsertSchema(encounters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEpisodeSchema = createInsertSchema(episodes).omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    episodeStartDate: z.union([z.date(), z.string()]).pipe(
      z.coerce.date()
    ),
    episodeEndDate: z.union([z.date(), z.string(), z.null()]).pipe(
      z.coerce.date().nullable()
    ).optional()
  });
export const insertPolicySourceSchema = createInsertSchema(policySources).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEligibilityCheckSchema = createInsertSchema(eligibilityChecks).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentVersionSchema = createInsertSchema(documentVersions).omit({ id: true, createdAt: true });
export const insertDocumentApprovalSchema = createInsertSchema(documentApprovals).omit({ id: true, createdAt: true });
export const insertDocumentSignatureSchema = createInsertSchema(documentSignatures).omit({ id: true, signedAt: true });
export const insertRecentActivitySchema = createInsertSchema(recentActivities).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true, currentHash: true });
// Enhanced file upload schema with status validation
export const insertFileUploadSchema = createInsertSchema(fileUploads)
  .omit({ id: true, createdAt: true, processedAt: true })
  .extend({
    status: z.enum([
      FILE_UPLOAD_STATUS.UPLOADED,
      FILE_UPLOAD_STATUS.PROCESSING,
      FILE_UPLOAD_STATUS.PROCESSED,
      FILE_UPLOAD_STATUS.DATA_EXTRACTED,
      FILE_UPLOAD_STATUS.FAILED,
      FILE_UPLOAD_STATUS.EXTRACTION_FAILED
    ]).default(FILE_UPLOAD_STATUS.UPLOADED)
  });

// Enhanced PDF extracted data schema with validation status validation  
export const insertPdfExtractedDataSchema = createInsertSchema(pdfExtractedData)
  .omit({ id: true, createdAt: true, reviewedAt: true })
  .extend({
    validationStatus: z.enum([
      PDF_VALIDATION_STATUS.PENDING,
      PDF_VALIDATION_STATUS.REVIEWED,
      PDF_VALIDATION_STATUS.APPROVED,
      PDF_VALIDATION_STATUS.REJECTED
    ]).default(PDF_VALIDATION_STATUS.PENDING),
    // Decimal fields need to be strings (Drizzle decimal type returns string)
    extractionConfidence: z.string().optional(),
    validationScore: z.string().optional()
  });

// Enhanced wound measurement history schema with comprehensive validation for Medicare LCD compliance
export const insertWoundMeasurementHistorySchema = createInsertSchema(woundMeasurementHistory)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // Timestamp handling for measurement tracking
    measurementTimestamp: z.union([z.date(), z.string()]).pipe(
      z.coerce.date()
    ),
    validationTimestamp: z.union([z.date(), z.string(), z.null()]).pipe(
      z.coerce.date().nullable()
    ).optional(),
    
    // Validation status with enum enforcement
    validationStatus: z.enum([
      WOUND_MEASUREMENT_VALIDATION_STATUS.VALIDATED,
      WOUND_MEASUREMENT_VALIDATION_STATUS.FLAGGED,
      WOUND_MEASUREMENT_VALIDATION_STATUS.NEEDS_REVIEW,
      WOUND_MEASUREMENT_VALIDATION_STATUS.OUTLIER,
      WOUND_MEASUREMENT_VALIDATION_STATUS.PENDING,
      WOUND_MEASUREMENT_VALIDATION_STATUS.REJECTED
    ]).default(WOUND_MEASUREMENT_VALIDATION_STATUS.PENDING),
    
    // Measurement method validation
    measurementMethod: z.enum([
      WOUND_MEASUREMENT_METHODS.RULER,
      WOUND_MEASUREMENT_METHODS.DIGITAL_CALIPER,
      WOUND_MEASUREMENT_METHODS.WOUND_IMAGING,
      WOUND_MEASUREMENT_METHODS.PLANIMETRY,
      WOUND_MEASUREMENT_METHODS.STRUCTURED_LIGHT,
      WOUND_MEASUREMENT_METHODS.MOBILE_APP,
      WOUND_MEASUREMENT_METHODS.ACETATE_TRACING
    ]),
    
    // Decimal fields validation (Drizzle decimal type returns string) with non-negative constraints
    length: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Length must be non-negative"
    }),
    width: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Width must be non-negative"
    }),
    depth: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Depth must be non-negative"
    }),
    calculatedArea: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Calculated area must be non-negative"
    }),
    volume: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Volume must be non-negative"
    }),
    baselineArea: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Baseline area must be non-negative"
    }),
    areaReductionPercentage: z.string().optional(),
    areaDelta: z.string().optional(),
    healingVelocity: z.string().optional(),
    confidenceScore: z.string().optional().refine((val) => !val || (parseFloat(val) >= 0 && parseFloat(val) <= 1), {
      message: "Confidence score must be between 0.00 and 1.00"
    }),
    measurementTemperature: z.string().optional(),
    
    // Data quality validation with strict range
    dataQualityScore: z.number().int().min(0).max(100).default(100),
    
    // Unit validation with enum
    unitOfMeasurement: z.enum(["cm", "mm", "inches"]).default("cm"),
    
    // Clinical context validation with new enums
    woundCondition: z.enum([
      WOUND_CONDITION.IMPROVING,
      WOUND_CONDITION.STABLE,
      WOUND_CONDITION.DETERIORATING
    ]).optional(),
    patientPosition: z.enum([
      PATIENT_POSITION.SUPINE,
      PATIENT_POSITION.PRONE,
      PATIENT_POSITION.SITTING,
      PATIENT_POSITION.STANDING
    ]).optional(),
    drainageAmount: z.enum([
      WOUND_DRAINAGE_AMOUNT.NONE,
      WOUND_DRAINAGE_AMOUNT.MINIMAL,
      WOUND_DRAINAGE_AMOUNT.MODERATE,
      WOUND_DRAINAGE_AMOUNT.COPIOUS
    ]).optional()
  });

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenantUser = z.infer<typeof insertTenantUserSchema>;
export type TenantUser = typeof tenantUsers.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patients.$inferSelect;
export type InsertEncounter = z.infer<typeof insertEncounterSchema>;
export type Encounter = typeof encounters.$inferSelect;
export type InsertEpisode = z.infer<typeof insertEpisodeSchema>;
export type Episode = typeof episodes.$inferSelect;
export type InsertPolicySource = z.infer<typeof insertPolicySourceSchema>;

export type PolicyStatus = keyof typeof POLICY_STATUS;
export type PolicyType = keyof typeof POLICY_TYPE;
export type FileUploadStatus = keyof typeof FILE_UPLOAD_STATUS;
export type PdfValidationStatus = keyof typeof PDF_VALIDATION_STATUS;
export type PolicySource = typeof policySources.$inferSelect;
export type InsertEligibilityCheck = z.infer<typeof insertEligibilityCheckSchema>;
export type EligibilityCheck = typeof eligibilityChecks.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type InsertDocumentApproval = z.infer<typeof insertDocumentApprovalSchema>;
export type DocumentApproval = typeof documentApprovals.$inferSelect;
export type InsertDocumentSignature = z.infer<typeof insertDocumentSignatureSchema>;
export type DocumentSignature = typeof documentSignatures.$inferSelect;
export type InsertRecentActivity = z.infer<typeof insertRecentActivitySchema>;
export type RecentActivity = typeof recentActivities.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertFileUpload = z.infer<typeof insertFileUploadSchema>;
export type FileUpload = typeof fileUploads.$inferSelect;
export type InsertPdfExtractedData = z.infer<typeof insertPdfExtractedDataSchema>;
export type PdfExtractedData = typeof pdfExtractedData.$inferSelect;
export type InsertWoundMeasurementHistory = z.infer<typeof insertWoundMeasurementHistorySchema>;
export type WoundMeasurementHistory = typeof woundMeasurementHistory.$inferSelect;

// Enhanced validation and measurement status types for regulatory compliance
export type WoundMeasurementValidationStatus = keyof typeof WOUND_MEASUREMENT_VALIDATION_STATUS;
export type WoundMeasurementMethod = keyof typeof WOUND_MEASUREMENT_METHODS;
export type WoundCondition = keyof typeof WOUND_CONDITION;
export type WoundDrainageAmount = keyof typeof WOUND_DRAINAGE_AMOUNT;
export type PatientPosition = keyof typeof PATIENT_POSITION;

// ================================================================================
// PHASE 3.2 PRODUCT DOCUMENTATION SYSTEM TABLES
// ================================================================================

// Product Inventory - Track all product lots and inventory management
export const productInventory = pgTable("product_inventory", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Product identification from Phase 3.1 PRODUCT_LCD_REGISTRY
  productId: varchar("product_id", { length: 100 }).notNull(), // Links to PRODUCT_LCD_REGISTRY key
  productName: varchar("product_name", { length: 255 }).notNull(),
  manufacturerName: varchar("manufacturer_name", { length: 255 }).notNull(),
  
  // Lot tracking information
  lotNumber: varchar("lot_number", { length: 100 }).notNull(),
  expirationDate: timestamp("expiration_date").notNull(),
  manufactureDate: timestamp("manufacture_date"),
  receivedDate: timestamp("received_date").notNull(),
  
  // Inventory quantities
  initialQuantity: integer("initial_quantity").notNull(),
  currentQuantity: integer("current_quantity").notNull(),
  reservedQuantity: integer("reserved_quantity").default(0),
  unitSize: decimal("unit_size", { precision: 8, scale: 2 }), // Size per unit (cm²)
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }), // Cost per unit
  
  // Storage and compliance tracking
  storageLocation: varchar("storage_location", { length: 100 }),
  storageTemperature: decimal("storage_temperature", { precision: 4, scale: 1 }), // °F
  storageHumidity: decimal("storage_humidity", { precision: 3, scale: 1 }), // %
  sterileIntegrityVerified: boolean("sterile_integrity_verified").default(true),
  
  // Chain of custody
  receivedBy: varchar("received_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  vendorName: varchar("vendor_name", { length: 255 }),
  purchaseOrderNumber: varchar("purchase_order_number", { length: 100 }),
  
  // Status tracking
  status: varchar("status", { length: 20 }).notNull().default("active"), // active, expired, recalled, depleted
  isRecalled: boolean("is_recalled").default(false),
  recallReason: text("recall_reason"),
  recallDate: timestamp("recall_date"),
  
  // Alert thresholds
  lowStockAlert: integer("low_stock_alert").default(5),
  expiryAlertDays: integer("expiry_alert_days").default(30), // Alert X days before expiry
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("unique_tenant_lot_product").on(table.tenantId, table.lotNumber, table.productId),
  index("idx_product_inventory_tenant_status").on(table.tenantId, table.status),
  index("idx_product_inventory_expiration").on(table.expirationDate),
  index("idx_product_inventory_lot_number").on(table.lotNumber),
  check("check_quantities_non_negative", sql`${table.initialQuantity} >= 0 AND ${table.currentQuantity} >= 0 AND ${table.reservedQuantity} >= 0`),
  check("check_current_quantity_constraint", sql`${table.currentQuantity} <= ${table.initialQuantity}`),
]);

// Product Applications - Track each product application to patients
export const productApplications = pgTable("product_applications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Patient and episode linkage
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  encounterId: uuid("encounter_id").references(() => encounters.id, { onDelete: "cascade" }),
  
  // Product and inventory tracking
  inventoryId: uuid("inventory_id").notNull().references(() => productInventory.id, { onDelete: "restrict" }),
  productId: varchar("product_id", { length: 100 }).notNull(), // From PRODUCT_LCD_REGISTRY
  lotNumber: varchar("lot_number", { length: 100 }).notNull(),
  
  // Application details
  applicationDate: timestamp("application_date").notNull(),
  applicationType: varchar("application_type", { length: 50 }).notNull(), // full, partial, single_patient, multi_patient
  
  // Utilization tracking for zero wastage documentation
  productSizeUsed: decimal("product_size_used", { precision: 8, scale: 2 }).notNull(), // cm² or units used
  percentageUsed: decimal("percentage_used", { precision: 5, scale: 2 }).notNull(), // % of total product used
  remainingProductDisposition: varchar("remaining_disposition", { length: 50 }), // discarded, stored, used_other_patient
  wastageAmount: decimal("wastage_amount", { precision: 8, scale: 2 }).default('0.00'),
  wastageReason: text("wastage_reason"),
  wastageJustification: text("wastage_justification"), // Clinical rationale for wastage
  
  // Clinical application details
  woundAreaCovered: decimal("wound_area_covered", { precision: 8, scale: 2 }), // cm²
  applicationTechnique: varchar("application_technique", { length: 100 }),
  encryptedProcedureNotes: jsonb("encrypted_procedure_notes"),
  
  // Provider and staff tracking
  applicantUserId: varchar("applicant_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  assistingStaff: jsonb("assisting_staff"), // Array of user IDs
  supervisingPhysician: varchar("supervising_physician").references(() => users.id, { onDelete: "set null" }),
  
  // Immediate response tracking
  immediateResponse: varchar("immediate_response", { length: 50 }), // excellent, good, fair, poor, adverse
  adverseReactions: jsonb("adverse_reactions"), // Array of adverse reaction details
  patientComfort: varchar("patient_comfort", { length: 50 }), // comfortable, mild_discomfort, moderate_pain, severe_pain
  
  // Cost and reimbursement tracking
  applicationCost: decimal("application_cost", { precision: 10, scale: 2 }),
  expectedReimbursement: decimal("expected_reimbursement", { precision: 10, scale: 2 }),
  hcpcsCodes: jsonb("hcpcs_codes"), // Array of applicable HCPCS codes
  
  // Quality and outcome tracking
  photographicEvidence: boolean("photographic_evidence").default(false),
  imageMetadata: jsonb("image_metadata"),
  qualityScore: integer("quality_score"), // 1-10 quality score
  
  // Follow-up tracking
  nextFollowUpDate: timestamp("next_follow_up_date"),
  followUpCompleted: boolean("follow_up_completed").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_product_applications_patient_episode").on(table.patientId, table.episodeId),
  index("idx_product_applications_lot_date").on(table.lotNumber, table.applicationDate),
  index("idx_product_applications_applicant").on(table.applicantUserId, table.applicationDate),
  index("idx_product_applications_followup").on(table.nextFollowUpDate, table.followUpCompleted),
  check("check_percentage_used_valid", sql`${table.percentageUsed} >= 0 AND ${table.percentageUsed} <= 100`),
  check("check_product_size_used_positive", sql`${table.productSizeUsed} > 0`),
  check("check_wastage_amount_non_negative", sql`${table.wastageAmount} >= 0`),
]);

// Product Audit Trail - Complete chain of custody tracking
export const productAuditTrail = pgTable("product_audit_trail", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Linked entities
  inventoryId: uuid("inventory_id").references(() => productInventory.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => productApplications.id, { onDelete: "cascade" }),
  
  // Audit event details
  eventType: varchar("event_type", { length: 50 }).notNull(), // received, stored, moved, applied, disposed, recalled
  eventTimestamp: timestamp("event_timestamp").notNull(),
  eventDescription: text("event_description").notNull(),
  
  // Personnel tracking
  performedBy: varchar("performed_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  witnessedBy: varchar("witnessed_by").references(() => users.id, { onDelete: "set null" }),
  authorizedBy: varchar("authorized_by").references(() => users.id, { onDelete: "set null" }),
  
  // Location and condition tracking
  fromLocation: varchar("from_location", { length: 100 }),
  toLocation: varchar("to_location", { length: 100 }),
  storageConditions: jsonb("storage_conditions"), // Temperature, humidity, etc.
  integrityCheck: boolean("integrity_check").default(true),
  integrityNotes: text("integrity_notes"),
  
  // Regulatory compliance
  complianceChecks: jsonb("compliance_checks"), // Array of compliance check results
  regulatoryNotes: text("regulatory_notes"),
  auditScore: integer("audit_score"), // 1-100 compliance score
  
  // Documentation attachments
  documentationMetadata: jsonb("documentation_metadata"), // References to supporting documents
  photographicEvidence: boolean("photographic_evidence").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_product_audit_trail_inventory").on(table.inventoryId, table.eventTimestamp),
  index("idx_product_audit_trail_application").on(table.applicationId, table.eventTimestamp),
  index("idx_product_audit_trail_event_type").on(table.eventType, table.eventTimestamp),
  index("idx_product_audit_trail_performed_by").on(table.performedBy, table.eventTimestamp),
]);

// Product Outcomes - Track clinical outcomes correlated with specific products/lots
export const productOutcomes = pgTable("product_outcomes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Application linkage
  applicationId: uuid("application_id").notNull().references(() => productApplications.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id").notNull().references(() => episodes.id, { onDelete: "cascade" }),
  
  // Outcome assessment timing
  assessmentDate: timestamp("assessment_date").notNull(),
  daysPostApplication: integer("days_post_application").notNull(),
  
  // Clinical outcome metrics
  healingResponse: varchar("healing_response", { length: 50 }), // excellent, good, fair, poor, failed
  woundAreaReduction: decimal("wound_area_reduction", { precision: 5, scale: 2 }), // % reduction
  integrationQuality: varchar("integration_quality", { length: 50 }), // complete, partial, minimal, none
  patientSatisfaction: varchar("patient_satisfaction", { length: 50 }), // very_satisfied, satisfied, neutral, dissatisfied
  
  // Adverse events tracking
  adverseEventsReported: boolean("adverse_events_reported").default(false),
  adverseEventDetails: jsonb("adverse_event_details"),
  adverseEventSeverity: varchar("adverse_event_severity", { length: 20 }), // mild, moderate, severe, life_threatening
  
  // Cost-effectiveness metrics
  costPerAreaHealed: decimal("cost_per_area_healed", { precision: 10, scale: 4 }),
  additionalTreatmentsCost: decimal("additional_treatments_cost", { precision: 10, scale: 2 }),
  overallCostEffectiveness: varchar("overall_cost_effectiveness", { length: 20 }), // excellent, good, fair, poor
  
  // Quality metrics
  productPerformanceScore: integer("product_performance_score"), // 1-100
  clinicalOutcomeScore: integer("clinical_outcome_score"), // 1-100
  overallSatisfactionScore: integer("overall_satisfaction_score"), // 1-100
  
  // Assessor information
  assessedBy: varchar("assessed_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  encryptedClinicalNotes: jsonb("encrypted_clinical_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_product_outcomes_application").on(table.applicationId, table.assessmentDate),
  index("idx_product_outcomes_patient_episode").on(table.patientId, table.episodeId),
  index("idx_product_outcomes_days_post").on(table.daysPostApplication),
  index("idx_product_outcomes_adverse_events").on(table.adverseEventsReported, table.adverseEventSeverity),
  check("check_days_post_application_positive", sql`${table.daysPostApplication} >= 0`),
  check("check_wound_area_reduction_valid", sql`${table.woundAreaReduction} >= -100 AND ${table.woundAreaReduction} <= 100`),
]);

// Product Quality Assurance - Track quality metrics and defects
export const productQualityAssurance = pgTable("product_quality_assurance", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Product and lot linkage
  inventoryId: uuid("inventory_id").references(() => productInventory.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => productApplications.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 100 }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }).notNull(),
  
  // Quality assessment details
  assessmentDate: timestamp("assessment_date").notNull(),
  assessmentType: varchar("assessment_type", { length: 50 }).notNull(), // receipt, pre_application, post_application, defect_report
  
  // Quality metrics
  visualInspectionPass: boolean("visual_inspection_pass").default(true),
  packagingIntegrity: varchar("packaging_integrity", { length: 20 }), // excellent, good, fair, poor, compromised
  sterileBarrierIntegrity: boolean("sterile_barrier_integrity").default(true),
  productConsistency: varchar("product_consistency", { length: 20 }), // consistent, minor_variation, major_variation
  
  // Defect tracking
  defectsIdentified: boolean("defects_identified").default(false),
  defectDetails: jsonb("defect_details"), // Array of defect descriptions
  defectSeverity: varchar("defect_severity", { length: 20 }), // cosmetic, minor, major, critical
  defectImpactsUsability: boolean("defect_impacts_usability").default(false),
  
  // Corrective actions
  correctiveActionsRequired: boolean("corrective_actions_required").default(false),
  correctiveActions: jsonb("corrective_actions"), // Array of actions taken
  manufacturerNotified: boolean("manufacturer_notified").default(false),
  manufacturerResponse: text("manufacturer_response"),
  
  // FDA reporting
  fdaReportRequired: boolean("fda_report_required").default(false),
  fdaReportNumber: varchar("fda_report_number", { length: 100 }),
  fdaReportDate: timestamp("fda_report_date"),
  
  // Overall quality rating
  overallQualityRating: varchar("overall_quality_rating", { length: 20 }), // excellent, good, acceptable, poor, unacceptable
  qualityScore: integer("quality_score"), // 1-100
  
  // Assessor information
  assessedBy: varchar("assessed_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  encryptedQualityNotes: jsonb("encrypted_quality_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_product_qa_inventory").on(table.inventoryId, table.assessmentDate),
  index("idx_product_qa_lot_assessment").on(table.lotNumber, table.assessmentType),
  index("idx_product_qa_defects").on(table.defectsIdentified, table.defectSeverity),
  index("idx_product_qa_fda_reports").on(table.fdaReportRequired, table.fdaReportDate),
]);

// Product Lots - Enhanced lot number and expiration tracking
export const productLots = pgTable("product_lots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Lot identification and product linkage
  inventoryId: uuid("inventory_id").notNull().references(() => productInventory.id, { onDelete: "cascade" }),
  lotNumber: varchar("lot_number", { length: 100 }).notNull(),
  productId: varchar("product_id", { length: 100 }).notNull(),
  subLotNumber: varchar("sub_lot_number", { length: 100 }), // For subdivided lots
  
  // Enhanced expiration tracking
  originalExpirationDate: timestamp("original_expiration_date").notNull(),
  adjustedExpirationDate: timestamp("adjusted_expiration_date"), // Adjusted based on storage conditions
  expirationReason: varchar("expiration_reason", { length: 100 }), // storage_conditions, recall, quality_issue
  daysUntilExpiration: integer("days_until_expiration"), // Calculated field for alerts
  
  // Lot status and condition tracking
  lotStatus: varchar("lot_status", { length: 20 }).notNull().default("active"), // active, expired, quarantined, recalled, depleted
  conditionAssessment: varchar("condition_assessment", { length: 50 }), // excellent, good, fair, poor, compromised
  lastInspectionDate: timestamp("last_inspection_date"),
  nextInspectionDue: timestamp("next_inspection_due"),
  
  // Usage and depletion tracking
  originalQuantity: integer("original_quantity").notNull(),
  remainingQuantity: integer("remaining_quantity").notNull(),
  reservedQuantity: integer("reserved_quantity").default(0), // Quantity reserved for specific patients
  depletionRate: decimal("depletion_rate", { precision: 8, scale: 4 }), // Units per day
  estimatedDepletionDate: timestamp("estimated_depletion_date"),
  
  // Environmental monitoring
  temperatureLog: jsonb("temperature_log"), // Array of {timestamp, temperature, withinRange}
  humidityLog: jsonb("humidity_log"), // Array of {timestamp, humidity, withinRange}
  environmentalAlertsCount: integer("environmental_alerts_count").default(0),
  lastEnvironmentalAlert: timestamp("last_environmental_alert"),
  
  // Regulatory and compliance
  fdaLotId: varchar("fda_lot_id", { length: 100 }), // FDA tracking identifier
  regulatoryStatus: varchar("regulatory_status", { length: 50 }).default("compliant"), // compliant, investigation, recall_pending
  complianceNotes: text("compliance_notes"),
  quarantineReason: text("quarantine_reason"),
  quarantineDate: timestamp("quarantine_date"),
  releaseFromQuarantine: timestamp("release_from_quarantine"),
  
  // Audit trail for lot management
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  lastModifiedBy: varchar("last_modified_by").references(() => users.id, { onDelete: "set null" }),
  encryptedLotNotes: jsonb("encrypted_lot_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Performance indexes for lot tracking
  index("idx_product_lots_inventory").on(table.inventoryId),
  index("idx_product_lots_lot_number").on(table.lotNumber),
  index("idx_product_lots_status").on(table.lotStatus),
  index("idx_product_lots_expiration").on(table.originalExpirationDate),
  index("idx_product_lots_depletion").on(table.estimatedDepletionDate),
  index("idx_product_lots_inspection").on(table.nextInspectionDue),
  index("idx_product_lots_tenant_status").on(table.tenantId, table.lotStatus),
  // Unique constraint for lot management
  uniqueIndex("unique_tenant_lot_sublot").on(table.tenantId, table.lotNumber, table.subLotNumber),
  
  // Check constraints for data integrity
  check("check_remaining_quantity_valid", sql`${table.remainingQuantity} >= 0 AND ${table.remainingQuantity} <= ${table.originalQuantity}`),
  check("check_reserved_quantity_valid", sql`${table.reservedQuantity} >= 0 AND ${table.reservedQuantity} <= ${table.remainingQuantity}`),
  check("check_depletion_rate_non_negative", sql`${table.depletionRate} IS NULL OR ${table.depletionRate} >= 0`),
]);

// Zero Wastage Documentation - Comprehensive wastage tracking and justification
export const zeroWastageDocumentation = pgTable("zero_wastage_documentation", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Product and application linkage
  inventoryId: uuid("inventory_id").references(() => productInventory.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => productApplications.id, { onDelete: "cascade" }),
  lotId: uuid("lot_id").references(() => productLots.id, { onDelete: "cascade" }),
  productId: varchar("product_id", { length: 100 }).notNull(),
  
  // Wastage event details
  wastageEventDate: timestamp("wastage_event_date").notNull(),
  wastageType: varchar("wastage_type", { length: 50 }).notNull(), // application_excess, expiration, contamination, damage, recall
  wastageCategory: varchar("wastage_category", { length: 50 }).notNull(), // unavoidable, preventable, regulatory
  
  // Quantity and cost tracking
  wastedQuantity: decimal("wasted_quantity", { precision: 8, scale: 2 }).notNull(),
  wastedUnits: varchar("wasted_units", { length: 20 }).notNull(), // cm², units, grams
  wastedValue: decimal("wasted_value", { precision: 10, scale: 2 }).notNull(), // Dollar value of waste
  percentageOfTotal: decimal("percentage_of_total", { precision: 5, scale: 2 }), // Percentage of total product wasted
  
  // Root cause analysis
  rootCause: varchar("root_cause", { length: 100 }).notNull(), // oversizing, poor_planning, contamination, etc.
  contributingFactors: jsonb("contributing_factors"), // Array of factors contributing to waste
  preventabilityAssessment: varchar("preventability_assessment", { length: 50 }).notNull(), // preventable, partially_preventable, unavoidable
  
  // Documentation and justification
  justification: text("justification").notNull(), // Detailed justification for the wastage
  encryptedWastageNotes: jsonb("encrypted_wastage_notes"), // Encrypted detailed notes
  evidenceDocumentation: jsonb("evidence_documentation"), // Links to photos, forms, etc.
  witnessedBy: varchar("witnessed_by").references(() => users.id, { onDelete: "set null" }), // Who witnessed the wastage
  
  // Regulatory compliance
  regulatoryReportingRequired: boolean("regulatory_reporting_required").default(false),
  reportedToRegulator: boolean("reported_to_regulator").default(false),
  regulatorReportNumber: varchar("regulator_report_number", { length: 100 }),
  regulatorReportDate: timestamp("regulator_report_date"),
  
  // Prevention and improvement
  preventionMeasures: jsonb("prevention_measures"), // Array of measures to prevent similar waste
  processImprovements: jsonb("process_improvements"), // Suggested process improvements
  trainingNeeded: boolean("training_needed").default(false),
  trainingCompleted: boolean("training_completed").default(false),
  trainingDate: timestamp("training_date"),
  
  // Cost recovery and sustainability
  costRecoveryAttempted: boolean("cost_recovery_attempted").default(false),
  costRecoveryAmount: decimal("cost_recovery_amount", { precision: 10, scale: 2 }),
  sustainabilityImpact: varchar("sustainability_impact", { length: 50 }), // high, medium, low, none
  recyclingOrDisposal: varchar("recycling_or_disposal", { length: 100 }), // How the waste was handled
  
  // Audit and approval
  documentedBy: varchar("documented_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvalDate: timestamp("approval_date"),
  auditScore: integer("audit_score"), // 1-100 score for wastage documentation quality
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Performance indexes for wastage tracking
  index("idx_zero_wastage_tenant_date").on(table.tenantId, table.wastageEventDate),
  index("idx_zero_wastage_inventory").on(table.inventoryId),
  index("idx_zero_wastage_application").on(table.applicationId),
  index("idx_zero_wastage_type").on(table.wastageType),
  index("idx_zero_wastage_category").on(table.wastageCategory),
  index("idx_zero_wastage_preventability").on(table.preventabilityAssessment),
  index("idx_zero_wastage_value").on(table.wastedValue),
  index("idx_zero_wastage_regulatory").on(table.regulatoryReportingRequired, table.reportedToRegulator),
  
  // Check constraints for data integrity
  check("check_wasted_quantity_positive", sql`${table.wastedQuantity} > 0`),
  check("check_wasted_value_positive", sql`${table.wastedValue} > 0`),
  check("check_percentage_valid", sql`${table.percentageOfTotal} IS NULL OR (${table.percentageOfTotal} >= 0 AND ${table.percentageOfTotal} <= 100)`),
  check("check_audit_score_range", sql`${table.auditScore} IS NULL OR (${table.auditScore} >= 1 AND ${table.auditScore} <= 100)`),
]);

// Product Cost Tracking - Real-time cost and effectiveness analysis
export const productCostTracking = pgTable("product_cost_tracking", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  // Product and application linkage
  inventoryId: uuid("inventory_id").references(() => productInventory.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id").references(() => productApplications.id, { onDelete: "cascade" }),
  lotId: uuid("lot_id").references(() => productLots.id, { onDelete: "cascade" }),
  patientId: uuid("patient_id").references(() => patients.id, { onDelete: "cascade" }),
  episodeId: uuid("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
  
  // Cost tracking details
  trackingPeriodStart: timestamp("tracking_period_start").notNull(),
  trackingPeriodEnd: timestamp("tracking_period_end"),
  costTrackingType: varchar("cost_tracking_type", { length: 50 }).notNull(), // per_application, per_episode, per_patient, per_outcome
  
  // Direct product costs
  productAcquisitionCost: decimal("product_acquisition_cost", { precision: 12, scale: 2 }).notNull(),
  productApplicationCost: decimal("product_application_cost", { precision: 12, scale: 2 }), // Cost per actual application
  wasteDisposalCost: decimal("waste_disposal_cost", { precision: 10, scale: 2 }),
  storageAndHandlingCost: decimal("storage_and_handling_cost", { precision: 10, scale: 2 }),
  
  // Labor and administrative costs
  clinicianTimeHours: decimal("clinician_time_hours", { precision: 6, scale: 2 }),
  clinicianHourlyRate: decimal("clinician_hourly_rate", { precision: 8, scale: 2 }),
  totalLaborCost: decimal("total_labor_cost", { precision: 12, scale: 2 }),
  administrativeCost: decimal("administrative_cost", { precision: 10, scale: 2 }),
  
  // Indirect costs
  facilityUsageCost: decimal("facility_usage_cost", { precision: 10, scale: 2 }),
  equipmentUsageCost: decimal("equipment_usage_cost", { precision: 10, scale: 2 }),
  overheadAllocation: decimal("overhead_allocation", { precision: 10, scale: 2 }),
  regulatoryComplianceCost: decimal("regulatory_compliance_cost", { precision: 10, scale: 2 }),
  
  // Revenue and reimbursement
  expectedReimbursement: decimal("expected_reimbursement", { precision: 12, scale: 2 }),
  actualReimbursement: decimal("actual_reimbursement", { precision: 12, scale: 2 }),
  reimbursementDate: timestamp("reimbursement_date"),
  reimbursementStatus: varchar("reimbursement_status", { length: 50 }), // pending, approved, denied, partial
  
  // Cost-effectiveness metrics
  totalDirectCost: decimal("total_direct_cost", { precision: 12, scale: 2 }),
  totalIndirectCost: decimal("total_indirect_cost", { precision: 12, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }).notNull(),
  costPerSquareCm: decimal("cost_per_square_cm", { precision: 10, scale: 4 }),
  costPerPercentReduction: decimal("cost_per_percent_reduction", { precision: 10, scale: 2 }),
  
  // Outcome-based cost analysis
  woundAreaHealed: decimal("wound_area_healed", { precision: 10, scale: 4 }), // cm² healed
  healingTimeReduction: integer("healing_time_reduction"), // Days of healing time reduced
  complicationsCost: decimal("complications_cost", { precision: 12, scale: 2 }), // Cost of complications
  preventedComplicationsSavings: decimal("prevented_complications_savings", { precision: 12, scale: 2 }),
  
  // Financial performance indicators
  grossMargin: decimal("gross_margin", { precision: 12, scale: 2 }),
  netProfit: decimal("net_profit", { precision: 12, scale: 2 }),
  roiPercentage: decimal("roi_percentage", { precision: 6, scale: 2 }), // Return on investment
  costEffectivenessScore: integer("cost_effectiveness_score"), // 1-100 score
  
  // Comparative analysis
  costVsBenchmark: decimal("cost_vs_benchmark", { precision: 6, scale: 2 }), // Percentage vs industry benchmark
  competitorCostComparison: decimal("competitor_cost_comparison", { precision: 6, scale: 2 }),
  historicalCostTrend: decimal("historical_cost_trend", { precision: 6, scale: 2 }), // Trend vs previous periods
  
  // Budget and variance analysis
  budgetedCost: decimal("budgeted_cost", { precision: 12, scale: 2 }),
  costVariance: decimal("cost_variance", { precision: 12, scale: 2 }),
  variancePercentage: decimal("variance_percentage", { precision: 6, scale: 2 }),
  varianceExplanation: text("variance_explanation"),
  
  // Audit and tracking
  costCalculationMethod: varchar("cost_calculation_method", { length: 100 }).notNull(),
  costDataSources: jsonb("cost_data_sources"), // Array of data sources used
  calculatedBy: varchar("calculated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  verifiedBy: varchar("verified_by").references(() => users.id, { onDelete: "set null" }),
  verificationDate: timestamp("verification_date"),
  encryptedCostNotes: jsonb("encrypted_cost_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Performance indexes for cost tracking
  index("idx_product_cost_tenant_period").on(table.tenantId, table.trackingPeriodStart),
  index("idx_product_cost_inventory").on(table.inventoryId),
  index("idx_product_cost_application").on(table.applicationId),
  index("idx_product_cost_patient").on(table.patientId),
  index("idx_product_cost_episode").on(table.episodeId),
  index("idx_product_cost_type").on(table.costTrackingType),
  index("idx_product_cost_total").on(table.totalCost),
  index("idx_product_cost_roi").on(table.roiPercentage),
  index("idx_product_cost_effectiveness").on(table.costEffectivenessScore),
  index("idx_product_cost_reimbursement").on(table.reimbursementStatus, table.reimbursementDate),
  
  // Check constraints for financial data integrity
  check("check_total_cost_positive", sql`${table.totalCost} > 0`),
  check("check_product_acquisition_cost_positive", sql`${table.productAcquisitionCost} > 0`),
  check("check_roi_percentage_reasonable", sql`${table.roiPercentage} IS NULL OR ${table.roiPercentage} >= -100`),
  check("check_cost_effectiveness_score_range", sql`${table.costEffectivenessScore} IS NULL OR (${table.costEffectivenessScore} >= 1 AND ${table.costEffectivenessScore} <= 100)`),
  check("check_variance_percentage_reasonable", sql`${table.variancePercentage} IS NULL OR (${table.variancePercentage} >= -100 AND ${table.variancePercentage} <= 100)`),
]);

// ================================================================================
// PHASE 3.2 PRODUCT TRACKING RELATIONS
// ================================================================================

export const productInventoryRelations = relations(productInventory, ({ one, many }) => ({
  tenant: one(tenants, { fields: [productInventory.tenantId], references: [tenants.id] }),
  receivedByUser: one(users, { fields: [productInventory.receivedBy], references: [users.id] }),
  applications: many(productApplications),
  auditTrailEntries: many(productAuditTrail),
  qualityAssuranceRecords: many(productQualityAssurance),
}));

export const productApplicationsRelations = relations(productApplications, ({ one, many }) => ({
  tenant: one(tenants, { fields: [productApplications.tenantId], references: [tenants.id] }),
  patient: one(patients, { fields: [productApplications.patientId], references: [patients.id] }),
  episode: one(episodes, { fields: [productApplications.episodeId], references: [episodes.id] }),
  encounter: one(encounters, { fields: [productApplications.encounterId], references: [encounters.id] }),
  inventory: one(productInventory, { fields: [productApplications.inventoryId], references: [productInventory.id] }),
  applicant: one(users, { fields: [productApplications.applicantUserId], references: [users.id] }),
  supervisingPhysician: one(users, { fields: [productApplications.supervisingPhysician], references: [users.id] }),
  outcomes: many(productOutcomes),
  auditTrailEntries: many(productAuditTrail),
  qualityAssuranceRecords: many(productQualityAssurance),
}));

export const productAuditTrailRelations = relations(productAuditTrail, ({ one }) => ({
  tenant: one(tenants, { fields: [productAuditTrail.tenantId], references: [tenants.id] }),
  inventory: one(productInventory, { fields: [productAuditTrail.inventoryId], references: [productInventory.id] }),
  application: one(productApplications, { fields: [productAuditTrail.applicationId], references: [productApplications.id] }),
  performedByUser: one(users, { fields: [productAuditTrail.performedBy], references: [users.id] }),
  witnessedByUser: one(users, { fields: [productAuditTrail.witnessedBy], references: [users.id] }),
  authorizedByUser: one(users, { fields: [productAuditTrail.authorizedBy], references: [users.id] }),
}));

export const productOutcomesRelations = relations(productOutcomes, ({ one }) => ({
  tenant: one(tenants, { fields: [productOutcomes.tenantId], references: [tenants.id] }),
  application: one(productApplications, { fields: [productOutcomes.applicationId], references: [productApplications.id] }),
  patient: one(patients, { fields: [productOutcomes.patientId], references: [patients.id] }),
  episode: one(episodes, { fields: [productOutcomes.episodeId], references: [episodes.id] }),
  assessedByUser: one(users, { fields: [productOutcomes.assessedBy], references: [users.id] }),
}));

export const productQualityAssuranceRelations = relations(productQualityAssurance, ({ one }) => ({
  tenant: one(tenants, { fields: [productQualityAssurance.tenantId], references: [tenants.id] }),
  inventory: one(productInventory, { fields: [productQualityAssurance.inventoryId], references: [productInventory.id] }),
  application: one(productApplications, { fields: [productQualityAssurance.applicationId], references: [productApplications.id] }),
  assessedByUser: one(users, { fields: [productQualityAssurance.assessedBy], references: [users.id] }),
  reviewedByUser: one(users, { fields: [productQualityAssurance.reviewedBy], references: [users.id] }),
}));

export const productLotsRelations = relations(productLots, ({ one, many }) => ({
  tenant: one(tenants, { fields: [productLots.tenantId], references: [tenants.id] }),
  inventory: one(productInventory, { fields: [productLots.inventoryId], references: [productInventory.id] }),
  createdByUser: one(users, { fields: [productLots.createdBy], references: [users.id] }),
  lastModifiedByUser: one(users, { fields: [productLots.lastModifiedBy], references: [users.id] }),
  wastageDocumentation: many(zeroWastageDocumentation),
  costTracking: many(productCostTracking),
}));

export const zeroWastageDocumentationRelations = relations(zeroWastageDocumentation, ({ one }) => ({
  tenant: one(tenants, { fields: [zeroWastageDocumentation.tenantId], references: [tenants.id] }),
  inventory: one(productInventory, { fields: [zeroWastageDocumentation.inventoryId], references: [productInventory.id] }),
  application: one(productApplications, { fields: [zeroWastageDocumentation.applicationId], references: [productApplications.id] }),
  lot: one(productLots, { fields: [zeroWastageDocumentation.lotId], references: [productLots.id] }),
  witnessedByUser: one(users, { fields: [zeroWastageDocumentation.witnessedBy], references: [users.id] }),
  documentedByUser: one(users, { fields: [zeroWastageDocumentation.documentedBy], references: [users.id] }),
  reviewedByUser: one(users, { fields: [zeroWastageDocumentation.reviewedBy], references: [users.id] }),
  approvedByUser: one(users, { fields: [zeroWastageDocumentation.approvedBy], references: [users.id] }),
}));

export const productCostTrackingRelations = relations(productCostTracking, ({ one }) => ({
  tenant: one(tenants, { fields: [productCostTracking.tenantId], references: [tenants.id] }),
  inventory: one(productInventory, { fields: [productCostTracking.inventoryId], references: [productInventory.id] }),
  application: one(productApplications, { fields: [productCostTracking.applicationId], references: [productApplications.id] }),
  lot: one(productLots, { fields: [productCostTracking.lotId], references: [productLots.id] }),
  patient: one(patients, { fields: [productCostTracking.patientId], references: [patients.id] }),
  episode: one(episodes, { fields: [productCostTracking.episodeId], references: [episodes.id] }),
  calculatedByUser: one(users, { fields: [productCostTracking.calculatedBy], references: [users.id] }),
  verifiedByUser: one(users, { fields: [productCostTracking.verifiedBy], references: [users.id] }),
}));

// ================================================================================
// PHASE 3.2 PRODUCT TRACKING ENUMS
// ================================================================================

// Product inventory status enums
export const PRODUCT_INVENTORY_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  RECALLED: 'recalled',
  DEPLETED: 'depleted',
  QUARANTINED: 'quarantined'
} as const;

// Product application types
export const PRODUCT_APPLICATION_TYPE = {
  FULL: 'full',
  PARTIAL: 'partial', 
  SINGLE_PATIENT: 'single_patient',
  MULTI_PATIENT: 'multi_patient'
} as const;

// Product disposition options for remaining product
export const PRODUCT_DISPOSITION = {
  DISCARDED: 'discarded',
  STORED: 'stored',
  USED_OTHER_PATIENT: 'used_other_patient',
  EXPIRED: 'expired',
  CONTAMINATED: 'contaminated'
} as const;

// Product response categories
export const PRODUCT_RESPONSE = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor',
  ADVERSE: 'adverse'
} as const;

// Patient comfort levels
export const PATIENT_COMFORT = {
  COMFORTABLE: 'comfortable',
  MILD_DISCOMFORT: 'mild_discomfort',
  MODERATE_PAIN: 'moderate_pain',
  SEVERE_PAIN: 'severe_pain'
} as const;

// Audit trail event types
export const AUDIT_EVENT_TYPE = {
  RECEIVED: 'received',
  STORED: 'stored',
  MOVED: 'moved',
  APPLIED: 'applied',
  DISPOSED: 'disposed',
  RECALLED: 'recalled',
  EXPIRED: 'expired',
  QUARANTINED: 'quarantined'
} as const;

// Quality assessment types
export const QUALITY_ASSESSMENT_TYPE = {
  RECEIPT: 'receipt',
  PRE_APPLICATION: 'pre_application',
  POST_APPLICATION: 'post_application',
  DEFECT_REPORT: 'defect_report',
  ROUTINE_INSPECTION: 'routine_inspection'
} as const;

// ================================================================================
// PHASE 3.2 ZOD SCHEMAS FOR VALIDATION
// ================================================================================

export const insertProductInventorySchema = createInsertSchema(productInventory)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    expirationDate: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    manufactureDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    receivedDate: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    recallDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    status: z.enum([
      PRODUCT_INVENTORY_STATUS.ACTIVE,
      PRODUCT_INVENTORY_STATUS.EXPIRED,
      PRODUCT_INVENTORY_STATUS.RECALLED,
      PRODUCT_INVENTORY_STATUS.DEPLETED,
      PRODUCT_INVENTORY_STATUS.QUARANTINED
    ]).default(PRODUCT_INVENTORY_STATUS.ACTIVE),
    // Decimal field validation
    unitSize: z.string().optional().refine((val) => !val || parseFloat(val) > 0, {
      message: "Unit size must be positive"
    }),
    unitCost: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Unit cost must be non-negative"
    }),
    storageTemperature: z.string().optional(),
    storageHumidity: z.string().optional()
  });

export const insertProductApplicationSchema = createInsertSchema(productApplications)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    applicationDate: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    nextFollowUpDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    applicationType: z.enum([
      PRODUCT_APPLICATION_TYPE.FULL,
      PRODUCT_APPLICATION_TYPE.PARTIAL,
      PRODUCT_APPLICATION_TYPE.SINGLE_PATIENT,
      PRODUCT_APPLICATION_TYPE.MULTI_PATIENT
    ]),
    remainingProductDisposition: z.enum([
      PRODUCT_DISPOSITION.DISCARDED,
      PRODUCT_DISPOSITION.STORED,
      PRODUCT_DISPOSITION.USED_OTHER_PATIENT,
      PRODUCT_DISPOSITION.EXPIRED,
      PRODUCT_DISPOSITION.CONTAMINATED
    ]).optional(),
    immediateResponse: z.enum([
      PRODUCT_RESPONSE.EXCELLENT,
      PRODUCT_RESPONSE.GOOD,
      PRODUCT_RESPONSE.FAIR,
      PRODUCT_RESPONSE.POOR,
      PRODUCT_RESPONSE.ADVERSE
    ]).optional(),
    patientComfort: z.enum([
      PATIENT_COMFORT.COMFORTABLE,
      PATIENT_COMFORT.MILD_DISCOMFORT,
      PATIENT_COMFORT.MODERATE_PAIN,
      PATIENT_COMFORT.SEVERE_PAIN
    ]).optional(),
    // Decimal field validation
    productSizeUsed: z.string().refine((val) => parseFloat(val) > 0, {
      message: "Product size used must be positive"
    }),
    percentageUsed: z.string().refine((val) => {
      const num = parseFloat(val);
      return num >= 0 && num <= 100;
    }, {
      message: "Percentage used must be between 0 and 100"
    }),
    wastageAmount: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Wastage amount must be non-negative"
    }),
    woundAreaCovered: z.string().optional(),
    applicationCost: z.string().optional(),
    expectedReimbursement: z.string().optional(),
    qualityScore: z.number().int().min(1).max(10).optional()
  });

export const insertProductAuditTrailSchema = createInsertSchema(productAuditTrail)
  .omit({ id: true, createdAt: true })
  .extend({
    eventTimestamp: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    eventType: z.enum([
      AUDIT_EVENT_TYPE.RECEIVED,
      AUDIT_EVENT_TYPE.STORED,
      AUDIT_EVENT_TYPE.MOVED,
      AUDIT_EVENT_TYPE.APPLIED,
      AUDIT_EVENT_TYPE.DISPOSED,
      AUDIT_EVENT_TYPE.RECALLED,
      AUDIT_EVENT_TYPE.EXPIRED,
      AUDIT_EVENT_TYPE.QUARANTINED
    ]),
    auditScore: z.number().int().min(1).max(100).optional()
  });

export const insertProductOutcomeSchema = createInsertSchema(productOutcomes)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    assessmentDate: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    daysPostApplication: z.number().int().min(0),
    woundAreaReduction: z.string().optional().refine((val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return num >= -100 && num <= 100;
    }, {
      message: "Wound area reduction must be between -100% and 100%"
    }),
    costPerAreaHealed: z.string().optional(),
    additionalTreatmentsCost: z.string().optional(),
    productPerformanceScore: z.number().int().min(1).max(100).optional(),
    clinicalOutcomeScore: z.number().int().min(1).max(100).optional(),
    overallSatisfactionScore: z.number().int().min(1).max(100).optional()
  });

export const insertProductQualityAssuranceSchema = createInsertSchema(productQualityAssurance)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    assessmentDate: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    fdaReportDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    assessmentType: z.enum([
      QUALITY_ASSESSMENT_TYPE.RECEIPT,
      QUALITY_ASSESSMENT_TYPE.PRE_APPLICATION,
      QUALITY_ASSESSMENT_TYPE.POST_APPLICATION,
      QUALITY_ASSESSMENT_TYPE.DEFECT_REPORT,
      QUALITY_ASSESSMENT_TYPE.ROUTINE_INSPECTION
    ]),
    qualityScore: z.number().int().min(1).max(100).optional()
  });

export const insertProductLotsSchema = createInsertSchema(productLots)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    originalExpirationDate: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    adjustedExpirationDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    lastInspectionDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    nextInspectionDue: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    estimatedDepletionDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    lastEnvironmentalAlert: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    quarantineDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    releaseFromQuarantine: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    // Validate quantity constraints
    originalQuantity: z.number().int().min(1),
    remainingQuantity: z.number().int().min(0),
    reservedQuantity: z.number().int().min(0).default(0),
    daysUntilExpiration: z.number().int().optional(),
    environmentalAlertsCount: z.number().int().min(0).default(0),
    // Decimal field validation
    depletionRate: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Depletion rate must be non-negative"
    })
  });

export const insertZeroWastageDocumentationSchema = createInsertSchema(zeroWastageDocumentation)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    wastageEventDate: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    regulatorReportDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    trainingDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    approvalDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    // Quantity and value validation
    wastedQuantity: z.string().refine((val) => parseFloat(val) > 0, {
      message: "Wasted quantity must be positive"
    }),
    wastedValue: z.string().refine((val) => parseFloat(val) > 0, {
      message: "Wasted value must be positive"
    }),
    percentageOfTotal: z.string().optional().refine((val) => {
      if (!val) return true;
      const num = parseFloat(val);
      return num >= 0 && num <= 100;
    }, {
      message: "Percentage must be between 0 and 100"
    }),
    costRecoveryAmount: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Cost recovery amount must be non-negative"
    }),
    auditScore: z.number().int().min(1).max(100).optional()
  });

export const insertProductCostTrackingSchema = createInsertSchema(productCostTracking)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    trackingPeriodStart: z.union([z.date(), z.string()]).pipe(z.coerce.date()),
    trackingPeriodEnd: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    reimbursementDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    verificationDate: z.union([z.date(), z.string(), z.null()]).pipe(z.coerce.date().nullable()).optional(),
    // Financial validation - all costs must be non-negative
    productAcquisitionCost: z.string().refine((val) => parseFloat(val) > 0, {
      message: "Product acquisition cost must be positive"
    }),
    totalCost: z.string().refine((val) => parseFloat(val) > 0, {
      message: "Total cost must be positive"
    }),
    productApplicationCost: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Application cost must be non-negative"
    }),
    wasteDisposalCost: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Waste disposal cost must be non-negative"
    }),
    storageAndHandlingCost: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Storage cost must be non-negative"
    }),
    totalLaborCost: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Labor cost must be non-negative"
    }),
    administrativeCost: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Administrative cost must be non-negative"
    }),
    // Time and rate validation
    clinicianTimeHours: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Clinician time must be non-negative"
    }),
    clinicianHourlyRate: z.string().optional().refine((val) => !val || parseFloat(val) >= 0, {
      message: "Hourly rate must be non-negative"
    }),
    // Score validation
    costEffectivenessScore: z.number().int().min(1).max(100).optional(),
    healingTimeReduction: z.number().int().optional()
  });

// ================================================================================
// PHASE 3.2 PRODUCT TRACKING TYPES
// ================================================================================

export type InsertProductInventory = z.infer<typeof insertProductInventorySchema>;
export type ProductInventory = typeof productInventory.$inferSelect;
export type InsertProductApplication = z.infer<typeof insertProductApplicationSchema>;
export type ProductApplication = typeof productApplications.$inferSelect;
export type InsertProductAuditTrail = z.infer<typeof insertProductAuditTrailSchema>;
export type ProductAuditTrail = typeof productAuditTrail.$inferSelect;
export type InsertProductOutcome = z.infer<typeof insertProductOutcomeSchema>;
export type ProductOutcome = typeof productOutcomes.$inferSelect;
export type InsertProductQualityAssurance = z.infer<typeof insertProductQualityAssuranceSchema>;
export type ProductQualityAssurance = typeof productQualityAssurance.$inferSelect;
export type InsertProductLots = z.infer<typeof insertProductLotsSchema>;
export type ProductLots = typeof productLots.$inferSelect;
export type InsertZeroWastageDocumentation = z.infer<typeof insertZeroWastageDocumentationSchema>;
export type ZeroWastageDocumentation = typeof zeroWastageDocumentation.$inferSelect;
export type InsertProductCostTracking = z.infer<typeof insertProductCostTrackingSchema>;
export type ProductCostTracking = typeof productCostTracking.$inferSelect;

// Product tracking enum types
export type ProductInventoryStatus = keyof typeof PRODUCT_INVENTORY_STATUS;
export type ProductApplicationType = keyof typeof PRODUCT_APPLICATION_TYPE;
export type ProductDisposition = keyof typeof PRODUCT_DISPOSITION;
export type ProductResponse = keyof typeof PRODUCT_RESPONSE;
export type PatientComfort = keyof typeof PATIENT_COMFORT;
export type AuditEventType = keyof typeof AUDIT_EVENT_TYPE;
export type QualityAssessmentType = keyof typeof QUALITY_ASSESSMENT_TYPE;

// Enhanced types for comprehensive patient history analysis
export type EpisodeWithFullHistory = Episode & {
  encounters: Encounter[];
  eligibilityChecks: EligibilityCheck[];
  patient: Patient;
};
