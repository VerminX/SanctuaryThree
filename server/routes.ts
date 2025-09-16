import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  insertTenantSchema, 
  insertPatientSchema, 
  insertEncounterSchema,
  insertEligibilityCheckSchema,
  insertDocumentSchema 
} from "@shared/schema";
import { encryptPatientData, decryptPatientData, encryptEncounterNotes, decryptEncounterNotes } from "./services/encryption";
import { analyzeEligibility, generateLetterContent } from "./services/openai";
import { buildRAGContext, initializePolicyDatabase } from "./services/ragService";
import { generateDocument } from "./services/documentGenerator";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Initialize policy database on startup
  await initializePolicyDatabase();

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's tenants and roles
      const tenants = await storage.getTenantsByUser(userId);
      
      res.json({
        ...user,
        tenants: tenants
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Tenant routes
  app.post('/api/tenants', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const tenantData = insertTenantSchema.parse(req.body);
      
      const tenant = await storage.createTenant(tenantData);
      
      // Add user as admin of the new tenant
      await storage.addUserToTenant({
        userId,
        tenantId: tenant.id,
        role: 'Admin',
        isActive: true,
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: tenant.id,
        userId,
        action: 'CREATE_TENANT',
        entity: 'Tenant',
        entityId: tenant.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(tenant);
    } catch (error) {
      console.error("Error creating tenant:", error);
      res.status(500).json({ message: "Failed to create tenant" });
    }
  });

  app.get('/api/tenants/:tenantId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      res.json(tenant);
    } catch (error) {
      console.error("Error fetching tenant:", error);
      res.status(500).json({ message: "Failed to fetch tenant" });
    }
  });

  // Patient routes
  app.post('/api/tenants/:tenantId/patients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const patientDataSchema = insertPatientSchema.extend({
        firstName: z.string(),
        lastName: z.string(),
        dob: z.string().optional(),
      });
      
      const { firstName, lastName, dob, ...patientData } = patientDataSchema.parse({
        ...req.body,
        tenantId
      });

      // Encrypt PHI
      const encryptedData = encryptPatientData(firstName, lastName, dob);
      
      const patient = await storage.createPatient({
        ...patientData,
        ...encryptedData,
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId,
        userId,
        action: 'CREATE_PATIENT',
        entity: 'Patient',
        entityId: patient.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Return patient data with decrypted info for display
      const decryptedData = decryptPatientData(patient);
      res.json({
        ...patient,
        ...decryptedData,
      });
    } catch (error) {
      console.error("Error creating patient:", error);
      res.status(500).json({ message: "Failed to create patient" });
    }
  });

  app.get('/api/tenants/:tenantId/patients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const patients = await storage.getPatientsByTenant(tenantId);
      
      // Decrypt patient data for display
      const decryptedPatients = patients.map(patient => ({
        ...patient,
        ...decryptPatientData(patient),
      }));

      // Log audit event
      await storage.createAuditLog({
        tenantId,
        userId,
        action: 'VIEW_PATIENTS',
        entity: 'Patient',
        entityId: 'LIST',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(decryptedPatients);
    } catch (error) {
      console.error("Error fetching patients:", error);
      res.status(500).json({ message: "Failed to fetch patients" });
    }
  });

  app.get('/api/patients/:patientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { patientId } = req.params;
      
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'VIEW_PATIENT',
        entity: 'Patient',
        entityId: patient.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Return patient data with decrypted info
      const decryptedData = decryptPatientData(patient);
      res.json({
        ...patient,
        ...decryptedData,
      });
    } catch (error) {
      console.error("Error fetching patient:", error);
      res.status(500).json({ message: "Failed to fetch patient" });
    }
  });

  // Encounter routes
  app.post('/api/patients/:patientId/encounters', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { patientId } = req.params;
      
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const encounterDataSchema = insertEncounterSchema.extend({
        notes: z.array(z.string()),
      });
      
      const { notes, ...encounterData } = encounterDataSchema.parse({
        ...req.body,
        patientId
      });

      // Encrypt encounter notes
      const encryptedNotes = encryptEncounterNotes(notes);
      
      const encounter = await storage.createEncounter({
        ...encounterData,
        encryptedNotes,
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'CREATE_ENCOUNTER',
        entity: 'Encounter',
        entityId: encounter.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json({
        ...encounter,
        notes: decryptEncounterNotes(encounter.encryptedNotes as string[]),
      });
    } catch (error) {
      console.error("Error creating encounter:", error);
      res.status(500).json({ message: "Failed to create encounter" });
    }
  });

  app.get('/api/patients/:patientId/encounters', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { patientId } = req.params;
      
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const encounters = await storage.getEncountersByPatient(patientId);
      
      // Decrypt encounter notes
      const decryptedEncounters = encounters.map(encounter => ({
        ...encounter,
        notes: decryptEncounterNotes(encounter.encryptedNotes as string[]),
      }));

      res.json(decryptedEncounters);
    } catch (error) {
      console.error("Error fetching encounters:", error);
      res.status(500).json({ message: "Failed to fetch encounters" });
    }
  });

  // Eligibility analysis routes
  app.post('/api/encounters/:encounterId/analyze-eligibility', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterId } = req.params;
      
      const encounter = await storage.getEncounter(encounterId);
      if (!encounter) {
        return res.status(404).json({ message: "Encounter not found" });
      }

      const patient = await storage.getPatient(encounter.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Build RAG context from policy database
      const ragContext = await buildRAGContext(
        patient.macRegion || 'default',
        (encounter.woundDetails as any)?.type || 'DFU'
      );

      // Decrypt encounter notes for analysis
      const decryptedNotes = decryptEncounterNotes(encounter.encryptedNotes as string[]);

      // Perform AI eligibility analysis
      const analysisResult = await analyzeEligibility({
        encounterNotes: decryptedNotes,
        woundDetails: encounter.woundDetails,
        conservativeCare: encounter.conservativeCare,
        patientInfo: {
          payerType: patient.payerType,
          macRegion: patient.macRegion || 'default',
        },
        policyContext: ragContext.content,
      });

      // Store eligibility check result
      const eligibilityCheck = await storage.createEligibilityCheck({
        encounterId: encounter.id,
        result: analysisResult,
        citations: [...ragContext.citations, ...analysisResult.citations],
        llmModel: 'gpt-5',
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'AI_ELIGIBILITY_ANALYSIS',
        entity: 'EligibilityCheck',
        entityId: eligibilityCheck.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(eligibilityCheck);
    } catch (error) {
      console.error("Error analyzing eligibility:", error);
      res.status(500).json({ message: "Failed to analyze eligibility" });
    }
  });

  // Document generation routes
  app.post('/api/patients/:patientId/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { patientId } = req.params;
      const { type, eligibilityCheckId } = req.body;
      
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const eligibilityCheck = await storage.getEligibilityCheck(eligibilityCheckId);
      if (!eligibilityCheck) {
        return res.status(404).json({ message: "Eligibility check not found" });
      }

      const tenant = await storage.getTenant(patient.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Generate letter content using AI
      const decryptedPatientData = decryptPatientData(patient);
      const letterContent = await generateLetterContent(
        type,
        decryptedPatientData,
        eligibilityCheck.result as any,
        tenant
      );

      // Generate document files
      const generatedDocument = await generateDocument({
        type,
        patientId,
        tenantId: patient.tenantId,
        eligibilityCheckId,
        content: letterContent,
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'GENERATE_DOCUMENT',
        entity: 'Document',
        entityId: generatedDocument.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(generatedDocument);
    } catch (error) {
      console.error("Error generating document:", error);
      res.status(500).json({ message: "Failed to generate document" });
    }
  });

  app.get('/api/patients/:patientId/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { patientId } = req.params;
      
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const documents = await storage.getDocumentsByPatient(patientId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Policy management routes
  app.get('/api/tenants/:tenantId/policies', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      const policies = await storage.getPolicySourcesByMAC(tenant.macRegion);
      res.json(policies);
    } catch (error) {
      console.error("Error fetching policies:", error);
      res.status(500).json({ message: "Failed to fetch policies" });
    }
  });

  // Audit log routes
  app.get('/api/tenants/:tenantId/audit-logs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has admin access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole || userTenantRole.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 100;
      const auditLogs = await storage.getAuditLogsByTenant(tenantId, limit);
      
      res.json(auditLogs);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  // Dashboard stats route
  app.get('/api/tenants/:tenantId/dashboard-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const patients = await storage.getPatientsByTenant(tenantId);
      const recentAuditLogs = await storage.getAuditLogsByTenant(tenantId, 10);
      
      // Calculate basic stats
      const stats = {
        activePatients: patients.length,
        pendingEligibility: 0, // Would calculate based on eligibility checks
        generatedLetters: 0,   // Would calculate based on documents
        policyUpdates: 0,      // Would calculate based on recent policy changes
        recentActivity: recentAuditLogs.slice(0, 5),
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
