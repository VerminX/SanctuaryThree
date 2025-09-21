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

// Enhanced types for comprehensive patient history analysis
export type EpisodeWithFullHistory = Episode & {
  encounters: Encounter[];
  eligibilityChecks: EligibilityCheck[];
  patient: Patient;
};
