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
  macRegion: varchar("mac_region", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Encounters
export const encounters = pgTable("encounters", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  encryptedNotes: jsonb("encrypted_notes").notNull(), // Array of encrypted encounter notes
  woundDetails: jsonb("wound_details").notNull(), // Wound type, location, measurements, duration
  conservativeCare: jsonb("conservative_care").notNull(), // Prior conservative care details
  infectionStatus: varchar("infection_status", { length: 100 }),
  comorbidities: jsonb("comorbidities"),
  attachmentMetadata: jsonb("attachment_metadata"), // Metadata for encrypted image blobs
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
  postponedDate: timestamp("postponed_date"),
  proposedDate: timestamp("proposed_date"), // When policy was proposed
  supersededBy: varchar("superseded_by", { length: 50 }), // LCD ID that supersedes this one
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
  result: jsonb("result").notNull(), // {status, rationale, gaps}
  citations: jsonb("citations").notNull(), // Array of citation objects
  llmModel: varchar("llm_model", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Documents (Pre-Determination Letters, LMNs) - Main document record
export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: uuid("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
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

// Relations
export const tenantsRelations = relations(tenants, ({ many }) => ({
  tenantUsers: many(tenantUsers),
  patients: many(patients),
  auditLogs: many(auditLogs),
}));

export const usersRelations = relations(users, ({ many }) => ({
  tenantUsers: many(tenantUsers),
  auditLogs: many(auditLogs),
}));

export const tenantUsersRelations = relations(tenantUsers, ({ one }) => ({
  user: one(users, { fields: [tenantUsers.userId], references: [users.id] }),
  tenant: one(tenants, { fields: [tenantUsers.tenantId], references: [tenants.id] }),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  tenant: one(tenants, { fields: [patients.tenantId], references: [tenants.id] }),
  encounters: many(encounters),
  documents: many(documents),
}));

export const encountersRelations = relations(encounters, ({ one, many }) => ({
  patient: one(patients, { fields: [encounters.patientId], references: [patients.id] }),
  eligibilityChecks: many(eligibilityChecks),
}));

export const eligibilityChecksRelations = relations(eligibilityChecks, ({ one }) => ({
  encounter: one(encounters, { fields: [eligibilityChecks.encounterId], references: [encounters.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  patient: one(patients, { fields: [documents.patientId], references: [patients.id] }),
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

// Zod schemas for validation
export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTenantUserSchema = createInsertSchema(tenantUsers).omit({ id: true, createdAt: true });
export const insertPatientSchema = createInsertSchema(patients).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEncounterSchema = createInsertSchema(encounters).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPolicySourceSchema = createInsertSchema(policySources).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEligibilityCheckSchema = createInsertSchema(eligibilityChecks).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDocumentVersionSchema = createInsertSchema(documentVersions).omit({ id: true, createdAt: true });
export const insertDocumentApprovalSchema = createInsertSchema(documentApprovals).omit({ id: true, createdAt: true });
export const insertDocumentSignatureSchema = createInsertSchema(documentSignatures).omit({ id: true, signedAt: true });
export const insertRecentActivitySchema = createInsertSchema(recentActivities).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true, currentHash: true });

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
export type InsertPolicySource = z.infer<typeof insertPolicySourceSchema>;

// Policy status enums for better type safety
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

export type PolicyStatus = keyof typeof POLICY_STATUS;
export type PolicyType = keyof typeof POLICY_TYPE;
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
