import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { decryptEncounterNotes } from "../services/encryption";
import { buildRAGContext } from "../services/ragService";
import { VALID_MAC_REGIONS, validateMACRegion } from "../services/macRegionValidation";
import { splitVascularData } from "./utils";

export function createEligibilityRouter(): Router {
  const router = Router();

  // Eligibility analysis routes
  router.post('/api/encounters/:encounterId/analyze-eligibility', isAuthenticated, async (req: any, res) => {
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
      
      // Validate MAC region is present and valid before proceeding with eligibility analysis
      const macValidation = validateMACRegion(macRegion);
      if (!macValidation.valid) {
        return res.status(422).json({ 
          message: macValidation.error || "Invalid MAC region",
          error: "INVALID_MAC_REGION",
          patientId: patient.id,
          validRegions: VALID_MAC_REGIONS
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
      // Note: Diagnosis codes are stored in eligibilityChecks table, not directly on encounters
      const icd10Codes: string[] = [];

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
            const vascularData = splitVascularData((enc as any).vascularAssessment);
            return {
              date: enc.date,
              notes: decryptedNotes,
              woundDetails: enc.woundDetails,
              conservativeCare: enc.conservativeCare,
              procedureCodes: (enc as any).procedureCodes || [],
              vascularStudies: vascularData.vascularStudies,
              clinicalVascularAssessment: vascularData.clinicalVascularAssessment,
              functionalStatus: (enc as any).functionalStatus || {},
              diabeticStatus: (enc as any).diabeticStatus || null,
              infectionStatus: enc.infectionStatus,
              comorbidities: enc.comorbidities,
            };
          })
      );

      // Perform AI eligibility analysis with COMPLETE episode context
      const { analyzeEligibilityWithFullContext } = await import('../services/openai');
      const currentVascularData = splitVascularData((encounter as any).vascularAssessment);
      const analysisResult = await analyzeEligibilityWithFullContext({
        currentEncounter: {
          encounterNotes: await decryptEncounterNotes(encounter.encryptedNotes as string[], encounter.id),
          woundDetails: encounter.woundDetails,
          conservativeCare: encounter.conservativeCare,
          procedureCodes: (encounter as any).procedureCodes || [],
          vascularStudies: currentVascularData.vascularStudies,
          clinicalVascularAssessment: currentVascularData.clinicalVascularAssessment,
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
  router.post('/api/episodes/:episodeId/analyze-eligibility', isAuthenticated, async (req: any, res) => {
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
      
      // Validate MAC region is present and valid before proceeding with eligibility analysis
      const macValidation = validateMACRegion(macRegion);
      if (!macValidation.valid) {
        return res.status(422).json({ 
          message: macValidation.error || "Invalid MAC region",
          error: "INVALID_MAC_REGION",
          patientId: patient.id,
          validRegions: VALID_MAC_REGIONS
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
      // Note: Diagnosis codes are stored in eligibilityChecks table, not directly on encounters/episodes
      const icd10Codes: string[] = [];
      
      // Add episode-level diagnoses (episodes only have primaryDiagnosis, not secondaryDiagnoses)
      if (episode.primaryDiagnosis) {
        icd10Codes.push(episode.primaryDiagnosis);
      }
      
      // Encounters don't have diagnosis fields - they're stored in eligibilityChecks
      const allIcd10Codes = icd10Codes

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
      const { prepareAndAnalyzeEpisodeWithFullHistory } = await import('../services/openai');
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
  router.get('/api/encounters/:encounterId/eligibility-checks', isAuthenticated, async (req: any, res) => {
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
  router.get('/api/episodes/:episodeId/eligibility-checks', isAuthenticated, async (req: any, res) => {
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
  router.get('/api/patients-with-eligibility/:tenantId', isAuthenticated, async (req: any, res) => {
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


  return router;
}
