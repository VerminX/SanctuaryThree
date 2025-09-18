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
  insertEpisodeSchema,
  insertEligibilityCheckSchema,
  insertDocumentSchema,
  insertDocumentVersionSchema,
  insertDocumentSignatureSchema
} from "@shared/schema";
import { encryptPatientData, decryptPatientData, safeDecryptPatientData, encryptEncounterNotes, decryptEncounterNotes, encryptPHI } from "./services/encryption";
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
      
      // Handle duplicate patient errors
      if (error instanceof Error && error.message.includes('already exists in this tenant')) {
        return res.status(409).json({ 
          message: "A patient with this MRN already exists in this clinic",
          type: "DUPLICATE_PATIENT"
        });
      }
      
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
      
      // Handle duplicate encounter errors
      if (error instanceof Error && error.message.includes('Encounter already exists for patient')) {
        return res.status(409).json({ 
          message: "An encounter already exists for this patient on the selected date",
          type: "DUPLICATE_ENCOUNTER"
        });
      }
      
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
      
      // Decrypt encounter notes with safe error handling
      const decryptedEncounters = encounters.map(encounter => {
        try {
          return {
            ...encounter,
            notes: decryptEncounterNotes(encounter.encryptedNotes as string[]),
          };
        } catch (error: any) {
          console.error(`Error decrypting encounter ${encounter.id} notes:`, error.message);
          return {
            ...encounter,
            notes: ['[DECRYPTION ERROR - ENCRYPTED DATA CORRUPTED]'],
          };
        }
      });

      res.json(decryptedEncounters);
    } catch (error) {
      console.error("Error fetching encounters:", error);
      res.status(500).json({ message: "Failed to fetch encounters" });
    }
  });

  app.get('/api/patients/:patientId/episodes', isAuthenticated, async (req: any, res) => {
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

      const episodes = await storage.getEpisodesByPatient(patientId);
      
      // Get encounter counts for each episode
      const episodesWithCounts = await Promise.all(
        episodes.map(async (episode) => {
          const encounters = await storage.getEncountersByEpisode(episode.id);
          return {
            ...episode,
            encounterCount: encounters.length,
          };
        })
      );
      
      res.json(episodesWithCounts);
    } catch (error) {
      console.error("Error fetching episodes:", error);
      res.status(500).json({ message: "Failed to fetch episodes" });
    }
  });

  // Create episode
  app.post('/api/patients/:patientId/episodes', isAuthenticated, async (req: any, res) => {
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

      // Validate request body
      const episodeData = insertEpisodeSchema.parse(req.body);

      // Create episode
      const episode = await storage.createEpisode(episodeData);

      // Track activity
      await trackActivity(patient.tenantId, userId, 'CREATE_EPISODE', 'Episode', episode.id, `${episodeData.woundType} episode`);

      res.status(201).json(episode);
    } catch (error) {
      console.error("Error creating episode:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid episode data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create episode" });
    }
  });

  // Get single episode
  app.get('/api/episodes/:episodeId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { episodeId } = req.params;
      
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

      res.json(episode);
    } catch (error) {
      console.error("Error fetching episode:", error);
      res.status(500).json({ message: "Failed to fetch episode" });
    }
  });

  // Update episode
  app.put('/api/episodes/:episodeId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { episodeId } = req.params;
      
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

      // Create update schema that omits patientId (cannot be changed)
      const episodeUpdateSchema = insertEpisodeSchema.omit({ patientId: true });
      const episodeData = episodeUpdateSchema.parse(req.body);

      // Update episode
      const updatedEpisode = await storage.updateEpisode(episodeId, episodeData);

      // Track activity
      await trackActivity(patient.tenantId, userId, 'UPDATE_EPISODE', 'Episode', episode.id, `${episodeData.woundType} episode`);

      res.json(updatedEpisode);
    } catch (error) {
      console.error("Error updating episode:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid episode data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update episode" });
    }
  });

  // Delete episode
  app.delete('/api/episodes/:episodeId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { episodeId } = req.params;
      
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

      // Delete episode (cascade will handle encounters)
      await storage.deleteEpisode(episodeId);

      // Track activity
      await trackActivity(patient.tenantId, userId, 'DELETE_EPISODE', 'Episode', episode.id, `${episode.woundType} episode`);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting episode:", error);
      res.status(500).json({ message: "Failed to delete episode" });
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
        }).optional(),
        notes: z.array(z.string()).optional(),
        woundDetails: z.any().optional(), // JSONB field
        conservativeCare: z.any().optional(), // JSONB field
        infectionStatus: z.string().optional(),
        comorbidities: z.any().optional(), // JSONB field
        attachmentMetadata: z.any().optional(), // JSONB field
        episodeId: z.string().uuid().nullable().optional(), // Allow assigning/unassigning episodes
      });
      
      const { notes, ...encounterData } = encounterRequestSchema.parse(req.body);
      
      // Only encrypt notes if they are provided
      const updateData: any = { ...encounterData };
      if (notes && notes.length > 0) {
        updateData.encryptedNotes = encryptEncounterNotes(notes);
      }
      
      // Update encounter
      const updatedEncounter = await storage.updateEncounter(encounterId, updateData);

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

  // Episode-level eligibility analysis
  app.post('/api/episodes/:episodeId/analyze-eligibility', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { episodeId } = req.params;
      
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

      // Get encounters first to validate episode before expensive analysis
      const encounters = await storage.getEncountersByEpisode(episodeId);
      if (encounters.length === 0) {
        return res.status(400).json({ message: "No encounters found for this episode" });
      }

      // Build RAG context from policy database
      const ragContext = await buildRAGContext(
        patient.macRegion || 'default',
        episode.woundType || 'DFU'
      );

      // Perform enhanced AI episode-level eligibility analysis with full patient history (NEW DEFAULT)
      const { prepareAndAnalyzeEpisodeWithFullHistory } = await import('./services/openai');
      const analysisResult = await prepareAndAnalyzeEpisodeWithFullHistory(
        storage,
        episodeId,
        patient.id,
        {
          payerType: patient.payerType,
          macRegion: patient.macRegion || 'default',
        },
        ragContext.content
      );

      // Get latest encounter for eligibility check linking (with safe date handling)
      const toTime = (date: any) => new Date(date as any).getTime();
      const latestEncounter = encounters.sort((a, b) => toTime(b.date) - toTime(a.date))[0];

      // Store eligibility check result with episodeId
      const eligibilityCheck = await storage.createEligibilityCheck({
        encounterId: latestEncounter.id, // Link to the latest encounter
        episodeId: episode.id, // Link to the episode for episode-level analysis
        result: analysisResult,
        citations: [...ragContext.citations, ...analysisResult.citations],
        llmModel: 'gpt-4o-mini',
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'AI_EPISODE_ELIGIBILITY_ANALYSIS',
        entity: 'EligibilityCheck',
        entityId: eligibilityCheck.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(eligibilityCheck);
    } catch (error) {
      console.error("Error analyzing episode eligibility:", error);
      res.status(500).json({ message: "Failed to analyze episode eligibility" });
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

  // Get eligibility checks for an episode
  app.get('/api/episodes/:episodeId/eligibility-checks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { episodeId } = req.params;
      
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

      const eligibilityChecks = await storage.getEligibilityChecksByEpisode(episodeId);
      res.json(eligibilityChecks);
    } catch (error) {
      console.error("Error fetching episode eligibility checks:", error);
      res.status(500).json({ message: "Failed to fetch episode eligibility checks" });
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

  // Episode-level document generation
  app.post('/api/episodes/:episodeId/documents', isAuthenticated, async (req: any, res) => {
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
      const { generateLetterContent } = await import('./services/openai');
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

  // Patient de-duplication endpoint
  app.post('/api/admin/deduplicate-patients', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      console.log(`Patient de-duplication triggered by user: ${userId}`);
      
      const result = await storage.deduplicatePatients();
      
      // Log audit event for system-level operation
      await storage.createAuditLog({
        tenantId: null, // System-level audit log
        userId,
        action: 'DEDUPLICATE_PATIENTS',
        entity: 'Patient',
        entityId: 'system',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      console.log(`De-duplication completed: ${result.mergedGroups} groups merged, ${result.removedPatients} duplicates removed, ${result.preservedData.encounters} encounters moved, ${result.preservedData.episodes} episodes moved`);

      res.json({
        message: 'Patient de-duplication completed successfully',
        ...result
      });
    } catch (error) {
      console.error("Error performing patient de-duplication:", error);
      res.status(500).json({ message: "Failed to deduplicate patients" });
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

  // File Upload Routes
  // Basic PDF upload endpoint (server-side upload handling)
  app.post('/api/upload/pdf', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Enhanced tenant selection: accept tenantId from query or use first available
      const requestedTenantId = req.query.tenantId as string;
      const tenants = await storage.getTenantsByUser(userId);
      if (tenants.length === 0) {
        return res.status(400).json({ message: "User must be associated with a tenant to upload files" });
      }
      
      let tenantId: string;
      if (requestedTenantId) {
        // Verify user has access to the requested tenant
        const userTenantRole = await storage.getUserTenantRole(userId, requestedTenantId);
        if (!userTenantRole) {
          return res.status(403).json({ message: "Access denied to the specified tenant" });
        }
        tenantId = requestedTenantId;
      } else {
        // Use the first tenant as fallback
        tenantId = tenants[0].id;
      }
      
      const multer = (await import('multer')).default;
      const upload = multer({ 
        storage: multer.memoryStorage(),
        limits: { 
          fileSize: 10 * 1024 * 1024, // 10MB limit
        },
        fileFilter: (_req, file, cb) => {
          if (file.mimetype === 'application/pdf') {
            cb(null, true);
          } else {
            cb(new Error('Only PDF files are allowed'));
          }
        }
      });

      // Helper function to validate PDF magic bytes
      const validatePDFMagicBytes = (buffer: Buffer): boolean => {
        // PDF files start with %PDF-
        const pdfHeader = buffer.subarray(0, 5);
        return pdfHeader.toString() === '%PDF-';
      };

      upload.single('pdf')(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ message: err.message });
        }

        if (!req.file) {
          return res.status(400).json({ message: "No PDF file uploaded" });
        }

        // Validate PDF magic bytes for additional security
        if (!validatePDFMagicBytes(req.file.buffer)) {
          return res.status(400).json({ message: "Invalid PDF file format" });
        }

        try {
          // Store file in object storage (HIPAA compliant - no original filename in path)
          const { ObjectStorageService } = await import('./objectStorage');
          const objectStorage = new ObjectStorageService();
          const objectPath = await objectStorage.storeFile(
            req.file.buffer,
            'application/pdf'
          );

          // Set ACL policy for the uploaded file (private, owned by user)
          try {
            await objectStorage.trySetObjectEntityAclPolicy(objectPath, {
              owner: userId,
              visibility: 'private'
            });
          } catch (aclError) {
            console.error('Error setting ACL policy:', aclError);
            // Continue - ACL error shouldn't block upload, but log it
          }

          // Create file upload record
          const fileUpload = await storage.createFileUpload({
            tenantId,
            userId,
            filename: `${Date.now()}_${req.file.originalname}`,
            originalFilename: req.file.originalname,
            fileType: 'PDF',
            fileSize: req.file.size,
            objectPath,
            status: 'uploaded'
          });

          // Log audit event
          await storage.createAuditLog({
            tenantId,
            userId,
            action: 'UPLOAD_PDF',
            entity: 'FileUpload',
            entityId: fileUpload.id,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            previousHash: '',
          });

          res.json({ 
            success: true,
            fileUpload: {
              id: fileUpload.id,
              filename: fileUpload.originalFilename,
              status: fileUpload.status,
              uploadedAt: fileUpload.createdAt
            }
          });
        } catch (storageError) {
          console.error('Error storing uploaded file:', storageError);
          res.status(500).json({ message: "Failed to store uploaded file" });
        }
      });
    } catch (error) {
      console.error("Error in PDF upload:", error);
      res.status(500).json({ message: "Failed to upload PDF" });
    }
  });

  // Extract text from uploaded PDF
  app.post('/api/upload/:uploadId/extract-text', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { uploadId } = req.params;

      const upload = await storage.getFileUpload(uploadId);
      if (!upload) {
        return res.status(404).json({ message: "Upload not found" });
      }

      // Verify user has access to this upload
      const userTenantRole = await storage.getUserTenantRole(userId, upload.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (upload.status !== 'uploaded') {
        return res.status(400).json({ message: "File is not ready for text extraction" });
      }

      // Update status to processing
      await storage.updateFileUploadStatus(uploadId, 'processing');

      try {
        // Get file from object storage
        const { ObjectStorageService } = await import('./objectStorage');
        const objectStorage = new ObjectStorageService();
        const fileObject = await objectStorage.getObjectEntityFile(upload.objectPath);
        
        // Download file to buffer
        const fileBuffer = await objectStorage.downloadFileToBuffer(fileObject);
        
        // Extract text from PDF
        const { PdfTextExtractor } = await import('./services/pdfTextExtractor');
        const extractionResult = await PdfTextExtractor.extractTextFromBuffer(fileBuffer);

        // Update upload record with extracted text
        await storage.updateFileUploadText(uploadId, extractionResult.text);
        await storage.updateFileUploadStatus(uploadId, 'processed');

        // Log audit event
        await storage.createAuditLog({
          tenantId: upload.tenantId,
          userId,
          action: 'EXTRACT_PDF_TEXT',
          entity: 'FileUpload',
          entityId: uploadId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          previousHash: '',
        });

        res.json({
          success: true,
          extractionResult: {
            textLength: extractionResult.text.length,
            numPages: extractionResult.numPages,
            confidence: parseFloat(String(extractionResult.confidence)) // Ensure number format
          }
        });

      } catch (extractionError) {
        console.error('Error extracting text from PDF:', extractionError);
        await storage.updateFileUploadStatus(uploadId, 'failed', (extractionError as Error).message);
        res.status(500).json({ message: "Failed to extract text from PDF" });
      }
    } catch (error) {
      console.error("Error in text extraction:", error);
      res.status(500).json({ message: "Failed to extract text" });
    }
  });

  // AI-Powered PDF Data Extraction Route
  app.post('/api/upload/:uploadId/extract-data', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { uploadId } = req.params;
      
      // Get the file upload record to verify ownership
      const upload = await storage.getFileUpload(uploadId);
      if (!upload) {
        return res.status(404).json({ message: "Upload not found" });
      }
      
      // Verify user has access to this file
      const userTenantRole = await storage.getUserTenantRole(userId, upload.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { FILE_UPLOAD_STATUS } = await import('../shared/schema');
      if (upload.status !== FILE_UPLOAD_STATUS.PROCESSED) {
        return res.status(400).json({ message: "File must have text extracted first using /extract-text endpoint" });
      }

      try {
        // Step 1: Get extracted text (must exist from text extraction)
        let extractedText = upload.extractedText;
        
        if (!extractedText) {
          return res.status(500).json({ message: "Internal error: extracted text is missing for processed file" });
        }

        // Step 2: Use AI to extract structured data from the text (includes enhanced encounter normalization)
        const { extractDataFromPdfText, validateExtractionCompleteness } = await import('./services/pdfDataExtractor');
        let extractionResult = await extractDataFromPdfText(extractedText);

        // Step 3: Validate completeness of extraction with comprehensive clinical information checking
        const validation = validateExtractionCompleteness(extractionResult);
        
        // Log comprehensiveness warnings for completeness tracking
        if (validation.comprehensivenessWarnings.length > 0) {
          console.warn('EXTRACTION COMPREHENSIVENESS WARNINGS:', validation.comprehensivenessWarnings);
        }

        // Step 4: Encrypt ALL PHI before storing (HIPAA compliance)
        const encryptedText = encryptPHI(extractionResult.extractedText);
        
        // Encrypt ALL patient PHI data (not just name/DOB)
        const encryptedPatientData = {
          mrn: extractionResult.patientData.mrn ? encryptPHI(extractionResult.patientData.mrn) : null,
          firstName: extractionResult.patientData.firstName ? encryptPHI(extractionResult.patientData.firstName) : null,
          lastName: extractionResult.patientData.lastName ? encryptPHI(extractionResult.patientData.lastName) : null,
          dateOfBirth: extractionResult.patientData.dateOfBirth ? encryptPHI(extractionResult.patientData.dateOfBirth) : null,
          phoneNumber: extractionResult.patientData.phoneNumber ? encryptPHI(extractionResult.patientData.phoneNumber) : null,
          address: extractionResult.patientData.address ? encryptPHI(extractionResult.patientData.address) : null,
          insuranceId: extractionResult.patientData.insuranceId ? encryptPHI(extractionResult.patientData.insuranceId) : null,
          // Non-PHI fields remain unencrypted
          payerType: extractionResult.patientData.payerType,
          planName: extractionResult.patientData.planName,
          macRegion: extractionResult.patientData.macRegion,
        };

        // Encrypt encounter PHI data (notes, wound details with potential patient identifiers)
        // Handle array of encounters
        const encryptedEncounterData = extractionResult.encounterData.map((encounter: any) => ({
          ...encounter,
          notes: encounter.notes ? encryptEncounterNotes(encounter.notes) : null,
          assessment: encounter.assessment ? encryptPHI(encounter.assessment) : null,
          plan: encounter.plan ? encryptPHI(encounter.plan) : null,
          // Wound details, conservative care, etc. may contain PHI - encrypt as JSON strings
          woundDetails: encounter.woundDetails ? encryptPHI(JSON.stringify(encounter.woundDetails)) : null,
          conservativeCare: encounter.conservativeCare ? encryptPHI(JSON.stringify(encounter.conservativeCare)) : null,
        }));

        // Store extraction results in the database with comprehensive PHI encryption
        const { PDF_VALIDATION_STATUS } = await import('../shared/schema');
        
        // Automatically approve high-confidence extractions for immediate record creation
        const autoValidationStatus = validation.score >= 0.7 
          ? PDF_VALIDATION_STATUS.APPROVED 
          : PDF_VALIDATION_STATUS.PENDING;
        
        const extractedData = await storage.createPdfExtractedData({
          fileUploadId: upload.id,
          tenantId: upload.tenantId,
          userId: upload.userId,
          documentType: 'medical_record', // Default document type for PDF extraction
          extractedText: encryptedText, // Encrypted PHI
          extractedPatientData: encryptedPatientData, // Fully encrypted patient PHI
          extractedEncounterData: encryptedEncounterData, // Encrypted encounter PHI
          extractionConfidence: extractionResult.confidence.toString(), // Convert to string for decimal type
          validationScore: validation.score.toString(), // Convert to string for decimal type
          validationStatus: autoValidationStatus // Auto-approve high confidence extractions
        });

        // Step 5: CRITICAL HIPAA FIX - Replace plaintext extracted_text with encrypted version
        await storage.updateFileUploadText(uploadId, encryptedText);
        await storage.updateFileUploadStatus(uploadId, FILE_UPLOAD_STATUS.DATA_EXTRACTED);

        // Step 6: Log audit event for HIPAA compliance (NO PHI in logs)
        await storage.createAuditLog({
          tenantId: upload.tenantId,
          userId,
          action: 'EXTRACT_PDF_DATA',
          entity: 'PdfExtractedData',
          entityId: extractedData.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          previousHash: '',
        });

        // Send response BEFORE clearing memory (so we can access extractionResult)
        res.status(200).json({
          message: "Data extraction completed",
          extractionId: extractedData.id,
          confidence: parseFloat(String(extractionResult.confidence)), // Ensure number format
          validationScore: parseFloat(String(validation.score)), // Ensure number format
          isComplete: validation.isComplete,
          missingFields: validation.missingCriticalFields,
          warnings: extractionResult.warnings,
          patientData: extractionResult.patientData,
          encounterData: extractionResult.encounterData,
          canCreateRecords: validation.score >= 0.7 // Minimum threshold for record creation
        });

        // Clear plaintext from memory AFTER response is sent (HIPAA security)
        extractedText = '';
        extractionResult.patientData = {};
        extractionResult.encounterData = [];
        extractionResult = null as any;

      } catch (extractionError) {
        console.error('Error during PDF data extraction:', extractionError);
        
        // Update file status to reflect extraction failure using proper enum constant
        const { FILE_UPLOAD_STATUS } = await import('../shared/schema');
        await storage.updateFileUploadStatus(uploadId, FILE_UPLOAD_STATUS.EXTRACTION_FAILED);
        
        res.status(500).json({ 
          message: "Failed to extract data from PDF",
          error: process.env.NODE_ENV === 'development' ? (extractionError as Error).message : 'Internal extraction error'
        });
      }

    } catch (error) {
      console.error('Error in extract-data endpoint:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get upload status and details
  app.get('/api/uploads/:uploadId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { uploadId } = req.params;

      const upload = await storage.getFileUpload(uploadId);
      if (!upload) {
        return res.status(404).json({ message: "Upload not found" });
      }

      // Verify user has access to this upload
      const userTenantRole = await storage.getUserTenantRole(userId, upload.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json({
        id: upload.id,
        filename: upload.originalFilename,
        fileType: upload.fileType,
        fileSize: upload.fileSize,
        status: upload.status,
        processingError: upload.processingError,
        textLength: upload.extractedText?.length || 0,
        uploadedAt: upload.createdAt,
        processedAt: upload.processedAt
      });
    } catch (error) {
      console.error("Error fetching upload details:", error);
      res.status(500).json({ message: "Failed to fetch upload details" });
    }
  });

  // List uploads for current tenant
  app.get('/api/uploads', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get user's tenants
      const tenants = await storage.getTenantsByUser(userId);
      if (tenants.length === 0) {
        return res.json({ uploads: [] });
      }

      // Get uploads for the first tenant (could be enhanced for multi-tenant support)
      const uploads = await storage.getFileUploadsByTenant(tenants[0].id);

      res.json({
        uploads: uploads.map(upload => ({
          id: upload.id,
          filename: upload.originalFilename,
          fileType: upload.fileType,
          fileSize: upload.fileSize,
          status: upload.status,
          uploadedAt: upload.createdAt,
          processedAt: upload.processedAt,
          hasText: !!upload.extractedText
        }))
      });
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ message: "Failed to fetch uploads" });
    }
  });

  // Create Patient and Encounter from Extracted Data
  app.post('/api/upload/:uploadId/create-records', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { uploadId } = req.params;
      
      // Get the file upload record
      const upload = await storage.getFileUpload(uploadId);
      if (!upload) {
        return res.status(404).json({ message: "Upload not found" });
      }
      
      // Verify user has access to this file
      const userTenantRole = await storage.getUserTenantRole(userId, upload.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Get the extracted data
      const extractedData = await storage.getPdfExtractedDataByFileUpload(uploadId);
      if (!extractedData) {
        return res.status(400).json({ message: "No extracted data found. Please extract data first." });
      }
      
      if (extractedData.validationStatus === 'pending') {
        return res.status(400).json({ message: "Extracted data must be validated before creating records" });
      }

      try {
        // Decrypt the extracted patient data
        const { decryptPHI } = await import('./services/encryption');
        
        const patientData = extractedData.extractedPatientData as any;
        const encounterData = extractedData.extractedEncounterData as any;
        
        // Decrypt patient PHI fields
        const decryptedPatientData = {
          mrn: patientData?.mrn ? decryptPHI(patientData.mrn) : '',
          firstName: patientData?.firstName ? decryptPHI(patientData.firstName) : '',
          lastName: patientData?.lastName ? decryptPHI(patientData.lastName) : '',
          dateOfBirth: patientData?.dateOfBirth ? decryptPHI(patientData.dateOfBirth) : '',
          phoneNumber: patientData?.phoneNumber ? decryptPHI(patientData.phoneNumber) : undefined,
          address: patientData?.address ? decryptPHI(patientData.address) : undefined,
          insuranceId: patientData?.insuranceId ? decryptPHI(patientData.insuranceId) : undefined,
          payerType: patientData?.payerType || 'Original Medicare',
          planName: patientData?.planName,
          macRegion: patientData?.macRegion
        };

        // Check if patient already exists by MRN using proper duplicate prevention
        let existingPatient = null;
        if (decryptedPatientData.mrn) {
          const isDuplicate = await storage.checkPatientDuplicate(decryptedPatientData.mrn, upload.tenantId);
          if (isDuplicate) {
            existingPatient = await storage.getPatientByMrnAndTenant(decryptedPatientData.mrn, upload.tenantId);
          }
        }

        let patientId: string;
        
        if (existingPatient) {
          // Use existing patient
          patientId = existingPatient.id;
          console.log(`Using existing patient: ${patientId}`);
        } else {
          // Create new patient with encrypted PHI data
          const { encryptPatientData } = await import('./services/encryption');
          const encryptedFields = encryptPatientData(
            decryptedPatientData.firstName,
            decryptedPatientData.lastName, 
            decryptedPatientData.dateOfBirth
          );

          const newPatient = await storage.createPatient({
            tenantId: upload.tenantId,
            mrn: decryptedPatientData.mrn,
            encryptedFirstName: encryptedFields.encryptedFirstName,
            encryptedLastName: encryptedFields.encryptedLastName,
            encryptedDob: encryptedFields.encryptedDob,
            payerType: decryptedPatientData.payerType,
            planName: decryptedPatientData.planName,
            macRegion: decryptedPatientData.macRegion
          });
          
          patientId = newPatient.id;
          console.log(`Created new patient: ${patientId}`);
        }

        // Process multiple encounters from PDF
        const { decryptEncounterNotes } = await import('./services/encryption');
        
        // Handle conversion from object format {"0": encounter1, "1": encounter2} to array format
        let encountersArray;
        if (Array.isArray(encounterData)) {
          encountersArray = encounterData;
        } else if (encounterData && typeof encounterData === 'object') {
          // Check if it's the object format with numbered keys
          const keys = Object.keys(encounterData).filter(key => /^\d+$/.test(key)).sort();
          if (keys.length > 0) {
            // Convert object format to array
            encountersArray = [];
            for (const key of keys) {
              if (encounterData[key] && typeof encounterData[key] === 'object') {
                encountersArray.push(encounterData[key]);
              }
            }
            console.log(`Converted ${encountersArray.length} encounters from object to array format during record creation`);
          } else {
            // Single encounter object (legacy format)
            encountersArray = [encounterData];
          }
        } else {
          encountersArray = [];
        }
        
        if (encountersArray.length === 0) {
          return res.status(400).json({ message: "No encounter data found in PDF" });
        }

        // Decrypt all encounters
        const decryptedEncounters = encountersArray.map((encounter, index) => ({
          date: encounter?.encounterDate ? new Date(encounter.encounterDate) : new Date(),
          notes: encounter?.notes ? decryptEncounterNotes(encounter.notes) : [],
          assessment: encounter?.assessment ? decryptPHI(encounter.assessment) : '',
          plan: encounter?.plan ? decryptPHI(encounter.plan) : '',
          woundDetails: encounter?.woundDetails ? JSON.parse(decryptPHI(encounter.woundDetails)) : {},
          conservativeCare: encounter?.conservativeCare ? JSON.parse(decryptPHI(encounter.conservativeCare)) : {},
          infectionStatus: encounter?.infectionStatus || 'None',
          comorbidities: encounter?.comorbidities || [],
          originalIndex: index
        }));

        console.log(`Processing ${decryptedEncounters.length} encounters from PDF`);

        // Episode creation logic - ALWAYS create episode for multi-encounter PDFs
        let episodeId: string | null = null;
        
        // Use the first encounter with wound details, or fallback to first encounter with safe defaults
        const firstEncounterWithWound = decryptedEncounters.find(enc => 
          enc.woundDetails && Object.keys(enc.woundDetails).length > 0
        ) || decryptedEncounters[0];
        
        // ALWAYS create episode - use wound details if available, safe defaults if not
        const woundType = firstEncounterWithWound.woundDetails?.type || 'General Wound Care';
        const woundLocation = firstEncounterWithWound.woundDetails?.location || 'Not specified';
        const primaryDiagnosis = firstEncounterWithWound.assessment || 'Wound care assessment';
        
        // Check for existing active episodes for this patient with similar wound characteristics
        const existingEpisodes = await storage.getEpisodesByPatient(patientId);
        let matchingEpisode = null;
        
        for (const episode of existingEpisodes) {
          // Match on wound type and location, and episode is still active (no end date)
          if (episode.status === 'active' && 
              episode.woundType === woundType && 
              episode.woundLocation === woundLocation &&
              !episode.episodeEndDate) {
            matchingEpisode = episode;
            break;
          }
        }
        
        if (matchingEpisode) {
          // Use existing episode
          episodeId = matchingEpisode.id;
          console.log(`Using existing episode: ${episodeId} for wound type: ${woundType}`);
        } else {
          // Create new episode for all encounters
          const newEpisode = await storage.createEpisode({
            patientId,
            woundType,
            woundLocation,
            episodeStartDate: firstEncounterWithWound.date,
            status: 'active',
            primaryDiagnosis
          });
          
          episodeId = newEpisode.id;
          console.log(`Created new episode: ${episodeId} for wound type: ${woundType}, location: ${woundLocation}`);
        }

        // Create all encounters and link them to the same episode
        const { encryptEncounterNotes, encryptPHI } = await import('./services/encryption');
        const createdEncounters = [];
        
        for (const encounter of decryptedEncounters) {
          const newEncounter = await storage.createEncounter({
            patientId,
            episodeId,
            date: encounter.date,
            encryptedNotes: encryptEncounterNotes(encounter.notes),
            woundDetails: encounter.woundDetails,
            conservativeCare: encounter.conservativeCare,
            infectionStatus: encounter.infectionStatus,
            comorbidities: encounter.comorbidities
          });
          
          createdEncounters.push(newEncounter);
          console.log(`Created encounter ${newEncounter.id} for episode ${episodeId} on ${encounter.date.toDateString()}`);
        }

        // Update extraction data status to completed and link to episode if created
        if (episodeId) {
          // Update the pdfExtractedData to include episodeId reference
          await storage.updatePdfExtractedData(extractedData.id, { episodeId });
        }
        await storage.updatePdfExtractedDataValidation(extractedData.id, 'approved', userId, 'Records created successfully');

        // HIPAA SECURITY: Clear plaintext PHI from memory immediately
        decryptedPatientData.firstName = '';
        decryptedPatientData.lastName = '';
        decryptedPatientData.dateOfBirth = '';
        decryptedPatientData.mrn = '';
        decryptedPatientData.phoneNumber = '';
        decryptedPatientData.address = '';
        decryptedPatientData.insuranceId = '';
        
        // Clear PHI from all decrypted encounters
        decryptedEncounters.forEach(encounter => {
          encounter.notes = [];
          encounter.assessment = '';
          encounter.plan = '';
          Object.keys(encounter).forEach(key => { (encounter as any)[key] = null; });
        });
        
        // Null out the objects to ensure garbage collection
        Object.keys(decryptedPatientData).forEach(key => { (decryptedPatientData as any)[key] = null; });

        // Log audit event for patient/encounter creation
        await storage.createAuditLog({
          tenantId: upload.tenantId,
          userId,
          action: 'CREATE_RECORDS_FROM_PDF',
          entity: 'Patient',
          entityId: patientId,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          previousHash: '',
        });

        // Log audit event for episode creation if new episode was created
        if (episodeId) {
          await storage.createAuditLog({
            tenantId: upload.tenantId,
            userId,
            action: 'CREATE_EPISODE_FROM_PDF',
            entity: 'Episode',
            entityId: episodeId,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            previousHash: '',
          });
        }

        res.status(201).json({
          message: `Patient and ${createdEncounters.length} encounter records created successfully`,
          patientId,
          encounterIds: createdEncounters.map(enc => enc.id),
          encountersCreated: createdEncounters.length,
          episodeId: episodeId || null,
          wasNewPatient: !existingPatient,
          wasNewEpisode: episodeId !== null,
          extractionId: extractedData.id
        });

      } catch (processError) {
        console.error('Error creating records from extracted data:', processError);
        res.status(500).json({ 
          message: "Failed to create patient and encounter records",
          error: process.env.NODE_ENV === 'development' ? (processError as Error).message : 'Record creation failed'
        });
      }

    } catch (error) {
      console.error('Error in create-records endpoint:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
