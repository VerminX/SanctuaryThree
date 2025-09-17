import type { Express } from "express";
import { createServer, type Server } from "http";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { 
  insertTenantSchema, 
  insertPatientSchema, 
  insertEncounterSchema,
  insertEligibilityCheckSchema,
  insertDocumentSchema,
  insertDocumentVersionSchema,
  insertDocumentSignatureSchema
} from "@shared/schema";
import { encryptPatientData, decryptPatientData, safeDecryptPatientData, encryptEncounterNotes, decryptEncounterNotes } from "./services/encryption";
import { buildRAGContext } from "./services/ragService";
import { generateDocument } from "./services/documentGenerator";
import { performPolicyUpdate, performPolicyUpdateForMAC, scheduledPolicyUpdate, getPolicyUpdateStatus } from "./services/policyUpdater";
import { z } from "zod";

// Helper function to track user activity (HIPAA-compliant, no PHI in descriptions)
async function trackActivity(
  tenantId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  entityName?: string
): Promise<void> {
  try {
    await storage.createRecentActivity({
      tenantId,
      userId,
      action,
      entityType,
      entityId,
      entityName: entityName || `${entityType} ${entityId.substring(0, 8)}...`
    });
  } catch (error) {
    console.error('Failed to track activity:', error);
    // Don't throw - activity tracking shouldn't break main functionality
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Policy data is now managed by the scheduled CMS fetcher


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

      // Schema for validating request data (plain text from frontend)
      const patientRequestSchema = z.object({
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        mrn: z.string().min(1, "MRN is required"),
        dob: z.string().optional(),
        payerType: z.enum(["Original Medicare", "Medicare Advantage"]),
        planName: z.string().optional(),
        macRegion: z.string().optional(),
      });
      
      const { firstName, lastName, dob, ...otherData } = patientRequestSchema.parse(req.body);

      // Encrypt PHI
      const encryptedData = encryptPatientData(firstName, lastName, dob);
      
      const patient = await storage.createPatient({
        ...otherData,
        ...encryptedData,
        tenantId,
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

      // Track recent activity
      await trackActivity(tenantId, userId, 'Created new patient', 'Patient', patient.id, 'New Patient');

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
      
      // RESILIENT DECRYPTION: Handle corrupted patient records gracefully
      const decryptionResults = patients.map(patient => safeDecryptPatientData(patient));
      const decryptedPatients = decryptionResults.map(result => result.patientData);
      const failedDecryptions = decryptionResults.filter(result => result.decryptionError);
      
      // Log summary of decryption issues for admin review
      if (failedDecryptions.length > 0) {
        console.warn(`PATIENT DECRYPTION WARNING: ${failedDecryptions.length} out of ${patients.length} patients have corrupted encrypted data:`, 
          failedDecryptions.map(r => ({ id: r.patientData.id }))
        );
      }

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

      // RESILIENT DECRYPTION: Handle corrupted patient data gracefully  
      const decryptionResult = safeDecryptPatientData(patient);
      
      if (decryptionResult.decryptionError) {
        console.error(`Individual patient access failed for patient ${patientId}: corrupted encrypted data`);
        return res.status(422).json({ 
          message: "Patient data is corrupted and cannot be decrypted. Please contact support.", 
          patientId,
          corruptedData: true 
        });
      }
      
      res.json(decryptionResult.patientData);
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

      // Custom validation schema that handles string dates and plain notes
      const encounterRequestSchema = z.object({
        date: z.string().or(z.date()).transform((val) => {
          return typeof val === 'string' ? new Date(val) : val;
        }),
        notes: z.array(z.string()),
        woundDetails: z.any(), // JSONB field
        conservativeCare: z.any(), // JSONB field
        infectionStatus: z.string().optional(),
        comorbidities: z.any().optional(), // JSONB field
        attachmentMetadata: z.any().optional(), // JSONB field
      });
      
      const { notes, ...encounterData } = encounterRequestSchema.parse(req.body);
      
      // Add patientId to the validated data
      const completeEncounterData = {
        ...encounterData,
        patientId
      };

      // Encrypt encounter notes
      const encryptedNotes = encryptEncounterNotes(notes);
      
      const encounter = await storage.createEncounter({
        patientId: completeEncounterData.patientId,
        date: completeEncounterData.date,
        encryptedNotes,
        woundDetails: completeEncounterData.woundDetails || {},
        conservativeCare: completeEncounterData.conservativeCare || {},
        infectionStatus: completeEncounterData.infectionStatus,
        comorbidities: completeEncounterData.comorbidities,
        attachmentMetadata: completeEncounterData.attachmentMetadata,
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

      // Track recent activity
      await trackActivity(patient.tenantId, userId, 'Created new encounter', 'Encounter', encounter.id, 'Patient Encounter');

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

  // Update encounter
  app.put('/api/encounters/:encounterId', isAuthenticated, async (req: any, res) => {
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

      // Custom validation schema that handles string dates and plain notes
      const encounterRequestSchema = z.object({
        date: z.string().or(z.date()).transform((val) => {
          return typeof val === 'string' ? new Date(val) : val;
        }),
        notes: z.array(z.string()),
        woundDetails: z.any(), // JSONB field
        conservativeCare: z.any(), // JSONB field
        infectionStatus: z.string().optional(),
        comorbidities: z.any().optional(), // JSONB field
        attachmentMetadata: z.any().optional(), // JSONB field
      });
      
      const { notes, ...encounterData } = encounterRequestSchema.parse(req.body);
      
      // Encrypt encounter notes
      const encryptedNotes = encryptEncounterNotes(notes);
      
      // Update encounter
      const updatedEncounter = await storage.updateEncounter(encounterId, {
        ...encounterData,
        encryptedNotes,
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'UPDATE_ENCOUNTER',
        entity: 'Encounter',
        entityId: encounterId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Track recent activity
      await trackActivity(patient.tenantId, userId, 'Updated encounter', 'Encounter', encounterId, 'Patient Encounter');

      res.json({
        ...updatedEncounter,
        notes: decryptEncounterNotes(updatedEncounter.encryptedNotes as string[]),
      });
    } catch (error) {
      console.error("Error updating encounter:", error);
      res.status(500).json({ message: "Failed to update encounter" });
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
      const { analyzeEligibility } = await import('./services/openai');
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
        llmModel: 'gpt-4o-mini',
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

  // Get eligibility checks for an encounter
  app.get('/api/encounters/:encounterId/eligibility-checks', isAuthenticated, async (req: any, res) => {
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

      const eligibilityChecks = await storage.getEligibilityChecksByEncounter(encounterId);
      res.json(eligibilityChecks);
    } catch (error) {
      console.error("Error fetching eligibility checks:", error);
      res.status(500).json({ message: "Failed to fetch eligibility checks" });
    }
  });

  // Get recent eligibility checks for current tenant
  app.get('/api/recent-eligibility-checks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 10;

      // Get user's tenants
      const tenants = await storage.getTenantsByUser(userId);
      if (tenants.length === 0) {
        return res.status(403).json({ message: "No tenant access" });
      }

      // Use the first tenant (in real app, might need to handle multiple tenants)
      const currentTenant = tenants[0];

      const recentChecks = await storage.getRecentEligibilityChecksByTenant(currentTenant.id, limit);
      res.json(recentChecks);
    } catch (error) {
      console.error("Error fetching recent eligibility checks:", error);
      res.status(500).json({ message: "Failed to fetch recent eligibility checks" });
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
      const { generateLetterContent } = await import('./services/openai');
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

      // Track recent activity
      await trackActivity(patient.tenantId, userId, `Generated ${type} document`, 'Document', generatedDocument.id, `${type} Document`);

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

      // AUDIT LOGGING: Track document access for regulatory compliance
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'VIEW_DOCUMENTS',
        entity: 'Document',
        entityId: patientId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Document export routes
  app.get('/api/documents/:documentId/export/:format', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentId, format } = req.params;
      
      if (!['PDF', 'DOCX'].includes(format)) {
        return res.status(400).json({ message: "Invalid export format. Use PDF or DOCX." });
      }

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const patient = await storage.getPatient(document.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get current document version
      const currentVersion = await storage.getCurrentDocumentVersion(documentId);
      if (!currentVersion) {
        return res.status(404).json({ message: "No document version found" });
      }

      // Get file path based on format
      const filePath = format === 'PDF' ? currentVersion.pdfUrl : currentVersion.docxUrl;
      
      if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ message: `${format} file not found. Please regenerate the document.` });
      }

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'EXPORT_DOCUMENT',
        entity: 'Document',
        entityId: documentId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Set appropriate headers and send file
      const mimeType = format === 'PDF' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const fileName = `${document.title}.${format.toLowerCase()}`;
      
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.sendFile(path.resolve(filePath));

    } catch (error) {
      console.error("Error exporting document:", error);
      res.status(500).json({ message: "Failed to export document" });
    }
  });

  // Advanced Document Version Control routes
  
  // Get document versions
  app.get('/api/documents/:documentId/versions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentId } = req.params;
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const patient = await storage.getPatient(document.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const versions = await storage.getDocumentVersions(documentId);

      // AUDIT LOGGING: Track document version access for regulatory compliance
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'VIEW_DOCUMENT_VERSIONS',
        entity: 'DocumentVersion',
        entityId: documentId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(versions);
    } catch (error) {
      console.error("Error fetching document versions:", error);
      res.status(500).json({ message: "Failed to fetch document versions" });
    }
  });

  // Create new document version
  app.post('/api/documents/:documentId/versions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentId } = req.params;
      
      // SECURITY FIX: Comprehensive Zod validation for version creation
      const versionRequestSchema = z.object({
        content: z.string().min(1, "Document content is required"),
        changeLog: z.string().min(1, "Change log is required").max(1000),
      });
      
      const { content, changeLog } = versionRequestSchema.parse(req.body);
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const patient = await storage.getPatient(document.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const newVersionNumber = document.currentVersion + 1;
      
      // Create new version
      const newVersion = await storage.createDocumentVersion({
        documentId,
        version: newVersionNumber,
        content,
        citations: [], // Will be populated by document generation
        changeLog,
        createdBy: userId,
      });

      // Update document current version
      await storage.updateDocument(documentId, {
        currentVersion: newVersionNumber,
        // Don't reset status - creating a new version doesn't necessarily change the document status
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'CREATE_DOCUMENT_VERSION',
        entity: 'DocumentVersion',
        entityId: newVersion.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(newVersion);
    } catch (error) {
      console.error("Error creating document version:", error);
      res.status(500).json({ message: "Failed to create document version" });
    }
  });

  // Submit document for approval
  app.post('/api/documents/:documentId/submit-approval', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentId } = req.params;
      const { approverRole } = req.body;
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const patient = await storage.getPatient(document.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const currentVersion = await storage.getCurrentDocumentVersion(documentId);
      if (!currentVersion) {
        return res.status(400).json({ message: "No current version found" });
      }

      // Create approval request
      const approval = await storage.createDocumentApproval({
        documentId,
        versionId: currentVersion.id,
        approverRole,
        status: 'pending',
      });

      // STATE MACHINE: Update document status to pending approval
      try {
        await storage.updateDocument(documentId, {
          status: 'pending_approval',
        });
      } catch (error: any) {
        if (error.message.includes('STATE_TRANSITION_ERROR')) {
          return res.status(409).json({
            message: "Invalid state transition for approval submission",
            error: error.message,
            currentStatus: document.status,
            attemptedStatus: 'pending_approval'
          });
        }
        throw error;
      }

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'SUBMIT_DOCUMENT_APPROVAL',
        entity: 'DocumentApproval',
        entityId: approval.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json({ message: "Document submitted for approval", approval });
    } catch (error) {
      console.error("Error submitting document for approval:", error);
      res.status(500).json({ message: "Failed to submit document for approval" });
    }
  });



  // Get pending approvals for user
  app.get('/api/tenants/:tenantId/pending-approvals', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // SECURITY FIX: Pass tenantId to enforce tenant isolation
      const pendingApprovals = await storage.getPendingApprovals(userId, tenantId, userTenantRole.role);
      res.json(pendingApprovals);
    } catch (error) {
      console.error("Error fetching pending approvals:", error);
      res.status(500).json({ message: "Failed to fetch pending approvals" });
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

  // Policy refresh route for specific tenant
  app.post('/api/tenants/:tenantId/policies/refresh', isAuthenticated, async (req: any, res) => {
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

      console.log(`Policy refresh triggered by user: ${userId} for tenant: ${tenantId} (MAC: ${tenant.macRegion})`);
      
      // Perform MAC-specific policy update
      const result = await performPolicyUpdateForMAC(tenant.macRegion);
      
      // Log audit event for tenant-specific action
      await storage.createAuditLog({
        tenantId,
        userId,
        action: 'TRIGGER_TENANT_POLICY_REFRESH',
        entity: 'PolicySource',
        entityId: tenant.macRegion,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Track user activity
      await trackActivity(
        tenantId,
        userId,
        'Refreshed policy database',
        'PolicyUpdate',
        tenant.macRegion,
        `MAC region ${tenant.macRegion}`
      );

      res.json({
        message: `Policy refresh completed successfully for MAC region ${tenant.macRegion}`,
        macRegion: tenant.macRegion,
        result
      });
    } catch (error) {
      console.error("Error refreshing policies:", error);
      res.status(500).json({ message: "Failed to refresh policies" });
    }
  });

  // Policy update management routes
  app.post('/api/admin/policies/update', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // For now, allow any authenticated user to trigger policy updates
      // In production, this should be restricted to admin users
      console.log(`Policy update triggered by user: ${userId}`);
      
      const result = await performPolicyUpdate();
      
      // Log audit event  
      await storage.createAuditLog({
        tenantId: null, // System-level audit log
        userId,
        action: 'TRIGGER_POLICY_UPDATE',
        entity: 'PolicySource',
        entityId: 'system',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json({
        message: 'Policy update completed successfully',
        result
      });
    } catch (error) {
      console.error("Error performing policy update:", error);
      res.status(500).json({ message: "Failed to update policies" });
    }
  });

  app.get('/api/admin/policies/status', isAuthenticated, async (req: any, res) => {
    try {
      const status = await getPolicyUpdateStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting policy update status:", error);
      res.status(500).json({ message: "Failed to get policy status" });
    }
  });

  app.get('/api/tenants/:tenantId/dashboard-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get stats for dashboard
      const patients = await storage.getPatientsByTenant(tenantId);
      const activePatients = patients.length;
      
      // Count pending eligibility checks (simplified for now)
      const pendingEligibility = 0; // Would need to implement across all patients
      const generatedLetters = 0; // Would need to implement document count
      const policyUpdates = 1; // Placeholder

      // Get recent activities for this tenant
      const recentActivitiesData = await storage.getRecentActivitiesByTenant(tenantId, 10);
      const recentActivity = recentActivitiesData.map(activity => ({
        action: activity.action,
        timestamp: activity.createdAt
      }));

      res.json({
        activePatients,
        pendingEligibility, 
        generatedLetters,
        policyUpdates,
        recentActivity
      });
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // CRITICAL MISSING ENDPOINT: Document approval processing
  app.put('/api/documents/approvals/:approvalId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { approvalId } = req.params;
      
      // SECURITY FIX: Comprehensive Zod validation for approval processing
      const approvalSchema = z.object({
        status: z.enum(['approved', 'rejected']),
        comments: z.string().optional(),
        expectedVersion: z.number().min(1).optional(), // VERSION VALIDATION
      });
      
      const { status, comments, expectedVersion } = approvalSchema.parse(req.body);
      
      const approval = await storage.getDocumentApproval(approvalId);
      if (!approval) {
        return res.status(404).json({ message: "Approval not found" });
      }

      const document = await storage.getDocument(approval.documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const patient = await storage.getPatient(document.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // VERSION ALIGNMENT PROTECTION: Check If-Match style precondition
      if (expectedVersion && document.currentVersion !== expectedVersion) {
        return res.status(412).json({ 
          message: "Precondition Failed - Document version mismatch",
          currentVersion: document.currentVersion,
          expectedVersion
        });
      }

      // Process approval atomically with audit logging
      const updatedApproval = await storage.processDocumentApproval(approvalId, {
        status,
        comments,
        approverUserId: userId,
        tenantId: patient.tenantId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json(updatedApproval);
    } catch (error: any) {
      if (error.message.includes('STATE_TRANSITION_ERROR')) {
        return res.status(409).json({
          message: "Invalid state transition for document approval",
          error: error.message
        });
      }
      console.error("Error processing document approval:", error);
      res.status(500).json({ message: "Failed to process document approval" });
    }
  });

  // CRITICAL MISSING ENDPOINT: Electronic signature
  app.post('/api/documents/:documentId/sign', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { documentId } = req.params;
      
      // SECURITY FIX: Comprehensive Zod validation for signature data
      const signatureSchema = z.object({
        signatureData: z.string().min(1, "Signature data is required"),
        signerName: z.string().min(1, "Signer name is required"),
        signerRole: z.string().min(1, "Signer role is required"),
        expectedVersion: z.number().min(1).optional(), // VERSION VALIDATION
      });
      
      const { signatureData, signerName, signerRole, expectedVersion } = signatureSchema.parse(req.body);
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // STATE MACHINE: Only approved documents can be signed
      if (document.status !== 'approved') {
        return res.status(409).json({
          message: "Document must be approved before signing",
          currentStatus: document.status,
          requiredStatus: 'approved'
        });
      }

      const patient = await storage.getPatient(document.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // VERSION ALIGNMENT PROTECTION: Check If-Match style precondition
      if (expectedVersion && document.currentVersion !== expectedVersion) {
        return res.status(412).json({ 
          message: "Precondition Failed - Document version mismatch",
          currentVersion: document.currentVersion,
          expectedVersion
        });
      }

      // Get current version for signature
      const currentVersion = await storage.getCurrentDocumentVersion(documentId);
      if (!currentVersion) {
        return res.status(400).json({ message: "No current version found for document" });
      }

      // Create encrypted signature
      const signature = await storage.createDocumentSignature({
        documentId,
        versionId: currentVersion.id,
        signerUserId: userId,
        signerName,
        signerRole,
        signatureData, // This will be encrypted in storage layer
      });

      // STATE MACHINE: Update document status to signed atomically
      try {
        await storage.updateDocument(documentId, {
          status: 'signed',
        });
      } catch (error: any) {
        if (error.message.includes('STATE_TRANSITION_ERROR')) {
          return res.status(409).json({
            message: "Invalid state transition for document signing",
            error: error.message,
            currentStatus: document.status,
            attemptedStatus: 'signed'
          });
        }
        throw error;
      }

      // Log audit event for signature
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'SIGN_DOCUMENT',
        entity: 'DocumentSignature',
        entityId: signature.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(signature);
    } catch (error: any) {
      if (error.message.includes('STATE_TRANSITION_ERROR')) {
        return res.status(409).json({
          message: "Invalid state transition for document signing",
          error: error.message
        });
      }
      console.error("Error signing document:", error);
      res.status(500).json({ message: "Failed to sign document" });
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

  // RAG System Validation Routes (for testing and quality assurance)
  app.get('/api/validation/rag/policy-retrieval', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Import validation service dynamically to avoid circular dependencies
      const { validatePolicyRetrieval } = await import('./services/ragValidation');
      
      console.log(`RAG policy retrieval validation requested by user: ${userId}`);
      const results = await validatePolicyRetrieval();
      
      res.json({
        testType: 'policy-retrieval',
        executedAt: new Date().toISOString(),
        results
      });
    } catch (error) {
      console.error("Error in policy retrieval validation:", error);
      res.status(500).json({ 
        message: "Failed to run policy retrieval validation",
        error: (error as Error).message
      });
    }
  });

  app.get('/api/validation/rag/ai-analysis', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Import validation service dynamically
      const { validateAIAnalysis } = await import('./services/ragValidation');
      
      console.log(`RAG AI analysis validation requested by user: ${userId}`);
      const results = await validateAIAnalysis();
      
      res.json({
        testType: 'ai-analysis', 
        executedAt: new Date().toISOString(),
        results
      });
    } catch (error) {
      console.error("Error in AI analysis validation:", error);
      res.status(500).json({ 
        message: "Failed to run AI analysis validation",
        error: (error as Error).message 
      });
    }
  });

  app.get('/api/validation/rag/citation-generation', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Import validation service dynamically
      const { validateCitationGeneration } = await import('./services/ragValidation');
      
      console.log(`RAG citation validation requested by user: ${userId}`);
      const results = await validateCitationGeneration();
      
      res.json({
        testType: 'citation-validation',
        executedAt: new Date().toISOString(),
        results
      });
    } catch (error) {
      console.error("Error in citation validation:", error);
      res.status(500).json({ 
        message: "Failed to run citation validation",
        error: (error as Error).message
      });
    }
  });

  app.get('/api/validation/rag/comprehensive', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Import validation service dynamically
      const { runComprehensiveValidation } = await import('./services/ragValidation');
      
      console.log(`Comprehensive RAG system validation requested by user: ${userId}`);
      const results = await runComprehensiveValidation();
      
      res.json({
        testType: 'comprehensive',
        executedAt: new Date().toISOString(),
        ...results
      });
    } catch (error) {
      console.error("Error in comprehensive RAG validation:", error);
      res.status(500).json({ 
        message: "Failed to run comprehensive RAG validation",
        error: (error as Error).message
      });
    }
  });

  // Individual RAG component testing endpoints
  app.post('/api/validation/rag/test-retrieval', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { macRegion, woundType } = req.body;

      if (!macRegion || !woundType) {
        return res.status(400).json({ 
          message: "macRegion and woundType are required" 
        });
      }

      const { buildRAGContext } = await import('./services/ragService');
      
      console.log(`Testing RAG retrieval: MAC=${macRegion}, Wound=${woundType} by user: ${userId}`);
      const context = await buildRAGContext(macRegion, woundType);
      
      res.json({
        success: context.citations.length > 0,
        macRegion,
        woundType,
        contextLength: context.content.length,
        citationsFound: context.citations.length,
        context,
        testedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error testing RAG retrieval:", error);
      res.status(500).json({ 
        message: "Failed to test RAG retrieval",
        error: (error as Error).message
      });
    }
  });

  app.post('/api/validation/rag/test-analysis', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const analysisRequest = req.body;

      if (!analysisRequest.policyContext || !analysisRequest.patientInfo) {
        return res.status(400).json({ 
          message: "policyContext and patientInfo are required" 
        });
      }

      const { analyzeEligibility } = await import('./services/openai');
      
      console.log(`Testing AI analysis for MAC: ${analysisRequest.patientInfo.macRegion} by user: ${userId}`);
      const startTime = Date.now();
      const analysis = await analyzeEligibility(analysisRequest);
      const responseTime = Date.now() - startTime;
      
      res.json({
        success: true,
        analysis,
        responseTime,
        contextLength: analysisRequest.policyContext.length,
        testedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error testing AI analysis:", error);
      res.status(500).json({ 
        message: "Failed to test AI analysis",
        error: (error as Error).message
      });
    }
  });


  const httpServer = createServer(app);
  return httpServer;
}
