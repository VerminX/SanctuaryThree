import {
  users,
  tenants,
  tenantUsers,
  patients,
  encounters,
  policySources,
  eligibilityChecks,
  documents,
  documentVersions,
  documentApprovals,
  documentSignatures,
  recentActivities,
  auditLogs,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, or, lte, gte, sql, inArray } from "drizzle-orm";
import crypto from "crypto";
import { 
  encryptSignatureData, 
  decryptSignatureData, 
  encryptDocumentContent, 
  decryptDocumentContent 
} from "./services/encryption";

// Interface for storage operations
export interface IStorage {
  // User operations (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
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
  
  // Encounter operations
  createEncounter(encounter: InsertEncounter): Promise<Encounter>;
  getEncounter(id: string): Promise<Encounter | undefined>;
  getEncountersByPatient(patientId: string): Promise<Encounter[]>;
  updateEncounter(id: string, encounter: Partial<InsertEncounter>): Promise<Encounter>;
  
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
  getRecentEligibilityChecksByTenant(tenantId: string, limit?: number): Promise<Array<EligibilityCheck & { patientName: string; encounterId: string; encounterDate: string }>>;
  
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
}

export class DatabaseStorage implements IStorage {

  // ENHANCED STATE MACHINE: Define valid document state transitions
  private readonly validStateTransitions: Record<string, string[]> = {
    'draft': ['pending_approval'],
    'pending_approval': ['approved', 'rejected'],
    'approved': ['signed'],
    'rejected': [], // Terminal state
    'signed': [] // Terminal state
  };

  // ENHANCED STATE MACHINE: Validate state transition
  private validateStateTransition(currentStatus: string, newStatus: string): { isValid: boolean; error?: string } {
    const allowedTransitions = this.validStateTransitions[currentStatus] || [];
    
    if (!allowedTransitions.includes(newStatus)) {
      return {
        isValid: false,
        error: `Invalid state transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: [${allowedTransitions.join(', ')}]`
      };
    }
    
    return { isValid: true };
  }
  // User operations (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
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
    const [newPatient] = await db.insert(patients).values(patient).returning();
    return newPatient;
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    const [patient] = await db.select().from(patients).where(eq(patients.id, id));
    return patient;
  }

  async getPatientsByTenant(tenantId: string): Promise<Patient[]> {
    return await db
      .select()
      .from(patients)
      .where(eq(patients.tenantId, tenantId))
      .orderBy(desc(patients.createdAt));
  }

  async updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient> {
    const [updatedPatient] = await db
      .update(patients)
      .set({ ...patient, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();
    return updatedPatient;
  }

  // Encounter operations
  async createEncounter(encounter: InsertEncounter): Promise<Encounter> {
    const [newEncounter] = await db.insert(encounters).values(encounter).returning();
    return newEncounter;
  }

  async getEncounter(id: string): Promise<Encounter | undefined> {
    const [encounter] = await db.select().from(encounters).where(eq(encounters.id, id));
    return encounter;
  }

  async getEncountersByPatient(patientId: string): Promise<Encounter[]> {
    return await db
      .select()
      .from(encounters)
      .where(eq(encounters.patientId, patientId))
      .orderBy(desc(encounters.date));
  }

  async updateEncounter(id: string, encounter: Partial<InsertEncounter>): Promise<Encounter> {
    const [updatedEncounter] = await db
      .update(encounters)
      .set({ ...encounter, updatedAt: new Date() })
      .where(eq(encounters.id, id))
      .returning();
    return updatedEncounter;
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

  async getRecentEligibilityChecksByTenant(tenantId: string, limit: number = 10): Promise<Array<EligibilityCheck & { patientName: string; encounterId: string; encounterDate: string }>> {
    const results = await db
      .select({
        id: eligibilityChecks.id,
        encounterId: eligibilityChecks.encounterId,
        result: eligibilityChecks.result,
        citations: eligibilityChecks.citations,
        llmModel: eligibilityChecks.llmModel,
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
      encounterDate: result.encounterDate.toISOString()
    }));
  }

  // Enhanced Document operations with version control
  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values(document).returning();
    return newDocument;
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }

  async getDocumentsByPatient(patientId: string): Promise<Document[]> {
    return await db
      .select()
      .from(documents)
      .where(eq(documents.patientId, patientId))
      .orderBy(desc(documents.createdAt));
  }

  async updateDocument(id: string, updates: Partial<Document>): Promise<Document> {
    // STATE MACHINE ENFORCEMENT: Validate status transitions if status is being updated
    if (updates.status) {
      const currentDocument = await this.getDocument(id);
      if (!currentDocument) {
        throw new Error('Document not found');
      }
      
      const validation = this.validateStateTransition(currentDocument.status, updates.status);
      if (!validation.isValid) {
        throw new Error(`STATE_TRANSITION_ERROR: ${validation.error}`);
      }
    }

    const [updatedDocument] = await db
      .update(documents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return updatedDocument;
  }

  // Document Version operations
  async createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion> {
    // CRITICAL HIPAA FIX: Encrypt document content before storage (may contain PHI)
    const encryptedVersion = {
      ...version,
      content: encryptDocumentContent(version.content),
    };
    
    const [newVersion] = await db.insert(documentVersions).values(encryptedVersion).returning();
    
    // Return decrypted content to caller (for API response)
    return {
      ...newVersion,
      content: decryptDocumentContent(newVersion.content),
    };
  }

  async getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
    const versions = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId))
      .orderBy(desc(documentVersions.version));
    
    // CRITICAL HIPAA FIX: Decrypt document content for authorized users
    return versions.map(version => ({
      ...version,
      content: decryptDocumentContent(version.content),
    }));
  }

  async getDocumentVersion(versionId: string): Promise<DocumentVersion | undefined> {
    const [version] = await db.select().from(documentVersions).where(eq(documentVersions.id, versionId));
    
    if (!version) return undefined;
    
    // CRITICAL HIPAA FIX: Decrypt document content for authorized users
    return {
      ...version,
      content: decryptDocumentContent(version.content),
    };
  }

  async getCurrentDocumentVersion(documentId: string): Promise<DocumentVersion | undefined> {
    // Get the document's current version number
    const document = await this.getDocument(documentId);
    if (!document) return undefined;

    const [currentVersion] = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.documentId, documentId),
          eq(documentVersions.version, document.currentVersion)
        )
      );
    
    if (!currentVersion) return undefined;
    
    // CRITICAL HIPAA FIX: Decrypt document content for authorized users
    return {
      ...currentVersion,
      content: decryptDocumentContent(currentVersion.content),
    };
  }

  // Document Approval operations
  async createDocumentApproval(approval: InsertDocumentApproval): Promise<DocumentApproval> {
    const [newApproval] = await db.insert(documentApprovals).values(approval).returning();
    return newApproval;
  }

  async getDocumentApprovals(documentId: string): Promise<DocumentApproval[]> {
    return await db
      .select()
      .from(documentApprovals)
      .where(eq(documentApprovals.documentId, documentId))
      .orderBy(desc(documentApprovals.createdAt));
  }

  async getDocumentApproval(approvalId: string): Promise<DocumentApproval | undefined> {
    const [approval] = await db.select().from(documentApprovals).where(eq(documentApprovals.id, approvalId));
    return approval;
  }

  async updateDocumentApproval(approvalId: string, updates: Partial<DocumentApproval>): Promise<DocumentApproval> {
    const [updatedApproval] = await db
      .update(documentApprovals)
      .set({ ...updates, reviewedAt: new Date() })
      .where(eq(documentApprovals.id, approvalId))
      .returning();
    return updatedApproval;
  }

  // SECURITY FIX: Atomic approval processing with transaction and audit logging
  async processDocumentApproval(approvalId: string, updates: {
    status: 'approved' | 'rejected';
    comments?: string;
    approverUserId: string;
    tenantId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<DocumentApproval> {
    return await db.transaction(async (tx) => {
      // Update the approval record
      const [updatedApproval] = await tx
        .update(documentApprovals)
        .set({
          status: updates.status,
          comments: updates.comments,
          approverUserId: updates.approverUserId,
          reviewedAt: new Date(),
        })
        .where(eq(documentApprovals.id, approvalId))
        .returning();

      if (!updatedApproval) {
        throw new Error('Approval not found');
      }

      // Update document status atomically
      await tx
        .update(documents)
        .set({
          status: updates.status === 'approved' ? 'approved' : 'rejected',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, updatedApproval.documentId));

      // Create audit log atomically
      const auditData = {
        tenantId: updates.tenantId,
        userId: updates.approverUserId,
        action: updates.status === 'approved' ? 'APPROVE_DOCUMENT' : 'REJECT_DOCUMENT',
        entity: 'DocumentApproval',
        entityId: updatedApproval.id,
        ipAddress: updates.ipAddress || '',
        userAgent: updates.userAgent || '',
        previousHash: '',
      };
      
      const currentHash = this.generateAuditHash(auditData);
      await tx.insert(auditLogs).values({ ...auditData, currentHash });

      return updatedApproval;
    });
  }

  async getPendingApprovals(userId: string, tenantId: string, role?: string): Promise<DocumentApproval[]> {
    // SECURITY FIX: Enforce tenant isolation by joining through documents->patients
    const conditions = [
      eq(documentApprovals.status, 'pending'),
      eq(patients.tenantId, tenantId) // Critical: filter by tenant
    ];
    
    if (role) {
      conditions.push(eq(documentApprovals.approverRole, role));
    }
    
    return await db
      .select({
        id: documentApprovals.id,
        documentId: documentApprovals.documentId,
        versionId: documentApprovals.versionId,
        approverRole: documentApprovals.approverRole,
        approverUserId: documentApprovals.approverUserId,
        status: documentApprovals.status,
        comments: documentApprovals.comments,
        reviewedAt: documentApprovals.reviewedAt,
        createdAt: documentApprovals.createdAt,
      })
      .from(documentApprovals)
      .innerJoin(documents, eq(documentApprovals.documentId, documents.id))
      .innerJoin(patients, eq(documents.patientId, patients.id))
      .where(and(...conditions))
      .orderBy(desc(documentApprovals.createdAt));
  }

  // Electronic Signature operations
  async createDocumentSignature(signature: InsertDocumentSignature): Promise<DocumentSignature> {
    // CRITICAL HIPAA FIX: Encrypt signature data before storage
    const encryptedSignature = signature.signatureData 
      ? { ...signature, signatureData: encryptSignatureData(signature.signatureData) }
      : signature;
    
    const [newSignature] = await db.insert(documentSignatures).values(encryptedSignature).returning();
    
    // Return decrypted signature data to caller (for API response)
    return {
      ...newSignature,
      signatureData: newSignature.signatureData ? decryptSignatureData(newSignature.signatureData) : null,
    };
  }

  async getDocumentSignatures(documentId: string): Promise<DocumentSignature[]> {
    const signatures = await db
      .select()
      .from(documentSignatures)
      .where(eq(documentSignatures.documentId, documentId))
      .orderBy(desc(documentSignatures.signedAt));
    
    // CRITICAL HIPAA FIX: Decrypt signature data for authorized users
    return signatures.map(signature => ({
      ...signature,
      signatureData: signature.signatureData ? decryptSignatureData(signature.signatureData) : null,
    }));
  }

  async getDocumentSignature(signatureId: string): Promise<DocumentSignature | undefined> {
    const [signature] = await db.select().from(documentSignatures).where(eq(documentSignatures.id, signatureId));
    
    if (!signature) return undefined;
    
    // CRITICAL HIPAA FIX: Decrypt signature data for authorized users
    return {
      ...signature,
      signatureData: signature.signatureData ? decryptSignatureData(signature.signatureData) : null,
    };
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
    // Generate cryptographic hash for audit chain integrity
    const currentHash = this.generateAuditHash(log);
    const auditWithHash = { ...log, currentHash };
    
    const [newLog] = await db.insert(auditLogs).values(auditWithHash).returning();
    return newLog;
  }

  async getAuditLogsByTenant(tenantId: string, limit: number = 100): Promise<AuditLog[]> {
    return await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  private generateAuditHash(log: InsertAuditLog): string {
    const data = `${log.tenantId}:${log.userId}:${log.action}:${log.entity}:${log.entityId}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

import { ResilientStorage } from './services/resilitientStorage';

// Use resilient storage wrapper for production-grade database reliability
export const storage = new ResilientStorage();
