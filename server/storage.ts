import {
  users,
  tenants,
  tenantUsers,
  patients,
  encounters,
  policySources,
  eligibilityChecks,
  documents,
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
  type InsertAuditLog,
  type AuditLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";
import crypto from "crypto";

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
  
  // Eligibility operations
  createEligibilityCheck(check: InsertEligibilityCheck): Promise<EligibilityCheck>;
  getEligibilityCheck(id: string): Promise<EligibilityCheck | undefined>;
  getEligibilityChecksByEncounter(encounterId: string): Promise<EligibilityCheck[]>;
  
  // Document operations
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentsByPatient(patientId: string): Promise<Document[]>;
  updateDocument(id: string, document: Partial<InsertDocument>): Promise<Document>;
  
  // Audit operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsByTenant(tenantId: string, limit?: number): Promise<AuditLog[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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

  // Document operations
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

  async updateDocument(id: string, document: Partial<InsertDocument>): Promise<Document> {
    const [updatedDocument] = await db
      .update(documents)
      .set(document)
      .where(eq(documents.id, id))
      .returning();
    return updatedDocument;
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

export const storage = new DatabaseStorage();
