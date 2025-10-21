import { Router } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";

import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { decryptPatientData } from "../services/encryption";
import { generateDocument } from "../services/documentGenerator";
import { trackActivity } from "./utils";

export function createDocumentsRouter(): Router {
  const router = Router();

  router.get('/api/patients-with-documents/:tenantId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const patientsWithDocuments = await storage.getAllPatientsWithDocumentsByTenant(tenantId);
      
      // Log audit event for bulk PHI access
      await storage.createAuditLog({
        tenantId,
        userId,
        action: 'VIEW_BULK_PATIENTS_DOCUMENTS',
        entity: 'Patient',
        entityId: `bulk-documents-${tenantId}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(patientsWithDocuments);
    } catch (error) {
      console.error("Error fetching patients with documents:", error);
      res.status(500).json({ message: "Failed to fetch patients with documents" });
    }
  });

  router.post('/api/patients/:patientId/documents', isAuthenticated, async (req: any, res) => {
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
      const { generateLetterContent } = await import('../services/openai');
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

  router.post('/api/episodes/:episodeId/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { episodeId } = req.params;
      
      // Validate request body
      const requestSchema = z.object({
        type: z.enum(['PreDetermination', 'LMN']),
      });
      const { type } = requestSchema.parse(req.body);
      
      // Get episode and validate access
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ message: "Episode not found" });
      }

      const patient = await storage.getPatient(episode.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const tenant = await storage.getTenant(patient.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

      // Get episode-level eligibility analysis (most recent one)
      const episodeEligibilityChecks = await storage.getEligibilityChecksByEpisode(episodeId);
      const latestEligibilityCheck = episodeEligibilityChecks
        .filter(check => check.episodeId === episodeId)
        .sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        })[0];

      if (!latestEligibilityCheck) {
        return res.status(400).json({ message: "No eligibility analysis found for this episode. Please run episode-level eligibility analysis first." });
      }

      // Get all encounters for comprehensive episode timeline
      const episodeEncounters = await storage.getEncountersByEpisode(episodeId);

      // Generate episode-aware letter content using existing AI service
      const { generateLetterContent } = await import('../services/openai');
      const decryptedPatientData = decryptPatientData(patient);
      
      // Enhance patient data with episode context for richer content generation
      const episodeEnhancedPatientData = {
        ...decryptedPatientData,
        episodeContext: {
          woundType: episode.woundType,
          woundLocation: episode.woundLocation,
          episodeStartDate: episode.episodeStartDate,
          status: episode.status,
          primaryDiagnosis: episode.primaryDiagnosis,
          totalEncounters: episodeEncounters.length,
          encounterTimeline: episodeEncounters.map(enc => ({
            date: enc.date,
            woundDetails: enc.woundDetails,
            conservativeCare: enc.conservativeCare,
            infectionStatus: enc.infectionStatus || 'None'
          })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        }
      };

      const letterContent = await generateLetterContent(
        type,
        episodeEnhancedPatientData,
        latestEligibilityCheck.result as any,
        tenant
      );

      // Generate document with episode context and use existing eligibility check to avoid duplication
      const generatedDocument = await generateDocument({
        type,
        patientId: episode.patientId,
        tenantId: patient.tenantId,
        eligibilityCheckId: latestEligibilityCheck.id, // Use existing eligibility check to avoid refetching
        episodeId,
        content: letterContent,
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'GENERATE_EPISODE_DOCUMENT',
        entity: 'Document',
        entityId: generatedDocument.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Track recent activity
      await trackActivity(patient.tenantId, userId, `Generated episode-level ${type} document`, 'Document', generatedDocument.id, `Episode ${type} Document`);

      res.json(generatedDocument);
    } catch (error) {
      console.error("Error generating episode document:", error);
      res.status(500).json({ message: "Failed to generate episode document" });
    }
  });

  router.get('/api/patients/:patientId/documents', isAuthenticated, async (req: any, res) => {
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

  router.get('/api/documents/:documentId/export/:format', isAuthenticated, async (req: any, res) => {
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

  router.get('/api/documents/:documentId/versions', isAuthenticated, async (req: any, res) => {
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

  router.post('/api/documents/:documentId/versions', isAuthenticated, async (req: any, res) => {
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

  router.post('/api/documents/:documentId/submit-approval', isAuthenticated, async (req: any, res) => {
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

  router.get('/api/tenants/:tenantId/pending-approvals', isAuthenticated, async (req: any, res) => {
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

  router.put('/api/documents/approvals/:approvalId', isAuthenticated, async (req: any, res) => {
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

  router.post('/api/documents/:documentId/sign', isAuthenticated, async (req: any, res) => {
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

  return router;
}
