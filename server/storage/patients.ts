import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  patients,
  encounters,
  episodes,
  eligibilityChecks,
  documents,
  type InsertPatient,
  type Patient,
  type InsertEncounter,
  type Encounter,
  type InsertEpisode,
  type Episode,
  type EligibilityCheck,
  type EpisodeWithFullHistory,
  type Document,
} from "@shared/schema";
import type { StorageDependencies } from "./dependencies";

interface DuplicatePatientGroup {
  tenantId: string;
  mrn: string;
  patientIds: string[];
}

export interface PatientContext {
  createPatient(patient: InsertPatient): Promise<Patient>;
  getPatient(id: string): Promise<Patient | undefined>;
  getPatientsByTenant(tenantId: string): Promise<Patient[]>;
  updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient>;
  getPatientByMrnAndTenant(mrn: string, tenantId: string): Promise<Patient | undefined>;
  checkPatientDuplicate(mrn: string, tenantId: string): Promise<boolean>;
  createEncounter(encounter: InsertEncounter): Promise<Encounter>;
  getEncounter(id: string): Promise<Encounter | undefined>;
  getEncountersByPatient(patientId: string): Promise<Encounter[]>;
  updateEncounter(id: string, encounter: Partial<InsertEncounter>): Promise<Encounter>;
  getEncounterByPatientAndDate(patientId: string, encounterDate: string): Promise<Encounter | undefined>;
  checkEncounterDuplicate(patientId: string, date: Date): Promise<boolean>;
  findDuplicatePatients(): Promise<DuplicatePatientGroup[]>;
  getDuplicatePatientDetails(tenantId: string, mrn: string): Promise<Patient[]>;
  moveEncountersToPatient(fromPatientId: string, toPatientId: string): Promise<number>;
  moveEpisodesToPatient(fromPatientId: string, toPatientId: string): Promise<number>;
  deletePatient(patientId: string): Promise<void>;
  deduplicatePatients(): Promise<{ mergedGroups: number; removedPatients: number; preservedData: { encounters: number; episodes: number } }>;
  createEpisode(episode: InsertEpisode): Promise<Episode>;
  getEpisode(id: string): Promise<Episode | undefined>;
  getEpisodesByPatient(patientId: string): Promise<Episode[]>;
  updateEpisode(id: string, episode: Partial<InsertEpisode>): Promise<Episode>;
  deleteEpisode(id: string): Promise<void>;
  getEncountersByEpisode(episodeId: string): Promise<Encounter[]>;
  getEligibilityChecksByEpisode(episodeId: string): Promise<EligibilityCheck[]>;
  getDocumentsByEpisode(episodeId: string): Promise<Document[]>;
  getAllEncountersWithPatientsByTenant(tenantId: string): Promise<Array<Encounter & { patientName: string; patientId: string; patient: any }>>;
  getAllEpisodesWithPatientsByTenant(tenantId: string): Promise<Array<Episode & { patientName: string; patientId: string; encounterCount: number }>>;
  getAllPatientsWithEligibilityByTenant(tenantId: string): Promise<Array<{ id: string; name: string; mrn: string; eligibilityChecks: EligibilityCheck[] }>>;
  getAllPatientsWithDocumentsByTenant(tenantId: string): Promise<Array<{ id: string; name: string; mrn: string; documents: Document[] }>>;
  getPatientEligibilityHistory(patientId: string): Promise<EligibilityCheck[]>;
  getEpisodeWithEnrichedHistory(episodeId: string): Promise<EpisodeWithFullHistory>;
  getPatientEpisodesWithHistory(patientId: string): Promise<EpisodeWithFullHistory[]>;
}

const formatEncounterDate = (date: Date): string => date.toISOString().split("T")[0];

export function createPatientContext(deps: StorageDependencies): PatientContext {
  return {
    async createPatient(patient: InsertPatient): Promise<Patient> {
      const isDuplicate = await this.checkPatientDuplicate(patient.mrn, patient.tenantId);
      if (isDuplicate) {
        throw new Error(`Patient with MRN ${patient.mrn} already exists in this tenant`);
      }

      const [newPatient] = await deps.db.insert(patients).values(patient).returning();
      return newPatient;
    },

    async getPatient(id: string): Promise<Patient | undefined> {
      const [patient] = await deps.db.select().from(patients).where(eq(patients.id, id));
      return patient;
    },

    async getPatientsByTenant(tenantId: string): Promise<Patient[]> {
      return await deps.db
        .select()
        .from(patients)
        .where(eq(patients.tenantId, tenantId))
        .orderBy(desc(patients.createdAt));
    },

    async updatePatient(id: string, patient: Partial<InsertPatient>): Promise<Patient> {
      const [updatedPatient] = await deps.db
        .update(patients)
        .set({ ...patient, updatedAt: new Date() })
        .where(eq(patients.id, id))
        .returning();
      return updatedPatient;
    },

    async getPatientByMrnAndTenant(mrn: string, tenantId: string): Promise<Patient | undefined> {
      const [patient] = await deps.db
        .select()
        .from(patients)
        .where(and(eq(patients.mrn, mrn), eq(patients.tenantId, tenantId)));
      return patient;
    },

    async checkPatientDuplicate(mrn: string, tenantId: string): Promise<boolean> {
      const existingPatient = await this.getPatientByMrnAndTenant(mrn, tenantId);
      return !!existingPatient;
    },

    async createEncounter(encounter: InsertEncounter): Promise<Encounter> {
      const isDuplicate = await this.checkEncounterDuplicate(encounter.patientId, encounter.date);
      if (isDuplicate) {
        throw new Error(`Encounter already exists for patient ${encounter.patientId} on ${formatEncounterDate(encounter.date)}`);
      }

      const [newEncounter] = await deps.db.insert(encounters).values(encounter).returning();
      return newEncounter;
    },

    async getEncounter(id: string): Promise<Encounter | undefined> {
      const [encounter] = await deps.db.select().from(encounters).where(eq(encounters.id, id));
      return encounter;
    },

    async getEncountersByPatient(patientId: string): Promise<Encounter[]> {
      return await deps.db
        .select()
        .from(encounters)
        .where(eq(encounters.patientId, patientId))
        .orderBy(desc(encounters.date));
    },

    async updateEncounter(id: string, encounter: Partial<InsertEncounter>): Promise<Encounter> {
      const [updatedEncounter] = await deps.db
        .update(encounters)
        .set({ ...encounter, updatedAt: new Date() })
        .where(eq(encounters.id, id))
        .returning();
      return updatedEncounter;
    },

    async getEncounterByPatientAndDate(patientId: string, encounterDate: string): Promise<Encounter | undefined> {
      const [encounter] = await deps.db
        .select()
        .from(encounters)
        .where(and(eq(encounters.patientId, patientId), sql`DATE(${encounters.date}) = ${encounterDate}`));
      return encounter;
    },

    async checkEncounterDuplicate(patientId: string, date: Date): Promise<boolean> {
      const encounterDate = formatEncounterDate(date);
      const existingEncounter = await this.getEncounterByPatientAndDate(patientId, encounterDate);
      return !!existingEncounter;
    },

    async findDuplicatePatients(): Promise<DuplicatePatientGroup[]> {
      const duplicates = await deps.db
        .select({
          tenantId: patients.tenantId,
          mrn: patients.mrn,
          patientIds: sql<string>`STRING_AGG(${patients.id}::text, ',')`,
        })
        .from(patients)
        .groupBy(patients.tenantId, patients.mrn)
        .having(sql`COUNT(*) > 1`);

      return duplicates.map((d) => ({
        tenantId: d.tenantId,
        mrn: d.mrn,
        patientIds: d.patientIds.split(","),
      }));
    },

    async getDuplicatePatientDetails(tenantId: string, mrn: string): Promise<Patient[]> {
      return await deps.db
        .select()
        .from(patients)
        .where(and(eq(patients.tenantId, tenantId), eq(patients.mrn, mrn)))
        .orderBy(patients.createdAt);
    },

    async moveEncountersToPatient(fromPatientId: string, toPatientId: string): Promise<number> {
      const result = await deps.db
        .update(encounters)
        .set({ patientId: toPatientId })
        .where(eq(encounters.patientId, fromPatientId));
      return result.rowCount || 0;
    },

    async moveEpisodesToPatient(fromPatientId: string, toPatientId: string): Promise<number> {
      const result = await deps.db
        .update(episodes)
        .set({ patientId: toPatientId })
        .where(eq(episodes.patientId, fromPatientId));
      return result.rowCount || 0;
    },

    async deletePatient(patientId: string): Promise<void> {
      await deps.db.delete(patients).where(eq(patients.id, patientId));
    },

    async deduplicatePatients(): Promise<{ mergedGroups: number; removedPatients: number; preservedData: { encounters: number; episodes: number } }> {
      const duplicateGroups = await this.findDuplicatePatients();
      let removedPatients = 0;
      let totalEncountersMoved = 0;
      let totalEpisodesMoved = 0;

      for (const group of duplicateGroups) {
        const duplicatePatients = await this.getDuplicatePatientDetails(group.tenantId, group.mrn);

        if (duplicatePatients.length <= 1) continue;

        const keepPatient = duplicatePatients[0];
        const duplicatesToRemove = duplicatePatients.slice(1);

        for (const duplicate of duplicatesToRemove) {
          const encountsMoved = await this.moveEncountersToPatient(duplicate.id, keepPatient.id);
          const episodesMoved = await this.moveEpisodesToPatient(duplicate.id, keepPatient.id);

          totalEncountersMoved += encountsMoved;
          totalEpisodesMoved += episodesMoved;

          await this.deletePatient(duplicate.id);
          removedPatients++;
        }
      }

      return {
        mergedGroups: duplicateGroups.length,
        removedPatients,
        preservedData: {
          encounters: totalEncountersMoved,
          episodes: totalEpisodesMoved,
        },
      };
    },

    async createEpisode(episode: InsertEpisode): Promise<Episode> {
      const [newEpisode] = await deps.db.insert(episodes).values(episode).returning();
      return newEpisode;
    },

    async getEpisode(id: string): Promise<Episode | undefined> {
      const [episode] = await deps.db.select().from(episodes).where(eq(episodes.id, id));
      return episode;
    },

    async getEpisodesByPatient(patientId: string): Promise<Episode[]> {
      return await deps.db
        .select()
        .from(episodes)
        .where(eq(episodes.patientId, patientId))
        .orderBy(desc(episodes.episodeStartDate));
    },

    async updateEpisode(id: string, episode: Partial<InsertEpisode>): Promise<Episode> {
      const [updatedEpisode] = await deps.db
        .update(episodes)
        .set({ ...episode, updatedAt: new Date() })
        .where(eq(episodes.id, id))
        .returning();
      return updatedEpisode;
    },

    async deleteEpisode(id: string): Promise<void> {
      await deps.db.delete(episodes).where(eq(episodes.id, id));
    },

    async getEncountersByEpisode(episodeId: string): Promise<Encounter[]> {
      return await deps.db
        .select()
        .from(encounters)
        .where(eq(encounters.episodeId, episodeId))
        .orderBy(desc(encounters.date));
    },

    async getEligibilityChecksByEpisode(episodeId: string): Promise<EligibilityCheck[]> {
      return await deps.db
        .select()
        .from(eligibilityChecks)
        .where(eq(eligibilityChecks.episodeId, episodeId))
        .orderBy(desc(eligibilityChecks.createdAt));
    },

    async getDocumentsByEpisode(episodeId: string): Promise<any[]> {
      return await deps.db
        .select()
        .from(documents)
        .where(eq(documents.episodeId, episodeId))
        .orderBy(desc(documents.createdAt));
    },

    async getAllEncountersWithPatientsByTenant(tenantId: string) {
      const { safeDecryptPatientData } = await import("../services/encryption");

      const encounterResults = await deps.db
        .select({
          encounter: encounters,
          patient: patients,
        })
        .from(encounters)
        .innerJoin(patients, eq(encounters.patientId, patients.id))
        .where(eq(patients.tenantId, tenantId))
        .orderBy(desc(encounters.date));

      return encounterResults.map((row) => {
        const { patientData, decryptionError } = safeDecryptPatientData(row.patient);
        return {
          ...row.encounter,
          patientName: `${patientData.firstName} ${patientData.lastName}`.trim(),
          patient: {
            id: patientData.id,
            firstName: patientData.firstName,
            lastName: patientData.lastName,
            mrn: patientData.mrn,
            _decryptionFailed: decryptionError,
          },
        };
      });
    },

    async getAllEpisodesWithPatientsByTenant(tenantId: string) {
      const { safeDecryptPatientData } = await import("../services/encryption");

      try {
        const episodesWithPatients = await deps.db
          .select({
            episode: episodes,
            patient: patients,
          })
          .from(episodes)
          .innerJoin(patients, eq(episodes.patientId, patients.id))
          .where(eq(patients.tenantId, tenantId))
          .orderBy(desc(episodes.episodeStartDate));

        const episodeIds = episodesWithPatients.map((row) => row.episode.id);

        const episodeEncounterCounts = episodeIds.length
          ? await deps.db
              .select({ episodeId: encounters.episodeId, count: sql<number>`COUNT(*)` })
              .from(encounters)
              .where(inArray(encounters.episodeId, episodeIds))
              .groupBy(encounters.episodeId)
          : [];

        return episodesWithPatients.map((row) => {
          const { patientData, decryptionError } = safeDecryptPatientData(row.patient);
          const encounterCount = episodeEncounterCounts.find((c) => c.episodeId === row.episode.id)?.count || 0;

          return {
            ...row.episode,
            patientName: decryptionError ? "[DECRYPTION ERROR]" : `${patientData.firstName} ${patientData.lastName}`.trim(),
            patientId: row.episode.patientId,
            encounterCount,
          };
        });
      } catch (error) {
        deps.logger.error("EPISODE_PATIENT_QUERY_FAILED", { tenantId, message: (error as Error).message });
        throw new Error(`Failed to fetch episodes with patients: ${(error as Error).message}`);
      }
    },

    async getAllPatientsWithEligibilityByTenant(tenantId: string) {
      const { safeDecryptPatientData } = await import("../services/encryption");

      const tenantPatients = await deps.db
        .select()
        .from(patients)
        .where(eq(patients.tenantId, tenantId));

      const patientIds = tenantPatients.map((p) => p.id);
      if (patientIds.length === 0) return [];

      const allEncounters = await deps.db
        .select()
        .from(encounters)
        .where(inArray(encounters.patientId, patientIds));

      const encounterIds = allEncounters.map((e) => e.id);
      const allEligibilityChecks = encounterIds.length
        ? await deps.db
            .select()
            .from(eligibilityChecks)
            .where(inArray(eligibilityChecks.encounterId, encounterIds))
        : [];

      return tenantPatients.map((patient) => {
        const { patientData, decryptionError } = safeDecryptPatientData(patient);

        if (decryptionError) {
          return {
            id: patient.id,
            name: "[DECRYPTION ERROR]",
            mrn: "[ENCRYPTED]",
            eligibilityChecks: [],
          };
        }

        const patientEncounters = allEncounters.filter((e) => e.patientId === patient.id);
        const patientEncounterIds = patientEncounters.map((e) => e.id);

        const patientEligibilityChecks = allEligibilityChecks.filter((check) =>
          patientEncounterIds.includes(check.encounterId),
        );

        return {
          id: patient.id,
          name: `${patientData.firstName} ${patientData.lastName}`.trim(),
          mrn: patientData.mrn || "",
          eligibilityChecks: patientEligibilityChecks,
        };
      });
    },

    async getAllPatientsWithDocumentsByTenant(tenantId: string) {
      const { safeDecryptPatientData } = await import("../services/encryption");

      const tenantPatients = await deps.db
        .select()
        .from(patients)
        .where(eq(patients.tenantId, tenantId));

      const patientIds = tenantPatients.map((p) => p.id);
      if (patientIds.length === 0) return [];

      const allDocuments = await deps.db
        .select()
        .from(documents)
        .where(inArray(documents.patientId, patientIds))
        .orderBy(desc(documents.createdAt));

      return tenantPatients.map((patient) => {
        const { patientData, decryptionError } = safeDecryptPatientData(patient);

        if (decryptionError) {
          return {
            id: patient.id,
            name: "[DECRYPTION ERROR]",
            mrn: "[ENCRYPTED]",
            documents: [],
          };
        }

        const patientDocuments = allDocuments.filter((doc) => doc.patientId === patient.id);

        return {
          id: patient.id,
          name: `${patientData.firstName} ${patientData.lastName}`.trim(),
          mrn: patientData.mrn || "",
          documents: patientDocuments,
        };
      });
    },

    async getPatientEligibilityHistory(patientId: string): Promise<EligibilityCheck[]> {
      const results = await deps.db
        .select({
          id: eligibilityChecks.id,
          encounterId: eligibilityChecks.encounterId,
          episodeId: eligibilityChecks.episodeId,
          result: eligibilityChecks.result,
          citations: eligibilityChecks.citations,
          llmModel: eligibilityChecks.llmModel,
          selectedPolicyId: eligibilityChecks.selectedPolicyId,
          selectionAudit: eligibilityChecks.selectionAudit,
          createdAt: eligibilityChecks.createdAt,
        })
        .from(eligibilityChecks)
        .innerJoin(encounters, eq(eligibilityChecks.encounterId, encounters.id))
        .where(eq(encounters.patientId, patientId))
        .orderBy(desc(eligibilityChecks.createdAt));

      return results.map((result) => ({
        ...result,
        primaryDiagnosis: null,
        secondaryDiagnoses: null,
        diagnosisValidationResult: null,
        diagnosisValidationScore: null,
        diagnosisValidationStatus: null,
        clinicalNecessityResult: null,
        clinicalNecessityScore: null,
        clinicalNecessityLevel: null,
        woundTypeMappingResult: null,
        mappedWoundType: null,
        woundMappingConfidence: null,
        diagnosisComplexityResult: null,
        complexityScore: null,
        complexityLevel: null,
        diagnosisRecommendationsResult: null,
        recommendationsCount: null,
        criticalRecommendationsCount: null,
        overallDiagnosisScore: null,
        diagnosisValidationTimestamp: null,
        diagnosisValidationVersion: null,
        validationAuditTrail: null,
      }));
    },

    async getEpisodeWithEnrichedHistory(episodeId: string): Promise<EpisodeWithFullHistory> {
      const episode = await this.getEpisode(episodeId);
      if (!episode) {
        throw new Error("Episode not found");
      }

      const patient = await this.getPatient(episode.patientId);
      if (!patient) {
        throw new Error("Patient not found");
      }

      const episodeEncounters = await this.getEncountersByEpisode(episodeId);
      const episodeEligibilityChecks = await this.getEligibilityChecksByEpisode(episodeId);

      return {
        ...episode,
        encounters: episodeEncounters,
        eligibilityChecks: episodeEligibilityChecks,
        patient,
      };
    },

    async getPatientEpisodesWithHistory(patientId: string): Promise<EpisodeWithFullHistory[]> {
      const patientEpisodes = await this.getEpisodesByPatient(patientId);
      const patient = await this.getPatient(patientId);
      if (!patient) {
        throw new Error("Patient not found");
      }

      const enrichedEpisodes = await Promise.all(
        patientEpisodes.map(async (episode) => {
          const episodeEncounters = await this.getEncountersByEpisode(episode.id);
          const episodeEligibilityChecks = await this.getEligibilityChecksByEpisode(episode.id);

          return {
            ...episode,
            encounters: episodeEncounters,
            eligibilityChecks: episodeEligibilityChecks,
            patient,
          };
        }),
      );

      return enrichedEpisodes;
    },
  };
}
