import { DatabaseStorage, type IStorage } from '../storage';
import { databaseResilience } from './databaseResilience';

/**
 * Resilient wrapper for database storage operations
 * Adds circuit breaker patterns, retry logic, and monitoring
 */
export class ResilientStorage implements IStorage {
  private storage: DatabaseStorage;

  constructor() {
    this.storage = new DatabaseStorage();
  }

  // User operations (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getUser(id),
      'getUser'
    );
  }

  async getUserByEmail(email: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getUserByEmail(email),
      'getUserByEmail'
    );
  }

  async upsertUser(user: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.upsertUser(user),
      'upsertUser'
    );
  }

  // Tenant operations
  async createTenant(tenant: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createTenant(tenant),
      'createTenant'
    );
  }

  async getTenant(id: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getTenant(id),
      'getTenant'
    );
  }

  async getTenantsByUser(userId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getTenantsByUser(userId),
      'getTenantsByUser'
    );
  }

  // Tenant User operations
  async addUserToTenant(tenantUser: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.addUserToTenant(tenantUser),
      'addUserToTenant'
    );
  }

  async getUserTenantRole(userId: string, tenantId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getUserTenantRole(userId, tenantId),
      'getUserTenantRole'
    );
  }

  // Patient operations
  async createPatient(patient: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createPatient(patient),
      'createPatient'
    );
  }

  async getPatient(id: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getPatient(id),
      'getPatient'
    );
  }

  async getPatientsByTenant(tenantId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getPatientsByTenant(tenantId),
      'getPatientsByTenant'
    );
  }

  async updatePatient(id: string, patient: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.updatePatient(id, patient),
      'updatePatient'
    );
  }

  // Encounter operations
  async createEncounter(encounter: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createEncounter(encounter),
      'createEncounter'
    );
  }

  async getEncounter(id: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getEncounter(id),
      'getEncounter'
    );
  }

  async getEncountersByPatient(patientId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getEncountersByPatient(patientId),
      'getEncountersByPatient'
    );
  }

  async updateEncounter(id: string, encounter: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.updateEncounter(id, encounter),
      'updateEncounter'
    );
  }

  // Policy operations
  async createPolicySource(policy: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createPolicySource(policy),
      'createPolicySource'
    );
  }

  async getPolicySource(id: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getPolicySource(id),
      'getPolicySource'
    );
  }

  async getPolicySourcesByMAC(mac: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getPolicySourcesByMAC(mac),
      'getPolicySourcesByMAC'
    );
  }

  async getActivePolicySourcesByMAC(mac: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getActivePolicySourcesByMAC(mac),
      'getActivePolicySourcesByMAC'
    );
  }

  async getPolicySourceByLCD(lcdId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getPolicySourceByLCD(lcdId),
      'getPolicySourceByLCD'
    );
  }

  async getAllPolicySources() {
    return databaseResilience.executeWithResilience(
      () => this.storage.getAllPolicySources(),
      'getAllPolicySources'
    );
  }

  async updatePolicySource(id: string, policy: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.updatePolicySource(id, policy),
      'updatePolicySource'
    );
  }

  async updatePolicySourceStatus(id: string, status: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.updatePolicySourceStatus(id, status),
      'updatePolicySourceStatus'
    );
  }

  // Enhanced policy operations for time-aware status management
  async getCurrentAndFuturePoliciesByMAC(mac: string, daysAhead?: number) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getCurrentAndFuturePoliciesByMAC(mac, daysAhead),
      'getCurrentAndFuturePoliciesByMAC'
    );
  }

  async getPoliciesByStatus(mac: string, status: string[]) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getPoliciesByStatus(mac, status),
      'getPoliciesByStatus'
    );
  }

  async updatePolicyStatusBasedOnDates() {
    return databaseResilience.executeWithResilience(
      () => this.storage.updatePolicyStatusBasedOnDates(),
      'updatePolicyStatusBasedOnDates'
    );
  }

  async supersedePolicyByLCD(lcdId: string, supersededBy: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.supersedePolicyByLCD(lcdId, supersededBy),
      'supersedePolicyByLCD'
    );
  }

  // Eligibility operations
  async createEligibilityCheck(check: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createEligibilityCheck(check),
      'createEligibilityCheck'
    );
  }

  async getEligibilityCheck(id: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getEligibilityCheck(id),
      'getEligibilityCheck'
    );
  }

  async getEligibilityChecksByEncounter(encounterId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getEligibilityChecksByEncounter(encounterId),
      'getEligibilityChecksByEncounter'
    );
  }

  async getRecentEligibilityChecksByTenant(tenantId: string, limit?: number) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getRecentEligibilityChecksByTenant(tenantId, limit),
      'getRecentEligibilityChecksByTenant'
    );
  }

  // Document operations
  async createDocument(document: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createDocument(document),
      'createDocument'
    );
  }

  async getDocument(id: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getDocument(id),
      'getDocument'
    );
  }

  async getDocumentsByPatient(patientId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getDocumentsByPatient(patientId),
      'getDocumentsByPatient'
    );
  }

  async updateDocument(id: string, document: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.updateDocument(id, document),
      'updateDocument'
    );
  }

  // Document Version Control operations
  async createDocumentVersion(version: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createDocumentVersion(version),
      'createDocumentVersion'
    );
  }

  async getDocumentVersions(documentId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getDocumentVersions(documentId),
      'getDocumentVersions'
    );
  }

  async getDocumentVersion(versionId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getDocumentVersion(versionId),
      'getDocumentVersion'
    );
  }

  async getCurrentDocumentVersion(documentId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getCurrentDocumentVersion(documentId),
      'getCurrentDocumentVersion'
    );
  }

  // Document Approval operations
  async createDocumentApproval(approval: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createDocumentApproval(approval),
      'createDocumentApproval'
    );
  }

  async getDocumentApprovals(documentId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getDocumentApprovals(documentId),
      'getDocumentApprovals'
    );
  }

  async getDocumentApproval(approvalId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getDocumentApproval(approvalId),
      'getDocumentApproval'
    );
  }

  async updateDocumentApproval(approvalId: string, updates: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.updateDocumentApproval(approvalId, updates),
      'updateDocumentApproval'
    );
  }

  async processDocumentApproval(approvalId: string, updates: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.processDocumentApproval(approvalId, updates),
      'processDocumentApproval'
    );
  }

  async getPendingApprovals(userId: string, tenantId: string, role?: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getPendingApprovals(userId, tenantId, role),
      'getPendingApprovals'
    );
  }

  // Electronic Signature operations
  async createDocumentSignature(signature: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createDocumentSignature(signature),
      'createDocumentSignature'
    );
  }

  async getDocumentSignatures(documentId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getDocumentSignatures(documentId),
      'getDocumentSignatures'
    );
  }

  async getDocumentSignature(signatureId: string) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getDocumentSignature(signatureId),
      'getDocumentSignature'
    );
  }

  // Recent Activity operations
  async createRecentActivity(activity: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createRecentActivity(activity),
      'createRecentActivity'
    );
  }

  async getRecentActivitiesByTenant(tenantId: string, limit?: number) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getRecentActivitiesByTenant(tenantId, limit),
      'getRecentActivitiesByTenant'
    );
  }

  // Audit operations
  async createAuditLog(log: any) {
    return databaseResilience.executeWithResilience(
      () => this.storage.createAuditLog(log),
      'createAuditLog'
    );
  }

  async getAuditLogsByTenant(tenantId: string, limit?: number) {
    return databaseResilience.executeWithResilience(
      () => this.storage.getAuditLogsByTenant(tenantId, limit),
      'getAuditLogsByTenant'
    );
  }

  // Health check method for the resilient storage
  async healthCheck() {
    return databaseResilience.checkHealth();
  }

  // Get resilience status
  getResilienceStatus() {
    return databaseResilience.getStatus();
  }

  // Manual circuit breaker reset (for emergency recovery)
  resetCircuitBreaker() {
    return databaseResilience.resetCircuitBreaker();
  }
}