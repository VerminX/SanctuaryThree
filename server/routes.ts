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
  insertDocumentSignatureSchema,
  insertProductApplicationSchema,
  insertAnalyticsSnapshotSchema,
  insertHealingTrendSchema,
  insertPerformanceMetricSchema,
  insertCostAnalyticSchema,
  insertComplianceTrackingSchema,
  PRODUCT_CATEGORY,
  CLINICAL_EVIDENCE_LEVEL,
  type Episode,
  type Encounter,
  type Patient,
  type ComplianceTracking
} from "@shared/schema";
import { encryptPatientData, decryptPatientData, safeDecryptPatientData, encryptEncounterNotes, decryptEncounterNotes, encryptPHI } from "./services/encryption";
import { buildRAGContext, selectBestPolicy } from "./services/ragService";
import { generateDocument } from "./services/documentGenerator";
import { performPolicyUpdate, performPolicyUpdateForMAC, scheduledPolicyUpdate, getPolicyUpdateStatus } from "./services/policyUpdater";
import { 
  validateDiagnosisCodes, 
  assessClinicalNecessity, 
  mapICD10ToWoundType, 
  analyzeDiagnosisComplexity, 
  generateDiagnosisRecommendations 
} from "./services/eligibilityValidator";
import { ICD10_DATABASE, getCodeByCode, validateICD10Format, searchICD10Codes } from "@shared/icd10Database";
import { z } from "zod";
import { format as formatDate } from "date-fns";

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

  // Health monitoring endpoint
  app.get('/api/health', async (req, res) => {
    try {
      const { healthMonitor } = await import('./services/healthMonitoring.js');
      
      // Test database connectivity
      const dbTest = await healthMonitor.testDatabaseConnection(storage);
      
      // Get overall health status
      const healthStatus = healthMonitor.getSimpleHealthCheck();
      const detailedMetrics = healthMonitor.getHealthStatus();
      
      // Update total patient count for accurate corruption rate
      try {
        const user = (req as any).user?.claims?.sub;
        if (user) {
          const tenants = await storage.getTenantsByUser(user);
          if (tenants.length > 0) {
            const patients = await storage.getPatientsByTenant(tenants[0].id);
            healthMonitor.updateTotalPatientCount(patients.length);
          }
        }
      } catch (error) {
        // Ignore errors getting patient count for health check
      }
      
      res.json({
        status: healthStatus.status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: {
          connected: dbTest.success,
          responseTime: dbTest.responseTime,
          error: dbTest.error
        },
        issues: healthStatus.issues,
        metrics: {
          database: detailedMetrics.database,
          encryption: detailedMetrics.encryption,
          system: {
            uptimeMinutes: Math.round(detailedMetrics.system.uptime / 60),
            memoryUsageMB: Math.round(detailedMetrics.system.memoryUsage.heapUsed / 1024 / 1024),
            memoryTotalMB: Math.round(detailedMetrics.system.memoryUsage.heapTotal / 1024 / 1024)
          }
        }
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check system failure',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Detailed health report endpoint (admin only)
  app.get('/api/health/report', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if user has admin access to at least one tenant
      const tenants = await storage.getTenantsByUser(userId);
      const hasAdminAccess = await Promise.all(
        tenants.map(async tenant => {
          try {
            const userRole = await storage.getUserTenantRole(userId, tenant.id);
            return userRole?.role === 'Admin'; // Only Admin role access for health reports
          } catch (error) {
            return false;
          }
        })
      ).then(results => results.some(isAdmin => isAdmin));
      
      if (!hasAdminAccess) {
        return res.status(403).json({ message: "Admin access required for detailed health report" });
      }
      
      const { healthMonitor } = await import('./services/healthMonitoring.js');
      const report = healthMonitor.generateHealthReport();
      
      res.type('text/plain').send(report);
    } catch (error) {
      console.error('Health report generation failed:', error);
      res.status(500).json({ message: "Failed to generate health report" });
    }
  });

  // Encounter Note Recovery Endpoints (Phase 5 Task 4)
  app.post('/api/recovery/scan', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.body;
      
      // Get user's admin tenants
      const tenants = await storage.getTenantsByUser(userId);
      const adminTenants = await Promise.all(
        tenants.map(async tenant => {
          try {
            const userRole = await storage.getUserTenantRole(userId, tenant.id);
            return userRole?.role === 'Admin' ? tenant.id : null;
          } catch (error) {
            return null;
          }
        })
      ).then(results => results.filter(id => id !== null));
      
      if (adminTenants.length === 0) {
        return res.status(403).json({ message: "Admin access required for corruption scanning" });
      }

      // If tenantId specified, verify user is admin of that tenant
      if (tenantId && !adminTenants.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied: Not admin of specified tenant" });
      }

      const { encounterRecovery } = await import('./services/encounterRecovery.js');
      
      // Run corruption scan only on user's admin tenants
      const scanTenantId = tenantId || adminTenants[0]; // Use first admin tenant if none specified
      const report = await encounterRecovery.scanForCorruption(scanTenantId);
      
      res.json({
        success: true,
        timestamp: new Date().toISOString(),
        report
      });
    } catch (error) {
      console.error('Corruption scan failed:', error);
      res.status(500).json({ message: "Failed to perform corruption scan" });
    }
  });

  app.get('/api/recovery/report', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check admin access
      const tenants = await storage.getTenantsByUser(userId);
      const hasAdminAccess = await Promise.all(
        tenants.map(async tenant => {
          try {
            const userRole = await storage.getUserTenantRole(userId, tenant.id);
            return userRole?.role === 'Admin';
          } catch (error) {
            return false;
          }
        })
      ).then(results => results.some(isAdmin => isAdmin));
      
      if (!hasAdminAccess) {
        return res.status(403).json({ message: "Admin access required for recovery reports" });
      }

      const { encounterRecovery } = await import('./services/encounterRecovery.js');
      const report = encounterRecovery.generateRecoveryReport();
      
      res.type('text/plain').send(report);
    } catch (error) {
      console.error('Recovery report generation failed:', error);
      res.status(500).json({ message: "Failed to generate recovery report" });
    }
  });

  app.post('/api/recovery/:encounterId/restore', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterId } = req.params;
      const { backupNotes } = req.body;
      
      if (!Array.isArray(backupNotes)) {
        return res.status(400).json({ message: "backupNotes must be an array of strings" });
      }

      // Get user's admin tenants
      const tenants = await storage.getTenantsByUser(userId);
      const adminTenants = await Promise.all(
        tenants.map(async tenant => {
          try {
            const userRole = await storage.getUserTenantRole(userId, tenant.id);
            return userRole?.role === 'Admin' ? tenant.id : null;
          } catch (error) {
            return null;
          }
        })
      ).then(results => results.filter(id => id !== null));
      
      if (adminTenants.length === 0) {
        return res.status(403).json({ message: "Admin access required for encounter restoration" });
      }

      // Verify encounter belongs to one of user's admin tenants
      const encounter = await storage.getEncounter(encounterId);
      if (!encounter) {
        return res.status(404).json({ message: "Encounter not found" });
      }

      const patient = await storage.getPatient(encounter.patientId);
      if (!patient || !adminTenants.includes(patient.tenantId)) {
        return res.status(403).json({ message: "Access denied: Encounter not in your admin tenants" });
      }

      const { encounterRecovery } = await import('./services/encounterRecovery.js');
      const success = await encounterRecovery.recoverFromBackup(encounterId, backupNotes);
      
      if (success) {
        // Track audit activity
        await trackActivity(
          patient.tenantId,
          userId,
          'restore',
          'encounter',
          encounterId,
          `Encounter restored from backup`
        );
        
        res.json({
          success: true,
          message: `Encounter ${encounterId} successfully restored`,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({ message: "Failed to restore encounter from backup" });
      }
    } catch (error) {
      console.error('Encounter restoration failed:', error);
      res.status(500).json({ message: "Failed to restore encounter" });
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
        notes: await decryptEncounterNotes(encounter.encryptedNotes as string[], encounter.id),
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
      const decryptedEncounters = await Promise.all(encounters.map(async encounter => {
        try {
          return {
            ...encounter,
            notes: await decryptEncounterNotes(encounter.encryptedNotes as string[], encounter.id),
          };
        } catch (error: any) {
          console.error(`Error decrypting encounter ${encounter.id} notes:`, error.message);
          return {
            ...encounter,
            notes: ['[DECRYPTION ERROR - ENCRYPTED DATA CORRUPTED]'],
          };
        }
      }));

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

      // Send response immediately to prevent blocking on activity tracking
      res.status(201).json(episode);
      
      // Track activity asynchronously after response (fire-and-forget)
      setImmediate(async () => {
        try {
          await trackActivity(patient.tenantId, userId, 'CREATE_EPISODE', 'Episode', episode.id, `${episodeData.woundType} episode`);
        } catch (activityError) {
          console.error('Non-critical: Failed to track episode creation activity:', activityError);
        }
      });
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

  // Get encounters for a specific episode
  app.get('/api/episodes/:episodeId/encounters', isAuthenticated, async (req: any, res) => {
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

      const encounters = await storage.getEncountersByEpisode(episodeId);
      
      // Decrypt encounter notes with safe error handling
      const decryptedEncounters = await Promise.all(encounters.map(async encounter => {
        try {
          return {
            ...encounter,
            notes: await decryptEncounterNotes(encounter.encryptedNotes as string[], encounter.id),
          };
        } catch (error: any) {
          console.error(`Error decrypting encounter ${encounter.id} notes:`, error.message);
          return {
            ...encounter,
            notes: ['[DECRYPTION ERROR - ENCRYPTED DATA CORRUPTED]'],
          };
        }
      }));

      res.json(decryptedEncounters);
    } catch (error) {
      console.error("Error fetching episode encounters:", error);
      res.status(500).json({ message: "Failed to fetch episode encounters" });
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

      // Send response immediately to prevent blocking on activity tracking
      res.json(updatedEpisode);
      
      // Track activity asynchronously after response (fire-and-forget)
      setImmediate(async () => {
        try {
          await trackActivity(patient.tenantId, userId, 'UPDATE_EPISODE', 'Episode', episode.id, `${episodeData.woundType || 'Unknown'} episode`);
        } catch (activityError) {
          console.error('Non-critical: Failed to track episode update activity:', activityError);
        }
      });
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

      // Send response immediately to prevent blocking on activity tracking
      res.status(204).send();
      
      // Track activity asynchronously after response (fire-and-forget)
      setImmediate(async () => {
        try {
          await trackActivity(patient.tenantId, userId, 'DELETE_EPISODE', 'Episode', episode.id, `${episode.woundType} episode`);
        } catch (activityError) {
          console.error('Non-critical: Failed to track episode deletion activity:', activityError);
        }
      });
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
        notes: await decryptEncounterNotes(updatedEncounter.encryptedNotes as string[], updatedEncounter.id),
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
      const { macRegion: requestMacRegion } = req.body;
      
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

      // Use MAC region from request body (user selection) or fall back to patient's stored MAC region
      const macRegion = requestMacRegion?.trim() || patient.macRegion?.trim();
      
      // Validate MAC region is present before proceeding with eligibility analysis
      if (!macRegion) {
        return res.status(422).json({ 
          message: "MAC region is required for eligibility analysis. Please select a MAC region or update the patient's profile to include their MAC region.",
          error: "MISSING_MAC_REGION",
          patientId: patient.id
        });
      }

      // Extract patient characteristics for better policy selection
      const patientCharacteristics = {
        isDiabetic: (encounter as any).diabeticStatus === 'diabetic' || 
                   ((encounter.woundDetails as any)?.diabeticStatus === 'diabetic'),
        hasVenousDisease: (encounter.woundDetails as any)?.venousDisease === true ||
                         ((encounter as any).comorbidities?.includes('venous disease'))
      };

      // Extract ICD-10 codes from encounter for enhanced policy matching
      const icd10Codes: string[] = [];
      if (encounter.primaryDiagnosis) {
        icd10Codes.push(encounter.primaryDiagnosis);
      }
      if (encounter.secondaryDiagnoses && Array.isArray(encounter.secondaryDiagnoses)) {
        icd10Codes.push(...encounter.secondaryDiagnoses);
      }

      // Build RAG context with enhanced policy selection using patient characteristics and ICD-10 codes
      const ragContext = await buildRAGContext(
        macRegion,
        (encounter.woundDetails as any)?.type || 'DFU',
        (encounter.woundDetails as any)?.location,
        patientCharacteristics,
        icd10Codes  // Pass ICD-10 codes for better matching
      );

      // Log policy selection result for audit purposes
      if (ragContext.selectedPolicyId) {
        console.log(`Policy selection successful: Selected LCD ${ragContext.selectedPolicyId} for MAC ${macRegion}, wound type: ${(encounter.woundDetails as any)?.type || 'DFU'}`);
      } else {
        console.warn(`Policy selection failed: No applicable policy found for MAC ${macRegion}, wound type: ${(encounter.woundDetails as any)?.type || 'DFU'}. Reason: ${ragContext.audit?.selectedReason}`);
      }

      // Get ALL encounters in the episode for complete context
      let allEpisodeEncounters: any[] = [];
      if (encounter.episodeId) {
        allEpisodeEncounters = await storage.getEncountersByEpisode(encounter.episodeId);
      } else {
        // If no episode, just use the current encounter
        allEpisodeEncounters = [encounter];
      }

      // Decrypt all encounter notes and build complete episode context
      const episodeContext = await Promise.all(
        allEpisodeEncounters
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(async (enc) => {
            const decryptedNotes = await decryptEncounterNotes(enc.encryptedNotes as string[], enc.id);
            return {
              date: enc.date,
              notes: decryptedNotes,
              woundDetails: enc.woundDetails,
              conservativeCare: enc.conservativeCare,
              procedureCodes: (enc as any).procedureCodes || [],
              vascularAssessment: (enc as any).vascularAssessment || {},
              functionalStatus: (enc as any).functionalStatus || {},
              diabeticStatus: (enc as any).diabeticStatus || null,
              infectionStatus: enc.infectionStatus,
              comorbidities: enc.comorbidities,
            };
          })
      );

      // Perform AI eligibility analysis with COMPLETE episode context
      const { analyzeEligibilityWithFullContext } = await import('./services/openai');
      const analysisResult = await analyzeEligibilityWithFullContext({
        currentEncounter: {
          encounterNotes: await decryptEncounterNotes(encounter.encryptedNotes as string[], encounter.id),
          woundDetails: encounter.woundDetails,
          conservativeCare: encounter.conservativeCare,
          procedureCodes: (encounter as any).procedureCodes || [],
          vascularAssessment: (encounter as any).vascularAssessment || {},
          functionalStatus: (encounter as any).functionalStatus || {},
          diabeticStatus: (encounter as any).diabeticStatus || null,
        },
        episodeContext: episodeContext,
        patientInfo: {
          payerType: patient.payerType,
          planName: patient.planName || undefined,
          insuranceId: patient.insuranceId || undefined,
          secondaryPayerType: patient.secondaryPayerType || undefined,
          secondaryPlanName: patient.secondaryPlanName || undefined,
          secondaryInsuranceId: patient.secondaryInsuranceId || undefined,
          macRegion: macRegion, // Use the selected MAC region from request or patient record
        },
        policyContext: ragContext.content,
      });

      // Store eligibility check result with policy selection data
      const eligibilityCheck = await storage.createEligibilityCheck({
        encounterId: encounter.id,
        result: analysisResult,
        citations: [...ragContext.citations, ...analysisResult.citations],
        llmModel: 'gpt-4o-mini',
        selectedPolicyId: ragContext.selectedPolicyId,
        selectionAudit: ragContext.audit,
      });

      // Fetch selected policy details if available
      let selectedPolicy = null;
      if (ragContext.selectedPolicyId) {
        selectedPolicy = await storage.getPolicySource(ragContext.selectedPolicyId);
      }

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

      res.json({
        ...eligibilityCheck,
        selectedPolicy,
        selectionAudit: ragContext.audit
      });
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
      const { macRegion: requestMacRegion } = req.body;
      
      // Debug logging
      console.log('Episode analysis request body:', req.body);
      console.log('Request MAC region:', requestMacRegion);
      
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

      // Use MAC region from request body (user selection) or fall back to patient's stored MAC region
      const macRegion = requestMacRegion?.trim() || patient.macRegion?.trim();
      
      // Validate MAC region is present before proceeding with eligibility analysis
      if (!macRegion) {
        return res.status(422).json({ 
          message: "MAC region is required for eligibility analysis. Please select a MAC region or update the patient's profile to include their MAC region.",
          error: "MISSING_MAC_REGION",
          patientId: patient.id
        });
      }

      // Get encounters first to validate episode before expensive analysis
      const encounters = await storage.getEncountersByEpisode(episodeId);
      if (encounters.length === 0) {
        return res.status(400).json({ message: "No encounters found for this episode" });
      }

      // Extract patient characteristics from all encounters in the episode
      // Use the most recent encounter data for characteristics, fall back to episode data
      const latestEncounter = encounters.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const patientCharacteristics = {
        isDiabetic: (latestEncounter as any).diabeticStatus === 'diabetic' || 
                   ((latestEncounter.woundDetails as any)?.diabeticStatus === 'diabetic') ||
                   encounters.some(enc => (enc as any).diabeticStatus === 'diabetic'),
        hasVenousDisease: (latestEncounter.woundDetails as any)?.venousDisease === true ||
                         ((latestEncounter as any).comorbidities?.includes('venous disease')) ||
                         encounters.some(enc => (enc.woundDetails as any)?.venousDisease === true)
      };

      // Collect ICD-10 codes from episode and all encounters for comprehensive matching
      const icd10Codes: string[] = [];
      
      // Add episode-level diagnoses
      if (episode.primaryDiagnosis) {
        icd10Codes.push(episode.primaryDiagnosis);
      }
      if (episode.secondaryDiagnoses && Array.isArray(episode.secondaryDiagnoses)) {
        icd10Codes.push(...episode.secondaryDiagnoses);
      }
      
      // Add encounter-level diagnoses (deduplicated)
      const uniqueCodes = new Set(icd10Codes);
      encounters.forEach(enc => {
        if (enc.primaryDiagnosis) {
          uniqueCodes.add(enc.primaryDiagnosis);
        }
        if (enc.secondaryDiagnoses && Array.isArray(enc.secondaryDiagnoses)) {
          enc.secondaryDiagnoses.forEach(code => uniqueCodes.add(code));
        }
      });
      const allIcd10Codes = Array.from(uniqueCodes);

      // Build RAG context with enhanced policy selection using patient characteristics and ICD-10 codes
      const ragContext = await buildRAGContext(
        macRegion,
        episode.woundType || 'DFU',
        episode.woundLocation || (latestEncounter.woundDetails as any)?.location,
        patientCharacteristics,
        allIcd10Codes  // Pass all relevant ICD-10 codes for comprehensive matching
      );

      // Log policy selection result for audit purposes
      if (ragContext.selectedPolicyId) {
        console.log(`Episode-level policy selection successful: Selected LCD ${ragContext.selectedPolicyId} for MAC ${macRegion}, wound type: ${episode.woundType || 'DFU'}`);
      } else {
        console.warn(`Episode-level policy selection failed: No applicable policy found for MAC ${macRegion}, wound type: ${episode.woundType || 'DFU'}. Reason: ${ragContext.audit?.selectedReason}`);
      }

      // Perform enhanced AI episode-level eligibility analysis with full patient history (NEW DEFAULT)
      const { prepareAndAnalyzeEpisodeWithFullHistory } = await import('./services/openai');
      const analysisResult = await prepareAndAnalyzeEpisodeWithFullHistory(
        storage,
        episodeId,
        patient.id,
        {
          payerType: patient.payerType,
          macRegion: macRegion, // Use the selected MAC region from request or patient record
        },
        ragContext.content
      );

      // Use the already extracted latestEncounter for eligibility check linking

      // Store eligibility check result with episodeId and policy selection data
      const eligibilityCheck = await storage.createEligibilityCheck({
        encounterId: latestEncounter.id, // Link to the latest encounter
        episodeId: episode.id, // Link to the episode for episode-level analysis
        result: analysisResult,
        citations: [...ragContext.citations, ...analysisResult.citations],
        llmModel: 'gpt-4o-mini',
        selectedPolicyId: ragContext.selectedPolicyId,
        selectionAudit: ragContext.audit,
      });

      // Fetch selected policy details if available
      let selectedPolicy = null;
      if (ragContext.selectedPolicyId) {
        selectedPolicy = await storage.getPolicySource(ragContext.selectedPolicyId);
      }

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

      res.json({
        ...eligibilityCheck,
        selectedPolicy,
        selectionAudit: ragContext.audit
      });
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

  // Bulk endpoint for Documents page performance optimization
  app.get('/api/patients-with-eligibility/:tenantId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const patientsWithEligibility = await storage.getAllPatientsWithEligibilityByTenant(tenantId);
      
      // Log audit event for bulk PHI access
      await storage.createAuditLog({
        tenantId,
        userId,
        action: 'VIEW_BULK_PATIENTS_ELIGIBILITY',
        entity: 'Patient',
        entityId: `bulk-eligibility-${tenantId}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(patientsWithEligibility);
    } catch (error) {
      console.error("Error fetching patients with eligibility:", error);
      res.status(500).json({ message: "Failed to fetch patients with eligibility" });
    }
  });

  // Bulk endpoint for Documents page - get all patients with their documents
  app.get('/api/patients-with-documents/:tenantId', isAuthenticated, async (req: any, res) => {
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

  // ===============================================================================
  // PHASE 5.1: DIAGNOSIS VALIDATION API ENDPOINTS
  // ===============================================================================

  // Run diagnosis validation on an encounter
  app.post('/api/encounters/:encounterId/validate-diagnosis', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { encounterId } = req.params;
      const { primaryDiagnosis, secondaryDiagnoses } = req.body;
      
      if (!primaryDiagnosis) {
        return res.status(400).json({ message: "Primary diagnosis is required" });
      }

      const encounter = await storage.getEncounter(encounterId);
      if (!encounter) {
        return res.status(404).json({ message: "Encounter not found" });
      }

      const patient = await storage.getPatient(encounter.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify access
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get or create eligibility check for this encounter
      let eligibilityChecks = await storage.getEligibilityChecksByEncounter(encounterId);
      let currentCheck = eligibilityChecks[0];
      
      if (!currentCheck) {
        // Create new eligibility check
        currentCheck = await storage.createEligibilityCheck({
          encounterId: encounterId,
          episodeId: encounter.episodeId,
          result: { status: 'in_progress', eligibility: 'pending', rationale: 'Diagnosis validation in progress' },
          citations: [],
          llmModel: 'gpt-4',
          primaryDiagnosis,
          secondaryDiagnoses: secondaryDiagnoses || []
        });
      }

      // Run comprehensive diagnosis validation
      console.log(`[DIAGNOSIS_VALIDATION] Starting validation for encounter ${encounterId}`);
      
      // 1. Validate diagnosis codes
      const diagnosisValidationResult = await validateDiagnosisCodes(primaryDiagnosis, secondaryDiagnoses);
      console.log(`[DIAGNOSIS_VALIDATION] Code validation complete:`, diagnosisValidationResult);
      
      // 2. Assess clinical necessity - get wound characteristics and treatment history
      const woundCharacteristics = encounter.woundDetails || {};
      const treatmentHistory = encounter.conservativeCare || {};
      const patientCondition = { vascularAssessment: encounter.vascularAssessment };
      const clinicalNecessityResult = assessClinicalNecessity([primaryDiagnosis], woundCharacteristics, treatmentHistory, patientCondition);
      console.log(`[DIAGNOSIS_VALIDATION] Clinical necessity assessment complete:`, clinicalNecessityResult);
      
      // 3. Map to wound type
      const woundTypeMappingResult = await mapICD10ToWoundType(primaryDiagnosis);
      console.log(`[DIAGNOSIS_VALIDATION] Wound type mapping complete:`, woundTypeMappingResult);
      
      // 4. Analyze complexity
      const patientHistory = { treatmentFailures: encounter.functionalStatus ? 0 : 1 }; // Basic history derivation
      const complexityResult = analyzeDiagnosisComplexity(primaryDiagnosis, secondaryDiagnoses || [], patientHistory, woundCharacteristics);
      console.log(`[DIAGNOSIS_VALIDATION] Complexity analysis complete:`, complexityResult);
      
      // 5. Generate recommendations
      const recommendationsResult = generateDiagnosisRecommendations(
        diagnosisValidationResult, 
        clinicalNecessityResult,
        complexityResult,
        woundTypeMappingResult
      );
      console.log(`[DIAGNOSIS_VALIDATION] Recommendations generated:`, recommendationsResult);

      // Calculate overall scores
      const overallValidationScore = Math.round(
        (diagnosisValidationResult.validationScore * 0.3 +
         clinicalNecessityResult.necessityScore * 0.4 +
         complexityResult.complexityScore * 0.3)
      );

      // Update eligibility check with diagnosis validation results
      const updatedCheck = await storage.updateEligibilityCheckWithDiagnosisValidation(currentCheck.id, {
        primaryDiagnosis,
        secondaryDiagnoses: secondaryDiagnoses || [],
        diagnosisValidationResult,
        diagnosisValidationScore: diagnosisValidationResult.validationScore,
        diagnosisValidationStatus: diagnosisValidationResult.isValid ? 'passed' : 'failed',
        clinicalNecessityResult,
        clinicalNecessityScore: clinicalNecessityResult.necessityScore,
        clinicalNecessityLevel: clinicalNecessityResult.necessityLevel,
        woundTypeMappingResult,
        mappedWoundType: woundTypeMappingResult.woundType,
        woundMappingConfidence: woundTypeMappingResult.confidence,
        diagnosisComplexityResult: complexityResult,
        complexityScore: complexityResult.complexityScore,
        complexityLevel: complexityResult.complexityLevel,
        diagnosisRecommendationsResult: recommendationsResult,
        recommendationsCount: recommendationsResult.recommendations.length,
        criticalRecommendationsCount: recommendationsResult.recommendations.filter(r => r.priority === 'critical').length,
        overallDiagnosisScore: overallValidationScore,
        diagnosisValidationTimestamp: new Date(),
        diagnosisValidationVersion: '1.0.0',
        validationAuditTrail: {
          validatedBy: userId,
          validatedAt: new Date(),
          validationSteps: ['codeValidation', 'clinicalNecessity', 'woundMapping', 'complexity', 'recommendations']
        }
      });

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'VALIDATE_DIAGNOSIS',
        entity: 'Encounter',
        entityId: encounterId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Track activity
      await trackActivity(
        patient.tenantId,
        userId,
        'Validated diagnosis',
        'Encounter',
        encounterId,
        `Diagnosis validation for ${primaryDiagnosis}`
      );

      console.log(`[DIAGNOSIS_VALIDATION] Validation complete for encounter ${encounterId}, overall score: ${overallValidationScore}`);

      res.json({
        success: true,
        eligibilityCheck: updatedCheck,
        validationResults: {
          diagnosisValidation: diagnosisValidationResult,
          clinicalNecessity: clinicalNecessityResult,
          woundTypeMapping: woundTypeMappingResult,
          complexityAnalysis: complexityResult,
          recommendations: recommendationsResult,
          overallScore: overallValidationScore
        }
      });

    } catch (error) {
      console.error("Error validating diagnosis:", error);
      res.status(500).json({ message: "Failed to validate diagnosis" });
    }
  });

  // Get diagnosis validation results for an encounter
  app.get('/api/encounters/:encounterId/diagnosis-validation', isAuthenticated, async (req: any, res) => {
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

      // Verify access
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const validationResults = await storage.getEligibilityChecksWithDiagnosisValidation(encounterId);
      res.json(validationResults);

    } catch (error) {
      console.error("Error fetching diagnosis validation results:", error);
      res.status(500).json({ message: "Failed to fetch diagnosis validation results" });
    }
  });

  // Get diagnosis validation metrics for current tenant
  app.get('/api/diagnosis-validation-metrics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { startDate, endDate } = req.query;

      // Get user's tenants
      const tenants = await storage.getTenantsByUser(userId);
      if (tenants.length === 0) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const currentTenant = tenants[0];
      
      let dateRange;
      if (startDate && endDate) {
        dateRange = {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        };
      }

      const metrics = await storage.getDiagnosisValidationMetrics(currentTenant.id, dateRange);
      res.json(metrics);

    } catch (error) {
      console.error("Error fetching diagnosis validation metrics:", error);
      res.status(500).json({ message: "Failed to fetch diagnosis validation metrics" });
    }
  });

  // Get failed diagnosis validations for review
  app.get('/api/failed-diagnosis-validations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get user's tenants
      const tenants = await storage.getTenantsByUser(userId);
      if (tenants.length === 0) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const currentTenant = tenants[0];
      const failedValidations = await storage.getFailedDiagnosisValidations(currentTenant.id);

      res.json(failedValidations);

    } catch (error) {
      console.error("Error fetching failed diagnosis validations:", error);
      res.status(500).json({ message: "Failed to fetch failed diagnosis validations" });
    }
  });

  // Get diagnosis validations with critical recommendations
  app.get('/api/critical-diagnosis-recommendations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;

      // Get user's tenants
      const tenants = await storage.getTenantsByUser(userId);
      if (tenants.length === 0) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const currentTenant = tenants[0];
      const criticalRecommendations = await storage.getDiagnosisValidationsWithCriticalRecommendations(currentTenant.id);

      res.json(criticalRecommendations);

    } catch (error) {
      console.error("Error fetching critical diagnosis recommendations:", error);
      res.status(500).json({ message: "Failed to fetch critical diagnosis recommendations" });
    }
  });

  // Get recent diagnosis validations for current tenant
  app.get('/api/recent-diagnosis-validations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const limit = parseInt(req.query.limit as string) || 20;

      // Get user's tenants
      const tenants = await storage.getTenantsByUser(userId);
      if (tenants.length === 0) {
        return res.status(403).json({ message: "No tenant access" });
      }

      const currentTenant = tenants[0];
      const recentValidations = await storage.getDiagnosisValidationsByTenant(currentTenant.id, limit);

      res.json(recentValidations);

    } catch (error) {
      console.error("Error fetching recent diagnosis validations:", error);
      res.status(500).json({ message: "Failed to fetch recent diagnosis validations" });
    }
  });

  // PHASE 5.2: ICD-10 REAL-TIME SEARCH AND VALIDATION API ENDPOINTS

  // Search ICD-10 codes for autocomplete functionality
  app.get('/api/icd10/search', isAuthenticated, async (req: any, res) => {
    try {
      const { query, limit = 10 } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ message: "Search query is required" });
      }

      if (query.length < 2) {
        return res.json([]);
      }

      // Use the searchICD10Codes function to find matching codes  
      const results = searchICD10Codes(query).slice(0, parseInt(limit));

      res.json(results);

    } catch (error) {
      console.error("Error searching ICD-10 codes:", error);
      res.status(500).json({ message: "Failed to search ICD-10 codes" });
    }
  });

  // Validate a specific ICD-10 code
  app.post('/api/icd10/validate', isAuthenticated, async (req: any, res) => {
    try {
      const { code } = req.body;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({ message: "ICD-10 code is required" });
      }

      // Validate the code structure and format
      const validation = validateICD10Format(code);
      
      // Try to find the code in the database
      const codeData = getCodeByCode(code);

      res.json({
        code,
        validation,
        codeData,
        isValid: validation.isValid && !!codeData
      });

    } catch (error) {
      console.error("Error validating ICD-10 code:", error);
      res.status(500).json({ message: "Failed to validate ICD-10 code" });
    }
  });

  // Get detailed information for a specific ICD-10 code
  app.get('/api/icd10/code/:code', isAuthenticated, async (req: any, res) => {
    try {
      const { code } = req.params;

      if (!code) {
        return res.status(400).json({ message: "ICD-10 code is required" });
      }

      // Find the code in the database
      const codeData = getCodeByCode(code);

      if (!codeData) {
        return res.status(404).json({ message: "ICD-10 code not found in database" });
      }

      // Also validate the code structure
      const validation = validateICD10Format(code);

      res.json({
        code,
        validation,
        codeData,
        isValid: validation.isValid
      });

    } catch (error) {
      console.error("Error fetching ICD-10 code details:", error);
      res.status(500).json({ message: "Failed to fetch ICD-10 code details" });
    }
  });

  // Analytics Export Endpoints
  app.get('/api/analytics/export/clinical-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, startDate, endDate, providerId, format = 'csv' } = req.query;
      
      // Validate format
      if (!['csv', 'pdf'].includes(format)) {
        return res.status(400).json({ message: "Format must be 'csv' or 'pdf'" });
      }

      // Get user's tenants
      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId || !accessibleTenantIds.includes(targetTenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      // Parse date range
      let parsedStartDate, parsedEndDate;
      if (startDate && endDate) {
        parsedStartDate = new Date(startDate);
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
      } else {
        // Default to last 30 days
        parsedEndDate = new Date();
        parsedStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      // Get clinical data for export
      const [episodesData, encountersData, patients] = await Promise.all([
        storage.getAllEpisodesWithPatientsByTenant(targetTenantId),
        storage.getAllEncountersWithPatientsByTenant(targetTenantId),
        storage.getPatientsByTenant(targetTenantId)
      ]);

      // Extract episodes and encounters from the enriched data
      const episodes: Episode[] = episodesData.map(item => ({
        id: item.id,
        patientId: item.patientId,
        episodeStartDate: item.episodeStartDate,
        episodeEndDate: item.episodeEndDate,
        status: item.status,
        woundType: item.woundType,
        woundLocation: item.woundLocation,
        primaryDiagnosis: item.primaryDiagnosis,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }));
      
      const encounters: Encounter[] = encountersData.map(item => ({
        id: item.id,
        patientId: item.patientId,
        episodeId: item.episodeId,
        date: item.date,
        encryptedNotes: item.encryptedNotes,
        woundDetails: item.woundDetails,
        conservativeCare: item.conservativeCare,
        procedureCodes: item.procedureCodes,
        vascularAssessment: item.vascularAssessment,
        functionalStatus: item.functionalStatus,
        diabeticStatus: item.diabeticStatus,
        infectionStatus: item.infectionStatus,
        comorbidities: item.comorbidities,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        attachmentMetadata: item.attachmentMetadata
      }));

      // Filter by date range and provider
      const filteredEpisodes = episodes.filter((episode: Episode) => {
        const episodeDate = new Date(episode.episodeStartDate || episode.createdAt || '');
        if (isNaN(episodeDate.getTime())) return false;
        if (episodeDate < parsedStartDate || episodeDate > parsedEndDate) return false;
        // Add provider filtering if implemented in schema
        return true;
      });

      // Prepare clinical summary data
      const clinicalData = filteredEpisodes.map((episode: Episode) => {
        // Get patient name from enriched episodes data which has decrypted names
        const episodeData = episodesData.find(item => item.id === episode.id);
        const patientName = episodeData ? episodeData.patientName : 'Unknown';
        const episodeEncounters = encounters.filter((e: Encounter) => e.episodeId === episode.id);
        
        return {
          patientId: patientName,
          episodeId: episode.id,
          woundType: episode.woundType,
          woundLocation: episode.woundLocation,
          startDate: episode.episodeStartDate,
          status: episode.status,
          totalEncounters: episodeEncounters.length,
          primaryDiagnosis: episode.primaryDiagnosis,
          healingProgress: 'Calculating...', // Would calculate from encounters
          complianceStatus: 'Compliant' // Would calculate from assessments
        };
      });

      if (format === 'csv') {
        // Generate CSV
        const csvHeaders = 'Patient,Episode ID,Wound Type,Location,Start Date,Status,Encounters,Primary Diagnosis,Healing Progress,Compliance\n';
        const csvRows = clinicalData.map((row: typeof clinicalData[0]) => 
          `"${row.patientId}","${row.episodeId}","${row.woundType || ''}","${row.woundLocation || ''}","${row.startDate || ''}","${row.status || ''}","${row.totalEncounters}","${row.primaryDiagnosis || ''}","${row.healingProgress}","${row.complianceStatus}"`
        ).join('\n');
        
        const csvContent = csvHeaders + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="clinical-summary-${parsedStartDate.toISOString().split('T')[0]}-to-${parsedEndDate.toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
      } else {
        // Generate PDF using existing document generation infrastructure
        const pdfContent = `Clinical Summary Report\n\nDate Range: ${parsedStartDate.toDateString()} to ${parsedEndDate.toDateString()}\nTotal Episodes: ${clinicalData.length}\n\n` +
          clinicalData.map((row: typeof clinicalData[0]) => 
            `Patient: ${row.patientId}\nEpisode: ${row.episodeId}\nWound: ${row.woundType} at ${row.woundLocation}\nStatus: ${row.status}\nEncounters: ${row.totalEncounters}\n---\n`
          ).join('');
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="clinical-summary-${parsedStartDate.toISOString().split('T')[0]}-to-${parsedEndDate.toISOString().split('T')[0]}.pdf"`);
        res.send(pdfContent); // TODO: Implement actual PDF generation
      }

      // Log audit event
      await storage.createAuditLog({
        tenantId: targetTenantId,
        userId,
        action: 'EXPORT_CLINICAL_SUMMARY',
        entity: 'Analytics',
        entityId: `export-${targetTenantId}-${Date.now()}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: ''
      });

      await trackActivity(targetTenantId, userId, 'export', 'clinical_summary', `${format}_export`);

    } catch (error) {
      console.error('Error exporting clinical summary:', error);
      res.status(500).json({ message: "Failed to export clinical summary" });
    }
  });

  app.get('/api/analytics/export/compliance-report', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, startDate, endDate, format = 'csv' } = req.query;
      
      // Validate format
      if (!['csv', 'pdf'].includes(format)) {
        return res.status(400).json({ message: "Format must be 'csv' or 'pdf'" });
      }

      // Get user's tenants
      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId || !accessibleTenantIds.includes(targetTenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      // Parse date range
      let parsedStartDate, parsedEndDate;
      if (startDate && endDate) {
        parsedStartDate = new Date(startDate);
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
      } else {
        // Default to last 30 days
        parsedEndDate = new Date();
        parsedStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      // Get compliance tracking data
      const complianceData = await storage.getComplianceTrackingByDateRange(
        targetTenantId, 
        parsedStartDate, 
        parsedEndDate
      );
      
      // Prepare compliance report data
      const reportData = complianceData.map((compliance: ComplianceTracking) => ({
        assessmentDate: compliance.assessmentDate,
        episodeId: compliance.episodeId || 'N/A',
        assessmentType: compliance.assessmentType,
        complianceScore: compliance.overallComplianceScore || 0,
        riskLevel: compliance.complianceRiskLevel || 'Unknown',
        findings: (compliance.identifiedGaps as string[])?.join('; ') || '',
        recommendations: (compliance.correctiveActions as string[])?.join('; ') || '',
        status: (compliance.overallComplianceScore || 0) >= 90 ? 'Compliant' : (compliance.overallComplianceScore || 0) >= 70 ? 'At Risk' : 'Non-Compliant'
      }));

      if (format === 'csv') {
        // Generate CSV
        const csvHeaders = 'Assessment Date,Episode ID,Assessment Type,Compliance Score,Risk Level,Status,Findings,Recommendations\n';
        const csvRows = reportData.map((row: typeof reportData[0]) => 
          `"${row.assessmentDate}","${row.episodeId}","${row.assessmentType}","${row.complianceScore}","${row.riskLevel}","${row.status}","${row.findings}","${row.recommendations}"`
        ).join('\n');
        
        const csvContent = csvHeaders + csvRows;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${parsedStartDate.toISOString().split('T')[0]}-to-${parsedEndDate.toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
      } else {
        // Generate PDF content
        const pdfContent = `Medicare Compliance Report\n\nDate Range: ${parsedStartDate.toDateString()} to ${parsedEndDate.toDateString()}\nTotal Assessments: ${reportData.length}\n\n` +
          reportData.map((row: typeof reportData[0]) => 
            `Assessment: ${row.assessmentType}\nDate: ${row.assessmentDate}\nEpisode: ${row.episodeId}\nScore: ${row.complianceScore}%\nStatus: ${row.status}\nRisk Level: ${row.riskLevel}\nFindings: ${row.findings}\nRecommendations: ${row.recommendations}\n---\n`
          ).join('');
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${parsedStartDate.toISOString().split('T')[0]}-to-${parsedEndDate.toISOString().split('T')[0]}.pdf"`);
        res.send(pdfContent); // TODO: Implement actual PDF generation
      }

      // Log audit event
      await storage.createAuditLog({
        tenantId: targetTenantId,
        userId,
        action: 'EXPORT_COMPLIANCE_REPORT',
        entity: 'Analytics',
        entityId: `export-${targetTenantId}-${Date.now()}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: ''
      });

      await trackActivity(targetTenantId, userId, 'export', 'compliance_report', `${format}_export`);

    } catch (error) {
      console.error('Error exporting compliance report:', error);
      res.status(500).json({ message: "Failed to export compliance report" });
    }
  });

  // Get all available ICD-10 codes (with pagination for large datasets)
  app.get('/api/icd10/codes', isAuthenticated, async (req: any, res) => {
    try {
      const { category, severity, offset = 0, limit = 50 } = req.query;

      let filteredCodes = [...ICD10_DATABASE];

      // Apply category filter
      if (category && typeof category === 'string') {
        filteredCodes = filteredCodes.filter(code => 
          code.category.toLowerCase().includes(category.toLowerCase())
        );
      }

      // Apply severity filter
      if (severity && typeof severity === 'string') {
        filteredCodes = filteredCodes.filter(code => 
          code.severity === severity
        );
      }

      // Apply pagination
      const startIndex = parseInt(offset);
      const pageSize = parseInt(limit);
      const paginatedCodes = filteredCodes.slice(startIndex, startIndex + pageSize);

      res.json({
        codes: paginatedCodes,
        total: filteredCodes.length,
        offset: startIndex,
        limit: pageSize,
        hasMore: startIndex + pageSize < filteredCodes.length
      });

    } catch (error) {
      console.error("Error fetching ICD-10 codes:", error);
      res.status(500).json({ message: "Failed to fetch ICD-10 codes" });
    }
  });

  // Get ICD-10 code categories
  app.get('/api/icd10/categories', isAuthenticated, async (req: any, res) => {
    try {
      // Extract unique categories from the ICD-10 database
      const categories = Array.from(new Set(ICD10_DATABASE.map(code => code.category)));

      res.json(categories.sort());

    } catch (error) {
      console.error("Error fetching ICD-10 categories:", error);
      res.status(500).json({ message: "Failed to fetch ICD-10 categories" });
    }
  });

  // Bulk data endpoints for performance optimization
  app.get('/api/encounters-with-patients/:tenantId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const encountersWithPatients = await storage.getAllEncountersWithPatientsByTenant(tenantId);
      
      // Decrypt encounter notes and remove encrypted notes from response for data minimization
      const encountersWithDecryptedNotes = await Promise.all(encountersWithPatients.map(async encounter => {
        const { encryptedNotes, ...encounterData } = encounter;
        return {
          ...encounterData,
          notes: encryptedNotes ? await decryptEncounterNotes(encryptedNotes as string[], encounter.id) : [],
        };
      }));

      // Log audit event for bulk PHI access
      await storage.createAuditLog({
        tenantId,
        userId,
        action: 'VIEW_BULK_ENCOUNTERS',
        entity: 'Encounter',
        entityId: `bulk-${tenantId}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      res.json(encountersWithDecryptedNotes);
    } catch (error) {
      console.error("Error fetching encounters with patients:", error);
      res.status(500).json({ message: "Failed to fetch encounters with patients" });
    }
  });

  app.get('/api/episodes-with-patients/:tenantId', isAuthenticated, async (req: any, res) => {
    let hasResponded = false;
    
    try {
      const userId = req.user.claims.sub;
      const { tenantId } = req.params;
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        hasResponded = true;
        return res.status(403).json({ message: "Access denied" });
      }

      // Fetch episodes data with improved error handling
      let episodesWithPatients;
      try {
        episodesWithPatients = await storage.getAllEpisodesWithPatientsByTenant(tenantId);
      } catch (dbError) {
        console.error("Database error fetching episodes with patients:", dbError);
        hasResponded = true;
        return res.status(500).json({ 
          message: "Database connection error while fetching episodes",
          error: process.env.NODE_ENV === 'development' ? (dbError as Error).message : undefined
        });
      }

      // Send response immediately to prevent double-response issues
      hasResponded = true;
      res.json(episodesWithPatients);
      
      // Log audit event asynchronously after response (fire-and-forget)
      setImmediate(async () => {
        try {
          await storage.createAuditLog({
            tenantId,
            userId,
            action: 'VIEW_BULK_EPISODES',
            entity: 'Episode',
            entityId: `bulk-${tenantId}`,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            previousHash: '',
          });
        } catch (auditError) {
          console.error('Non-critical: Failed to log audit event for episodes bulk view:', auditError);
        }
      });
      
    } catch (error) {
      console.error("Error fetching episodes with patients:", error);
      if (!hasResponded) {
        res.status(500).json({ message: "Failed to fetch episodes with patients" });
      }
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

  // ===============================================================================
  // PRODUCT APPLICATION WORKFLOW API ROUTES
  // ===============================================================================
  
  // Product Search and Catalog
  app.get('/api/products/search', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { 
        category,
        woundTypes,
        hcpcsCode,
        manufacturerName,
        clinicalEvidenceLevel,
        tenantId 
      } = req.query;
      
      // Verify user has access to tenant
      if (tenantId) {
        const userTenantRole = await storage.getUserTenantRole(userId, tenantId as string);
        if (!userTenantRole) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const filters: any = {
        isActive: true
      };
      
      if (category) filters.category = category;
      if (hcpcsCode) filters.hcpcsCode = hcpcsCode;
      if (manufacturerName) filters.manufacturerName = manufacturerName;
      if (clinicalEvidenceLevel) filters.clinicalEvidenceLevel = clinicalEvidenceLevel;
      if (woundTypes) {
        filters.woundTypes = Array.isArray(woundTypes) ? woundTypes : [woundTypes];
      }

      const products = await storage.searchProducts(filters);

      res.json({
        success: true,
        products,
        total: products.length
      });
    } catch (error) {
      console.error("Error searching products:", error);
      res.status(500).json({ message: "Failed to search products" });
    }
  });

  // Get Product Details with LCD Coverage
  app.get('/api/products/:productId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { productId } = req.params;
      const { macRegion } = req.query;
      
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      let lcdCoverage = null;
      if (macRegion) {
        lcdCoverage = await storage.getActiveLcdCoverageByProduct(productId, macRegion as string);
      }

      res.json({
        success: true,
        product,
        lcdCoverage
      });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Product LCD Coverage Validation
  app.post('/api/products/:productId/validate-coverage', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { productId } = req.params;
      
      const validationSchema = z.object({
        episodeId: z.string().uuid(),
        woundSize: z.number().optional(),
        woundDepth: z.number().optional(),
        diagnosisCodes: z.array(z.string()),
        conservativeCareCompliance: z.boolean().optional(),
        conservativeCareDays: z.number().optional(),
      });
      
      const applicationData = validationSchema.parse(req.body);
      
      // Get episode and validate access
      const episode = await storage.getEpisode(applicationData.episodeId);
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

      // Validate product coverage
      const validation = await storage.validateProductCoverage(
        productId,
        applicationData.episodeId,
        applicationData
      );

      // Check conservative care compliance if required
      let conservativeCareCheck = null;
      if (validation.requirements.includes('conservative_care')) {
        conservativeCareCheck = await storage.checkConservativeCareCompliance(
          applicationData.episodeId,
          30 // Default 30-day requirement
        );
      }

      res.json({
        success: true,
        validation,
        conservativeCareCheck
      });
    } catch (error) {
      console.error("Error validating product coverage:", error);
      res.status(500).json({ message: "Failed to validate product coverage" });
    }
  });

  // Product Application Frequency Validation
  app.post('/api/products/:productId/validate-frequency', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { productId } = req.params;
      
      const validationSchema = z.object({
        patientId: z.string().uuid(),
        episodeId: z.string().uuid(),
        applicationDate: z.string().pipe(z.coerce.date())
      });
      
      const { patientId, episodeId, applicationDate } = validationSchema.parse(req.body);
      
      // Get patient and validate access
      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Validate frequency
      const frequencyValidation = await storage.validateProductApplicationFrequency(
        productId,
        patientId,
        episodeId,
        applicationDate
      );

      res.json({
        success: true,
        frequencyValidation
      });
    } catch (error) {
      console.error("Error validating application frequency:", error);
      res.status(500).json({ message: "Failed to validate application frequency" });
    }
  });

  // Clinical Decision Support - Product Recommendations
  app.post('/api/products/recommendations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      const recommendationSchema = z.object({
        woundType: z.string(),
        woundSize: z.number(),
        diagnosisCodes: z.array(z.string()),
        patientFactors: z.object({
          age: z.number().optional(),
          diabetic: z.boolean().optional(),
          immunocompromised: z.boolean().optional(),
          previousProducts: z.array(z.string()).optional(),
        }).optional(),
        tenantId: z.string().uuid()
      });
      
      const requestData = recommendationSchema.parse(req.body);
      
      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, requestData.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get product recommendations
      const recommendations = await storage.getProductRecommendations(
        requestData.woundType,
        requestData.woundSize,
        requestData.diagnosisCodes,
        requestData.patientFactors
      );

      res.json({
        success: true,
        recommendations
      });
    } catch (error) {
      console.error("Error getting product recommendations:", error);
      res.status(500).json({ message: "Failed to get product recommendations" });
    }
  });

  // Submit Product Application
  app.post('/api/products/applications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const applicationData = insertProductApplicationSchema.parse(req.body);
      
      // Get episode and validate access
      const episode = await storage.getEpisode(applicationData.episodeId);
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

      // Set the applicant user ID
      const applicationWithUser = {
        ...applicationData,
        applicantUserId: userId,
        tenantId: patient.tenantId,
        patientId: patient.id
      };

      // Create the application
      const application = await storage.createProductApplication(applicationWithUser);

      // Log audit event
      await storage.createAuditLog({
        tenantId: patient.tenantId,
        userId,
        action: 'CREATE_PRODUCT_APPLICATION',
        entity: 'ProductApplication',
        entityId: application.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Track recent activity
      await trackActivity(
        patient.tenantId,
        userId,
        'Submitted product application',
        'ProductApplication',
        application.id,
        'Product Application'
      );

      res.json({
        success: true,
        application
      });
    } catch (error) {
      console.error("Error creating product application:", error);
      res.status(500).json({ message: "Failed to create product application" });
    }
  });

  // Get Product Applications by Episode
  app.get('/api/episodes/:episodeId/product-applications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { episodeId } = req.params;
      
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

      const applications = await storage.getProductApplicationsByEpisode(episodeId);

      res.json({
        success: true,
        applications
      });
    } catch (error) {
      console.error("Error fetching product applications:", error);
      res.status(500).json({ message: "Failed to fetch product applications" });
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
      const { macRegion, woundType, woundLocation, icd10Codes, patientCharacteristics } = req.body;

      if (!macRegion || !woundType) {
        return res.status(400).json({ 
          message: "macRegion and woundType are required" 
        });
      }

      const { buildRAGContext } = await import('./services/ragService');
      
      console.log(`Testing RAG retrieval: MAC=${macRegion}, Wound=${woundType}, ICD-10=${icd10Codes?.join(', ') || 'none'} by user: ${userId}`);
      const context = await buildRAGContext(
        macRegion, 
        woundType,
        woundLocation,
        patientCharacteristics,
        icd10Codes
      );
      
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
        
        // Check if this is a validation error (malformed PDF, password-protected, etc.)
        if ((extractionError as any).isValidationError) {
          // Update status to failed with user-friendly message
          await storage.updateFileUploadStatus(uploadId, 'extraction_failed', (extractionError as Error).message);
          return res.status(400).json({ 
            message: (extractionError as Error).message,
            isValidationError: true
          });
        }
        
        // For all other errors, return 500 (server error)
        await storage.updateFileUploadStatus(uploadId, 'extraction_failed', (extractionError as Error).message);
        res.status(500).json({ 
          message: "Failed to extract text from PDF",
          error: process.env.NODE_ENV === 'development' ? (extractionError as Error).message : 'Internal extraction error'
        });
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

  // Get extracted data for a specific upload
  app.get('/api/upload/:uploadId/extracted-data', isAuthenticated, async (req: any, res) => {
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

      // Get the extracted data
      const extractedData = await storage.getPdfExtractedDataByFileUpload(uploadId);
      if (!extractedData) {
        return res.status(404).json({ 
          message: "No extracted data found",
          hasData: false
        });
      }

      try {
        // Decrypt the extracted data for frontend display (non-PHI parts only)
        const { decryptPHI } = await import('./services/encryption');
        
        const patientData = extractedData.extractedPatientData as any;
        const encounterDataArray = extractedData.extractedEncounterData as any;
        
        // Decrypt non-sensitive patient data for display (keeping PHI safe)
        const displayPatientData = {
          mrn: patientData?.mrn ? decryptPHI(patientData.mrn) : undefined,
          firstName: patientData?.firstName ? decryptPHI(patientData.firstName) : undefined,
          lastName: patientData?.lastName ? decryptPHI(patientData.lastName) : undefined,
          dateOfBirth: patientData?.dateOfBirth ? decryptPHI(patientData.dateOfBirth) : undefined,
          payerType: patientData?.payerType,
          planName: patientData?.planName,
          insuranceId: patientData?.insuranceId ? decryptPHI(patientData.insuranceId) : undefined,
          secondaryPayerType: patientData?.secondaryPayerType,
          secondaryPlanName: patientData?.secondaryPlanName,
          secondaryInsuranceId: patientData?.secondaryInsuranceId ? decryptPHI(patientData.secondaryInsuranceId) : undefined,
          macRegion: patientData?.macRegion,
          phoneNumber: patientData?.phoneNumber ? decryptPHI(patientData.phoneNumber) : undefined,
          address: patientData?.address ? decryptPHI(patientData.address) : undefined
        };

        // Process encounter data (decrypt sensitive notes)
        const displayEncounterData = Array.isArray(encounterDataArray) ? encounterDataArray.map((encounter: any) => ({
          encounterDate: encounter?.encounterDate,
          notes: encounter?.notes?.map((note: string) => {
            try {
              return decryptPHI(note);
            } catch {
              return note; // Return as-is if not encrypted
            }
          }),
          woundDetails: encounter?.woundDetails,
          conservativeCare: encounter?.conservativeCare,
          infectionStatus: encounter?.infectionStatus,
          procedureCodes: encounter?.procedureCodes,
          vascularAssessment: encounter?.vascularAssessment,
          functionalStatus: encounter?.functionalStatus,
          diabeticStatus: encounter?.diabeticStatus,
          comorbidities: encounter?.comorbidities,
          assessment: encounter?.assessment ? decryptPHI(encounter.assessment) : undefined,
          plan: encounter?.plan ? decryptPHI(encounter.plan) : undefined
        })) : [];

        // Determine if we can create records based on data completeness
        const canCreateRecords = !!(
          displayPatientData.firstName && 
          displayPatientData.lastName && 
          displayPatientData.mrn &&
          displayEncounterData.length > 0
        );

        // Get missing fields for validation
        const missingFields: string[] = [];
        if (!displayPatientData.firstName) missingFields.push('Patient First Name');
        if (!displayPatientData.lastName) missingFields.push('Patient Last Name');
        if (!displayPatientData.mrn) missingFields.push('Medical Record Number');
        if (!displayPatientData.dateOfBirth) missingFields.push('Date of Birth');
        if (displayEncounterData.length === 0) missingFields.push('Encounter Data');

        res.json({
          extractionId: extractedData.id,
          confidence: parseFloat(extractedData.extractionConfidence || '0'),
          validationScore: parseFloat(extractedData.validationScore || '0'),
          isComplete: canCreateRecords,
          missingFields,
          warnings: [],
          patientData: displayPatientData,
          encounterData: displayEncounterData,
          canCreateRecords,
          hasData: true,
          dataExtractedAt: extractedData.createdAt
        });

      } catch (decryptionError) {
        console.error('Error decrypting extracted data:', decryptionError);
        return res.status(500).json({ 
          message: "Error processing extracted data",
          hasData: true,
          canCreateRecords: false
        });
      }

    } catch (error) {
      console.error("Error fetching extracted data:", error);
      res.status(500).json({ message: "Failed to fetch extracted data" });
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
        const decryptedEncounters = await Promise.all(encountersArray.map(async (encounter, index) => ({
          date: encounter?.encounterDate ? new Date(encounter.encounterDate) : new Date(),
          notes: encounter?.notes ? await decryptEncounterNotes(encounter.notes) : [],
          assessment: encounter?.assessment ? decryptPHI(encounter.assessment) : '',
          plan: encounter?.plan ? decryptPHI(encounter.plan) : '',
          woundDetails: encounter?.woundDetails ? JSON.parse(decryptPHI(encounter.woundDetails)) : {},
          conservativeCare: encounter?.conservativeCare ? JSON.parse(decryptPHI(encounter.conservativeCare)) : {},
          infectionStatus: encounter?.infectionStatus || 'None',
          comorbidities: encounter?.comorbidities || [],
          originalIndex: index
        })));

        console.log(`Processing ${decryptedEncounters.length} encounters from PDF`);

        // Episode creation logic - ALWAYS create episode for multi-encounter PDFs
        let episodeId: string | null = null;
        
        // Use the first encounter with wound details, or fallback to first encounter with safe defaults
        const firstEncounterWithWound = decryptedEncounters.find(enc => 
          enc.woundDetails && Object.keys(enc.woundDetails).length > 0
        ) || decryptedEncounters[0];
        
        // Find the earliest encounter date for episode start date
        const earliestEncounter = decryptedEncounters.reduce((earliest, current) => 
          earliest.date < current.date ? earliest : current
        );
        
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
            episodeStartDate: earliestEncounter.date,
            status: 'active',
            primaryDiagnosis
          });
          
          episodeId = newEpisode.id;
          console.log(`Created new episode [redacted] for wound care case`);
        }

        // Create encounters and link them to the same episode (skip duplicates)
        const { encryptEncounterNotes } = await import('./services/encryption');
        const createdEncounters = [];
        const skippedEncounters = [];
        const creationErrors = [];
        
        for (const encounter of decryptedEncounters) {
          // Check if encounter already exists for this patient on this date
          const isDuplicate = await storage.checkEncounterDuplicate(patientId, encounter.date);
          
          if (isDuplicate) {
            // Skip duplicate encounter
            skippedEncounters.push({
              date: encounter.date,
              reason: 'Encounter already exists for this patient on this date'
            });
            console.log(`Skipped duplicate encounter [redacted] on [redacted]`);
          } else {
            try {
              // Create new encounter with proper error handling
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
              console.log(`Created encounter [redacted] for episode [redacted]`);
            } catch (createError: any) {
              // Handle creation errors gracefully
              const errorMessage = createError.message || 'Unknown error';
              
              // Check if this is a duplicate constraint violation
              if (errorMessage.includes('duplicate') || 
                  errorMessage.includes('unique constraint') ||
                  errorMessage.includes('already exists')) {
                // Treat as duplicate and skip
                skippedEncounters.push({
                  date: encounter.date,
                  reason: 'Encounter creation failed - likely race condition duplicate'
                });
                console.log(`Skipped encounter due to creation race condition [redacted]`);
              } else {
                // Log non-duplicate errors but continue processing
                creationErrors.push({
                  date: encounter.date,
                  error: 'NON_DUPLICATE_CREATION_ERROR'
                });
                console.warn(`Encounter creation error [redacted]: NON_DUPLICATE_ERROR`);
              }
            }
          }
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

        // Create success message with details about created vs skipped vs failed records
        const totalEncounters = createdEncounters.length + skippedEncounters.length + creationErrors.length;
        let message = `Record creation completed: `;
        
        if (!existingPatient) {
          message += `Patient created, `;
        } else {
          message += `Existing patient used, `;
        }
        
        message += `${createdEncounters.length} new encounters created`;
        
        if (skippedEncounters.length > 0) {
          message += `, ${skippedEncounters.length} duplicate encounters skipped`;
        }
        
        if (creationErrors.length > 0) {
          message += `, ${creationErrors.length} encounters failed to create`;
        }

        res.status(201).json({
          message,
          patientId,
          encounterIds: createdEncounters.map(enc => enc.id),
          encountersCreated: createdEncounters.length,
          encountersSkipped: skippedEncounters.length,
          encountersFailedToCreate: creationErrors.length,
          skippedEncounterDates: skippedEncounters.map(enc => enc.date.toDateString()),
          totalEncountersProcessed: totalEncounters,
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

  // ===============================================================================
  // ANALYTICS API ENDPOINTS - COMPREHENSIVE DATA AGGREGATION
  // ===============================================================================

  // Analytics Snapshots Endpoints
  app.get('/api/analytics/snapshots', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, aggregationPeriod, startDate, endDate, limit = 50 } = req.query;

      // Get user's tenants for access control
      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      // Validate tenant access
      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      let snapshots;
      if (startDate && endDate) {
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        snapshots = await storage.getAnalyticsSnapshotsByDateRange(
          targetTenantId, 
          parsedStartDate, 
          parsedEndDate, 
          aggregationPeriod || 'daily'
        );
      } else {
        snapshots = await storage.getAnalyticsSnapshotsByTenant(
          targetTenantId, 
          aggregationPeriod, 
          parseInt(limit)
        );
      }

      await trackActivity(targetTenantId, userId, 'view', 'analytics_snapshots', 'query');
      res.json(snapshots);
    } catch (error) {
      console.error('Error fetching analytics snapshots:', error);
      res.status(500).json({ message: "Failed to fetch analytics snapshots" });
    }
  });

  app.post('/api/analytics/snapshots', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const snapshotData = insertAnalyticsSnapshotSchema.parse(req.body);

      // Verify user has access to tenant
      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);
      
      if (!accessibleTenantIds.includes(snapshotData.tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const snapshot = await storage.createAnalyticsSnapshot(snapshotData);
      await trackActivity(snapshotData.tenantId, userId, 'create', 'analytics_snapshot', snapshot.id);
      res.status(201).json(snapshot);
    } catch (error) {
      console.error('Error creating analytics snapshot:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create analytics snapshot" });
    }
  });

  app.get('/api/analytics/snapshots/latest', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, aggregationPeriod = 'daily' } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const snapshot = await storage.getLatestAnalyticsSnapshot(targetTenantId, aggregationPeriod);
      await trackActivity(targetTenantId, userId, 'view', 'analytics_snapshots', 'latest');
      res.json(snapshot || null);
    } catch (error) {
      console.error('Error fetching latest analytics snapshot:', error);
      res.status(500).json({ message: "Failed to fetch latest analytics snapshot" });
    }
  });

  app.get('/api/analytics/snapshots/trends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, aggregationPeriod = 'daily', periods = 12 } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const endDate = new Date();
      let startDate = new Date();
      
      // Calculate start date based on aggregation period and number of periods
      switch (aggregationPeriod) {
        case 'daily':
          startDate.setDate(startDate.getDate() - parseInt(periods));
          break;
        case 'weekly':
          startDate.setDate(startDate.getDate() - (parseInt(periods) * 7));
          break;
        case 'monthly':
          startDate.setMonth(startDate.getMonth() - parseInt(periods));
          break;
        case 'quarterly':
          startDate.setMonth(startDate.getMonth() - (parseInt(periods) * 3));
          break;
        default:
          startDate.setDate(startDate.getDate() - parseInt(periods));
      }

      const trends = await storage.getAnalyticsSnapshotsByDateRange(
        targetTenantId, 
        startDate, 
        endDate, 
        aggregationPeriod
      );

      await trackActivity(targetTenantId, userId, 'view', 'analytics_snapshots', 'trends');
      res.json(trends);
    } catch (error) {
      console.error('Error fetching analytics trends:', error);
      res.status(500).json({ message: "Failed to fetch analytics trends" });
    }
  });

  // Healing Trends Endpoints
  app.get('/api/analytics/healing-trends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, episodeId, patientId, startDate, endDate, limit = 100 } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      let trends;
      if (episodeId) {
        trends = await storage.getHealingTrendsByEpisode(episodeId);
      } else if (patientId) {
        trends = await storage.getHealingTrendsByPatient(patientId);
      } else if (startDate && endDate) {
        const targetTenantId = tenantId || accessibleTenantIds[0];
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        trends = await storage.getHealingTrendsByDateRange(targetTenantId, parsedStartDate, parsedEndDate);
      } else {
        const targetTenantId = tenantId || accessibleTenantIds[0];
        trends = await storage.getHealingTrendsByTenant(targetTenantId, parseInt(limit));
      }

      const trackingTenantId = tenantId || accessibleTenantIds[0];
      await trackActivity(trackingTenantId, userId, 'view', 'healing_trends', 'query');
      res.json(trends);
    } catch (error) {
      console.error('Error fetching healing trends:', error);
      res.status(500).json({ message: "Failed to fetch healing trends" });
    }
  });

  app.post('/api/analytics/healing-trends', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const trendData = insertHealingTrendSchema.parse(req.body);

      // Verify access to episode/patient
      const episode = await storage.getEpisode(trendData.episodeId);
      if (!episode) {
        return res.status(404).json({ message: "Episode not found" });
      }

      const patient = await storage.getPatient(episode.patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const trend = await storage.createHealingTrend(trendData);
      await trackActivity(patient.tenantId, userId, 'create', 'healing_trend', trend.id);
      res.status(201).json(trend);
    } catch (error) {
      console.error('Error creating healing trend:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create healing trend" });
    }
  });

  app.get('/api/analytics/healing-trends/episode/:episodeId', isAuthenticated, async (req: any, res) => {
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

      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const trends = await storage.getEpisodeHealingTrajectory(episodeId);
      await trackActivity(patient.tenantId, userId, 'view', 'healing_trends', episodeId);
      res.json(trends);
    } catch (error) {
      console.error('Error fetching episode healing trends:', error);
      res.status(500).json({ message: "Failed to fetch episode healing trends" });
    }
  });

  app.get('/api/analytics/healing-trends/patient/:patientId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { patientId } = req.params;

      const patient = await storage.getPatient(patientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const trends = await storage.getHealingTrendsByPatient(patientId);
      await trackActivity(patient.tenantId, userId, 'view', 'healing_trends', patientId);
      res.json(trends);
    } catch (error) {
      console.error('Error fetching patient healing trends:', error);
      res.status(500).json({ message: "Failed to fetch patient healing trends" });
    }
  });

  app.get('/api/analytics/healing-trends/velocity', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, period = 'monthly' } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      // Get healing velocity analytics
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (period === 'quarterly' ? 3 : 1));

      const trends = await storage.getHealingTrendsByDateRange(targetTenantId, startDate, endDate);
      
      // Calculate velocity analytics
      const velocityAnalytics = {
        averageHealingVelocity: trends.reduce((sum, t) => sum + (parseFloat(t.healingVelocity || '0')), 0) / trends.length || 0,
        totalTrends: trends.length,
        improvingTrends: trends.filter(t => t.woundCondition === 'improving').length,
        stableTrends: trends.filter(t => t.woundCondition === 'stable').length,
        deterioratingTrends: trends.filter(t => t.woundCondition === 'deteriorating').length,
        period,
        startDate,
        endDate
      };

      await trackActivity(targetTenantId, userId, 'view', 'healing_velocity', 'analytics');
      res.json(velocityAnalytics);
    } catch (error) {
      console.error('Error fetching healing velocity analytics:', error);
      res.status(500).json({ message: "Failed to fetch healing velocity analytics" });
    }
  });

  // Performance Metrics Endpoints
  app.get('/api/analytics/performance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, providerId, metricScope, metricPeriod, startDate, endDate, limit = 50 } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      let metrics;
      if (providerId) {
        metrics = await storage.getPerformanceMetricsByProvider(providerId, parseInt(limit));
      } else if (startDate && endDate) {
        const targetTenantId = tenantId || accessibleTenantIds[0];
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        metrics = await storage.getPerformanceMetricsByDateRange(
          targetTenantId, 
          parsedStartDate, 
          parsedEndDate, 
          metricPeriod || 'monthly'
        );
      } else {
        const targetTenantId = tenantId || accessibleTenantIds[0];
        metrics = await storage.getPerformanceMetricsByTenant(targetTenantId, metricScope, parseInt(limit));
      }

      const trackingTenantId = tenantId || accessibleTenantIds[0];
      await trackActivity(trackingTenantId, userId, 'view', 'performance_metrics', 'query');
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      res.status(500).json({ message: "Failed to fetch performance metrics" });
    }
  });

  app.post('/api/analytics/performance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const metricData = insertPerformanceMetricSchema.parse(req.body);

      // Verify user has access to tenant
      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);
      
      if (!accessibleTenantIds.includes(metricData.tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const metric = await storage.createPerformanceMetric(metricData);
      await trackActivity(metricData.tenantId, userId, 'create', 'performance_metric', metric.id);
      res.status(201).json(metric);
    } catch (error) {
      console.error('Error creating performance metric:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create performance metric" });
    }
  });

  app.get('/api/analytics/performance/provider/:providerId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { providerId } = req.params;
      const { limit = 50 } = req.query;

      // Verify provider access through tenant membership
      const userTenants = await storage.getTenantsByUser(userId);
      const metrics = await storage.getPerformanceMetricsByProvider(providerId, parseInt(limit));
      
      // Filter metrics to only those from accessible tenants
      const accessibleTenantIds = userTenants.map(t => t.id);
      const filteredMetrics = metrics.filter(m => accessibleTenantIds.includes(m.tenantId));

      const trackingTenantId = userTenants[0]?.id;
      if (trackingTenantId) {
        await trackActivity(trackingTenantId, userId, 'view', 'performance_metrics', providerId);
      }
      res.json(filteredMetrics);
    } catch (error) {
      console.error('Error fetching provider performance metrics:', error);
      res.status(500).json({ message: "Failed to fetch provider performance metrics" });
    }
  });

  app.get('/api/analytics/performance/benchmarks', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, metricPeriod = 'monthly', limit = 10 } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const benchmarks = await storage.getProviderPerformanceComparison(
        targetTenantId, 
        metricPeriod, 
        parseInt(limit)
      );

      await trackActivity(targetTenantId, userId, 'view', 'performance_benchmarks', 'query');
      res.json(benchmarks);
    } catch (error) {
      console.error('Error fetching performance benchmarks:', error);
      res.status(500).json({ message: "Failed to fetch performance benchmarks" });
    }
  });

  app.get('/api/analytics/performance/kpis', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, metricType = 'healingSuccessRate', periods = 6 } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const kpiTrends = await storage.getPerformanceTrends(targetTenantId, metricType, parseInt(periods));

      await trackActivity(targetTenantId, userId, 'view', 'performance_kpis', metricType);
      res.json(kpiTrends);
    } catch (error) {
      console.error('Error fetching performance KPIs:', error);
      res.status(500).json({ message: "Failed to fetch performance KPIs" });
    }
  });

  // Cost Analytics Endpoints
  app.get('/api/analytics/costs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, episodeId, analysisPeriod, startDate, endDate, limit = 50 } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      let costs;
      if (episodeId) {
        costs = await storage.getCostAnalyticsByEpisode(episodeId);
      } else if (startDate && endDate) {
        const targetTenantId = tenantId || accessibleTenantIds[0];
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        costs = await storage.getCostAnalyticsByDateRange(targetTenantId, parsedStartDate, parsedEndDate);
      } else {
        const targetTenantId = tenantId || accessibleTenantIds[0];
        costs = await storage.getCostAnalyticsByTenant(targetTenantId, analysisPeriod, parseInt(limit));
      }

      const trackingTenantId = tenantId || accessibleTenantIds[0];
      await trackActivity(trackingTenantId, userId, 'view', 'cost_analytics', 'query');
      res.json(costs);
    } catch (error) {
      console.error('Error fetching cost analytics:', error);
      res.status(500).json({ message: "Failed to fetch cost analytics" });
    }
  });

  app.post('/api/analytics/costs', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const costData = insertCostAnalyticSchema.parse(req.body);

      // Verify user has access to tenant
      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);
      
      if (!accessibleTenantIds.includes(costData.tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const cost = await storage.createCostAnalytic(costData);
      await trackActivity(costData.tenantId, userId, 'create', 'cost_analytic', cost.id);
      res.status(201).json(cost);
    } catch (error) {
      console.error('Error creating cost analytic:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create cost analytic" });
    }
  });

  app.get('/api/analytics/costs/episode/:episodeId', isAuthenticated, async (req: any, res) => {
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

      const userTenantRole = await storage.getUserTenantRole(userId, patient.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      const costs = await storage.getCostAnalyticsByEpisode(episodeId);
      await trackActivity(patient.tenantId, userId, 'view', 'episode_costs', episodeId);
      res.json(costs);
    } catch (error) {
      console.error('Error fetching episode cost analytics:', error);
      res.status(500).json({ message: "Failed to fetch episode cost analytics" });
    }
  });

  app.get('/api/analytics/costs/efficiency', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, period = 'monthly' } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const efficiencyMetrics = await storage.getCostEfficiencyMetrics(targetTenantId, period);
      await trackActivity(targetTenantId, userId, 'view', 'cost_efficiency', 'metrics');
      res.json(efficiencyMetrics);
    } catch (error) {
      console.error('Error fetching cost efficiency metrics:', error);
      res.status(500).json({ message: "Failed to fetch cost efficiency metrics" });
    }
  });

  app.get('/api/analytics/costs/reimbursement', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, startDate, endDate } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const parsedStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const parsedEndDate = endDate ? new Date(endDate) : new Date();

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      const reimbursementAnalysis = await storage.getTenantCostSummary(
        targetTenantId, 
        parsedStartDate, 
        parsedEndDate
      );

      await trackActivity(targetTenantId, userId, 'view', 'reimbursement_analysis', 'summary');
      res.json(reimbursementAnalysis);
    } catch (error) {
      console.error('Error fetching reimbursement analysis:', error);
      res.status(500).json({ message: "Failed to fetch reimbursement analysis" });
    }
  });

  // Compliance Tracking Endpoints
  app.get('/api/analytics/compliance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, assessmentType, complianceScope, riskLevel, startDate, endDate, limit = 50 } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      let compliance;
      if (startDate && endDate) {
        const targetTenantId = tenantId || accessibleTenantIds[0];
        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ message: "Invalid date format" });
        }
        compliance = await storage.getComplianceTrackingByDateRange(targetTenantId, parsedStartDate, parsedEndDate);
      } else {
        const targetTenantId = tenantId || accessibleTenantIds[0];
        compliance = await storage.getComplianceTrackingByTenant(targetTenantId, assessmentType, parseInt(limit));
      }

      // Filter by additional criteria if provided
      if (complianceScope) {
        compliance = compliance.filter(c => c.complianceScope === complianceScope);
      }
      if (riskLevel) {
        compliance = compliance.filter(c => c.complianceRiskLevel === riskLevel);
      }

      const trackingTenantId = tenantId || accessibleTenantIds[0];
      await trackActivity(trackingTenantId, userId, 'view', 'compliance_tracking', 'query');
      res.json(compliance);
    } catch (error) {
      console.error('Error fetching compliance tracking:', error);
      res.status(500).json({ message: "Failed to fetch compliance tracking" });
    }
  });

  app.post('/api/analytics/compliance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const complianceData = insertComplianceTrackingSchema.parse(req.body);

      // Verify user has access to tenant
      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);
      
      if (!accessibleTenantIds.includes(complianceData.tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const compliance = await storage.createComplianceTracking(complianceData);
      await trackActivity(complianceData.tenantId, userId, 'create', 'compliance_tracking', compliance.id);
      res.status(201).json(compliance);
    } catch (error) {
      console.error('Error creating compliance tracking:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create compliance tracking" });
    }
  });

  app.get('/api/analytics/compliance/medicare', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, startDate, endDate } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const parsedStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const parsedEndDate = endDate ? new Date(endDate) : new Date();

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      const medicareCompliance = await storage.getTenantComplianceSummary(
        targetTenantId, 
        parsedStartDate, 
        parsedEndDate
      );

      await trackActivity(targetTenantId, userId, 'view', 'medicare_compliance', 'summary');
      res.json(medicareCompliance);
    } catch (error) {
      console.error('Error fetching Medicare compliance:', error);
      res.status(500).json({ message: "Failed to fetch Medicare compliance" });
    }
  });

  app.get('/api/analytics/compliance/audit', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, startDate, endDate, limit = 100 } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const parsedStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const parsedEndDate = endDate ? new Date(endDate) : new Date();

      if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }

      const auditTrail = await storage.getComplianceTrackingByDateRange(
        targetTenantId, 
        parsedStartDate, 
        parsedEndDate
      );

      // Sort by assessment date for audit trail
      const sortedAuditTrail = auditTrail
        .sort((a, b) => new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime())
        .slice(0, parseInt(limit));

      await trackActivity(targetTenantId, userId, 'view', 'compliance_audit', 'trail');
      res.json(sortedAuditTrail);
    } catch (error) {
      console.error('Error fetching compliance audit trail:', error);
      res.status(500).json({ message: "Failed to fetch compliance audit trail" });
    }
  });

  app.get('/api/analytics/compliance/violations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, riskLevel = 'high' } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const violations = await storage.getComplianceRiskAnalysis(targetTenantId);
      
      // Filter by risk level if specified
      const filteredViolations = riskLevel !== 'all' 
        ? violations.filter(v => v.complianceRiskLevel === riskLevel)
        : violations;

      await trackActivity(targetTenantId, userId, 'view', 'compliance_violations', riskLevel);
      res.json(filteredViolations);
    } catch (error) {
      console.error('Error fetching compliance violations:', error);
      res.status(500).json({ message: "Failed to fetch compliance violations" });
    }
  });

  // Dashboard Aggregation Endpoints
  app.get('/api/analytics/dashboard/summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, period = 'monthly' } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const dashboardData = await storage.getTenantAnalyticsDashboard(targetTenantId, period);
      await trackActivity(targetTenantId, userId, 'view', 'dashboard_summary', period);
      res.json(dashboardData);
    } catch (error) {
      console.error('Error fetching dashboard summary:', error);
      res.status(500).json({ message: "Failed to fetch dashboard summary" });
    }
  });

  app.get('/api/analytics/dashboard/clinical', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, period = 'monthly' } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (period === 'quarterly' ? 3 : 1));

      // Get clinical performance data
      const [healingTrends, performanceMetrics, complianceData] = await Promise.all([
        storage.getHealingTrendsByDateRange(targetTenantId, startDate, endDate),
        storage.getPerformanceMetricsByDateRange(targetTenantId, startDate, endDate, period),
        storage.getComplianceTrackingByDateRange(targetTenantId, startDate, endDate)
      ]);

      const clinicalDashboard = {
        healingTrends,
        performanceMetrics,
        complianceData,
        period,
        startDate,
        endDate
      };

      await trackActivity(targetTenantId, userId, 'view', 'clinical_dashboard', period);
      res.json(clinicalDashboard);
    } catch (error) {
      console.error('Error fetching clinical dashboard:', error);
      res.status(500).json({ message: "Failed to fetch clinical dashboard" });
    }
  });

  app.get('/api/analytics/dashboard/financial', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, period = 'monthly' } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (period === 'quarterly' ? 3 : 1));

      // Get financial performance data
      const [costAnalytics, costSummary, efficiencyMetrics] = await Promise.all([
        storage.getCostAnalyticsByDateRange(targetTenantId, startDate, endDate),
        storage.getTenantCostSummary(targetTenantId, startDate, endDate),
        storage.getCostEfficiencyMetrics(targetTenantId, period)
      ]);

      const financialDashboard = {
        costAnalytics,
        costSummary,
        efficiencyMetrics,
        period,
        startDate,
        endDate
      };

      await trackActivity(targetTenantId, userId, 'view', 'financial_dashboard', period);
      res.json(financialDashboard);
    } catch (error) {
      console.error('Error fetching financial dashboard:', error);
      res.status(500).json({ message: "Failed to fetch financial dashboard" });
    }
  });

  app.get('/api/analytics/dashboard/compliance', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, period = 'monthly' } = req.query;

      const userTenants = await storage.getTenantsByUser(userId);
      const accessibleTenantIds = userTenants.map(t => t.id);

      if (tenantId && !accessibleTenantIds.includes(tenantId)) {
        return res.status(403).json({ message: "Access denied to specified tenant" });
      }

      const targetTenantId = tenantId || accessibleTenantIds[0];
      if (!targetTenantId) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (period === 'quarterly' ? 3 : 1));

      // Get compliance performance data
      const [complianceTracking, complianceSummary, violations] = await Promise.all([
        storage.getComplianceTrackingByDateRange(targetTenantId, startDate, endDate),
        storage.getTenantComplianceSummary(targetTenantId, startDate, endDate),
        storage.getComplianceRiskAnalysis(targetTenantId)
      ]);

      const complianceDashboard = {
        complianceTracking,
        complianceSummary,
        violations,
        period,
        startDate,
        endDate
      };

      await trackActivity(targetTenantId, userId, 'view', 'compliance_dashboard', period);
      res.json(complianceDashboard);
    } catch (error) {
      console.error('Error fetching compliance dashboard:', error);
      res.status(500).json({ message: "Failed to fetch compliance dashboard" });
    }
  });

  // ================================================================================
  // COMPREHENSIVE REPORTING ENDPOINTS
  // ================================================================================
  
  // Import report generation service
  const { reportGenerator } = await import('./services/reportGenerator');

  // Generate comprehensive report with production hardening
  app.post('/api/reports/generate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reportRequest = req.body;
      
      // PRODUCTION HARDENING: Concurrency and rate limiting
      const concurrencyKey = `report_gen_${userId}`;
      const rateLimitKey = `report_rate_${userId}`;
      
      if (!global.concurrencyStore) global.concurrencyStore = new Map();
      if (!global.rateLimitStore) global.rateLimitStore = new Map();
      
      // Check active report generation limit (max 2 concurrent)
      const activeReports = global.concurrencyStore.get(concurrencyKey) || 0;
      if (activeReports >= 2) {
        return res.status(429).json({ message: "Too many concurrent report generations. Please wait." });
      }
      
      // Rate limiting (max 5 reports per hour)
      const now = Date.now();
      const rateData = global.rateLimitStore.get(rateLimitKey) || { count: 0, resetTime: now + 3600000 };
      if (now > rateData.resetTime) {
        rateData.count = 0;
        rateData.resetTime = now + 3600000;
      }
      if (rateData.count >= 5) {
        return res.status(429).json({ message: "Rate limit exceeded: Maximum 5 reports per hour" });
      }
      
      // Track active generation
      global.concurrencyStore.set(concurrencyKey, activeReports + 1);
      rateData.count++;
      global.rateLimitStore.set(rateLimitKey, rateData);

      // Validate request
      const reportRequestSchema = z.object({
        type: z.enum(['clinical-summary', 'episode-summary', 'provider-performance', 
                      'medicare-compliance', 'lcd-compliance', 'audit-trail',
                      'cost-effectiveness', 'healing-outcomes']),
        format: z.enum(['pdf', 'excel', 'csv']),
        tenantId: z.string().uuid(),
        dateRange: z.object({
          startDate: z.string().transform(s => new Date(s)),
          endDate: z.string().transform(s => new Date(s))
        }).optional(),
        filters: z.object({
          patientId: z.string().uuid().optional(),
          episodeId: z.string().uuid().optional(),
          providerId: z.string().optional(),
          woundType: z.string().optional(),
          complianceLevel: z.string().optional()
        }).optional(),
        options: z.object({
          includeCharts: z.boolean().optional(),
          includeDetails: z.boolean().optional(),
          includeCitations: z.boolean().optional(),
          groupBy: z.enum(['patient', 'episode', 'provider', 'month']).optional()
        }).optional()
      });

      const validatedRequest = reportRequestSchema.parse(reportRequest);

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, validatedRequest.tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Generate report
      const report = await reportGenerator.generateReport({
        ...validatedRequest,
        userId
      });

      // Track activity
      await trackActivity(
        validatedRequest.tenantId,
        userId,
        'Generated report',
        'Report',
        report.id,
        `${validatedRequest.type} (${validatedRequest.format})`
      );

      res.json({
        success: true,
        report: {
          id: report.id,
          type: report.type,
          format: report.format,
          fileSize: report.fileSize,
          generatedAt: report.generatedAt,
          expiresAt: report.expiresAt,
          downloadUrl: `/api/reports/download/${report.id}`, // Secure reportId-based URL
          metadata: report.metadata
        }
      });
    } catch (error) {
      console.error("Error generating report:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request parameters", 
          errors: error.errors 
        });
      }
      
      res.status(500).json({ message: "Failed to generate report" });
    }
  });

  // SECURE Download generated report by ID with proper tenant authorization
  app.get('/api/reports/download/:reportId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { reportId } = req.params;

      // Validate reportId format (UUID)
      if (!reportId || !reportId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)) {
        return res.status(400).json({ message: "Invalid report ID format" });
      }

      // Get user's tenants for authorization
      const userTenants = await storage.getTenantsByUser(userId);
      if (userTenants.length === 0) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }
      const userTenantIds = userTenants.map(t => t.id);

      // CRITICAL SECURITY: Get report from database and verify tenant access
      const report = await storage.getGeneratedReport(reportId);
      if (!report) {
        return res.status(404).json({ message: "Report not found or expired" });
      }

      // HIPAA COMPLIANCE: Verify user has access to this specific report's tenant
      if (!userTenantIds.includes(report.tenantId)) {
        // Log attempted unauthorized access for security audit
        await storage.createAuditLog({
          tenantId: userTenants[0].id, // Log to user's primary tenant
          userId,
          action: 'UNAUTHORIZED_REPORT_ACCESS_ATTEMPT',
          entity: 'Report',
          entityId: reportId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          previousHash: '',
        });
        return res.status(403).json({ message: "Access denied: Report belongs to a different tenant" });
      }

      // Check if report has expired
      if (report.expiresAt && new Date() > new Date(report.expiresAt)) {
        await storage.markGeneratedReportAsExpired(reportId);
        return res.status(410).json({ message: "Report has expired and is no longer available" });
      }

      // Verify file still exists on disk
      if (!fs.existsSync(report.filePath)) {
        return res.status(404).json({ message: "Report file not found on disk" });
      }

      // Set appropriate headers based on report format
      let contentType = 'application/octet-stream';
      let fileExtension = 'bin';
      
      switch (report.reportFormat) {
        case 'pdf':
          contentType = 'application/pdf';
          fileExtension = 'pdf';
          break;
        case 'excel':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          fileExtension = 'xlsx';
          break;
        case 'csv':
          contentType = 'text/csv';
          fileExtension = 'csv';
          break;
      }

      // Generate secure filename without tenant info
      const secureFileName = `${report.reportType}_${report.id.substring(0, 8)}_${formatDate(new Date(report.createdAt), 'yyyy-MM-dd')}.${fileExtension}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${secureFileName}"`);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      // Stream file securely
      res.sendFile(report.filePath);

      // Increment download count and log access (HIPAA audit trail)
      await Promise.all([
        storage.incrementReportDownloadCount(reportId),
        storage.createAuditLog({
          tenantId: report.tenantId,
          userId,
          action: 'DOWNLOAD_REPORT',
          entity: 'Report',
          entityId: reportId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          previousHash: '',
        }),
        trackActivity(
          report.tenantId,
          userId,
          'Downloaded report',
          'Report',
          reportId,
          `${report.reportType} report`
        )
      ]);

    } catch (error) {
      // REDACTED ERROR LOGGING: Don't expose PHI in logs
      console.error("Error downloading report:", {
        reportId: req.params.reportId,
        userId: req.user?.claims?.sub,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ message: "Failed to download report" });
    }
  });

  // Get available report types and templates with production hardening
  app.get('/api/reports/templates', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // PRODUCTION HARDENING: Rate limiting check (basic implementation)
      const userKey = `templates_${userId}`;
      const now = Date.now();
      // Simple in-memory rate limiting - in production use Redis
      if (!global.rateLimitStore) global.rateLimitStore = new Map();
      const lastAccess = global.rateLimitStore.get(userKey) || 0;
      if (now - lastAccess < 1000) { // 1 second cooldown
        return res.status(429).json({ message: "Rate limit exceeded" });
      }
      global.rateLimitStore.set(userKey, now);
      
      // Get user's tenants to verify access
      const tenants = await storage.getTenantsByUser(userId);
      if (tenants.length === 0) {
        return res.status(403).json({ message: "No accessible tenants found" });
      }

      const templates = {
        reportTypes: [
          {
            type: 'clinical-summary',
            name: 'Clinical Summary Report',
            description: 'Comprehensive patient outcome summaries with healing progression data',
            formats: ['pdf', 'excel', 'csv'],
            features: ['Patient outcomes', 'Healing progression', 'Treatment timelines', 'Quality metrics']
          },
          {
            type: 'episode-summary',
            name: 'Episode Summary Report',
            description: 'Episode-level clinical summaries with detailed treatment information',
            formats: ['pdf', 'excel', 'csv'],
            features: ['Episode details', 'Treatment history', 'Outcome tracking', 'Cost analysis']
          },
          {
            type: 'provider-performance',
            name: 'Provider Performance Report',
            description: 'Provider performance summaries with quality metrics and benchmarks',
            formats: ['pdf', 'excel', 'csv'],
            features: ['Performance metrics', 'Quality scores', 'Benchmark comparisons', 'Improvement recommendations']
          },
          {
            type: 'medicare-compliance',
            name: 'Medicare Compliance Report',
            description: 'Medicare compliance documentation for audit preparation',
            formats: ['pdf', 'excel', 'csv'],
            features: ['20% reduction tracking', 'Compliance scoring', 'Gap analysis', 'Risk assessment']
          },
          {
            type: 'lcd-compliance',
            name: 'LCD Compliance Report',
            description: 'LCD policy adherence summaries with violation tracking',
            formats: ['pdf', 'excel', 'csv'],
            features: ['Policy adherence', 'Violation tracking', 'Coverage analysis', 'Documentation gaps']
          },
          {
            type: 'audit-trail',
            name: 'Audit Trail Report',
            description: 'HIPAA-compliant audit trails and activity logs',
            formats: ['pdf', 'excel', 'csv'],
            features: ['User activity', 'System access', 'Data changes', 'Security events']
          },
          {
            type: 'cost-effectiveness',
            name: 'Cost Effectiveness Report',
            description: 'Cost-effectiveness analysis for Medicare review and optimization',
            formats: ['pdf', 'excel', 'csv'],
            features: ['Cost analysis', 'Reimbursement rates', 'ROI metrics', 'Efficiency tracking']
          },
          {
            type: 'healing-outcomes',
            name: 'Healing Outcomes Report',
            description: 'Evidence-based treatment outcome reporting for quality improvement',
            formats: ['pdf', 'excel', 'csv'],
            features: ['Outcome metrics', 'Treatment effectiveness', 'Evidence tracking', 'Quality measures']
          }
        ],
        exportFormats: [
          {
            format: 'pdf',
            name: 'PDF Document',
            description: 'Professional reports with charts and visualizations',
            features: ['Charts and graphs', 'Professional formatting', 'Print-ready', 'Regulatory compliant']
          },
          {
            format: 'excel',
            name: 'Excel Workbook',
            description: 'Detailed analytics data with multiple worksheets',
            features: ['Multiple sheets', 'Data analysis', 'Pivot tables', 'Interactive charts']
          },
          {
            format: 'csv',
            name: 'CSV Export',
            description: 'Raw data export for regulatory submissions',
            features: ['Raw data', 'System integration', 'Database import', 'Regulatory submission']
          }
        ]
      };

      res.json({
        success: true,
        templates
      });
    } catch (error) {
      console.error("Error fetching report templates:", error);
      res.status(500).json({ message: "Failed to fetch report templates" });
    }
  });

  // Clinical Summary Export (Enhanced)
  app.get('/api/analytics/export/clinical-summary', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, startDate, endDate, format = 'csv', providerId } = req.query;

      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Parse dates
      const parsedStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const parsedEndDate = endDate ? new Date(endDate) : new Date();

      // Generate clinical summary report
      const report = await reportGenerator.generateReport({
        type: 'clinical-summary',
        format: format as 'pdf' | 'excel' | 'csv',
        tenantId,
        userId,
        dateRange: {
          startDate: parsedStartDate,
          endDate: parsedEndDate
        },
        filters: {
          providerId: providerId || undefined
        },
        options: {
          includeCharts: true,
          includeDetails: true,
          includeCitations: true
        }
      });

      res.json({
        success: true,
        report: {
          id: report.id,
          fileName: report.fileName,
          fileSize: report.fileSize,
          generatedAt: report.generatedAt,
          downloadUrl: `/api/reports/download/${report.id}`
        }
      });
    } catch (error) {
      console.error("Error exporting clinical summary:", error);
      res.status(500).json({ message: "Failed to export clinical summary" });
    }
  });

  // Medicare Compliance Export (Enhanced)
  app.get('/api/analytics/export/compliance-report', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, startDate, endDate, format = 'csv', complianceLevel } = req.query;

      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }

      // Verify user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Parse dates
      const parsedStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const parsedEndDate = endDate ? new Date(endDate) : new Date();

      // Generate Medicare compliance report
      const report = await reportGenerator.generateReport({
        type: 'medicare-compliance',
        format: format as 'pdf' | 'excel' | 'csv',
        tenantId,
        userId,
        dateRange: {
          startDate: parsedStartDate,
          endDate: parsedEndDate
        },
        filters: {
          complianceLevel: complianceLevel || undefined
        },
        options: {
          includeCharts: true,
          includeDetails: true,
          includeCitations: true
        }
      });

      res.json({
        success: true,
        report: {
          id: report.id,
          fileName: report.fileName,
          fileSize: report.fileSize,
          generatedAt: report.generatedAt,
          downloadUrl: `/api/reports/download/${report.id}`
        }
      });
    } catch (error) {
      console.error("Error exporting compliance report:", error);
      res.status(500).json({ message: "Failed to export compliance report" });
    }
  });

  // Audit Trail Export (Enhanced)
  app.get('/api/analytics/export/audit-trail', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { tenantId, startDate, endDate, format = 'csv' } = req.query;

      if (!tenantId) {
        return res.status(400).json({ message: "tenantId is required" });
      }

      // Verify user has access to tenant and admin role
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole || userTenantRole.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required for audit trail export" });
      }

      // Parse dates
      const parsedStartDate = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const parsedEndDate = endDate ? new Date(endDate) : new Date();

      // Generate audit trail report
      const report = await reportGenerator.generateReport({
        type: 'audit-trail',
        format: format as 'pdf' | 'excel' | 'csv',
        tenantId,
        userId,
        dateRange: {
          startDate: parsedStartDate,
          endDate: parsedEndDate
        },
        options: {
          includeDetails: true
        }
      });

      res.json({
        success: true,
        report: {
          id: report.id,
          fileName: report.fileName,
          fileSize: report.fileSize,
          generatedAt: report.generatedAt,
          downloadUrl: `/api/reports/download/${report.id}`
        }
      });
    } catch (error) {
      console.error("Error exporting audit trail:", error);
      res.status(500).json({ message: "Failed to export audit trail" });
    }
  });

  // Report cleanup scheduler (run periodically)
  app.post('/api/reports/cleanup', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Only allow admin users to trigger cleanup
      const tenants = await storage.getTenantsByUser(userId);
      const isAdmin = await Promise.all(
        tenants.map(async tenant => {
          const userRole = await storage.getUserTenantRole(userId, tenant.id);
          return userRole?.role === 'Admin';
        })
      ).then(results => results.some(isAdmin => isAdmin));

      if (!isAdmin) {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Clean up expired reports
      await reportGenerator.cleanupExpiredReports();

      res.json({
        success: true,
        message: "Report cleanup completed successfully"
      });
    } catch (error) {
      console.error("Error cleaning up reports:", error);
      res.status(500).json({ message: "Failed to cleanup reports" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
