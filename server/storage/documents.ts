import { and, desc, eq } from "drizzle-orm";
import {
  documents,
  documentVersions,
  documentApprovals,
  documentSignatures,
  patients,
  auditLogs,
  type Document,
  type InsertDocument,
  type DocumentVersion,
  type InsertDocumentVersion,
  type DocumentApproval,
  type InsertDocumentApproval,
  type DocumentSignature,
  type InsertDocumentSignature,
  type InsertAuditLog,
} from "@shared/schema";
import type { StorageDependencies } from "./dependencies";
import { generateAuditHash } from "./audit";

export interface DocumentContext {
  createDocument(document: InsertDocument): Promise<Document>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentsByPatient(patientId: string): Promise<Document[]>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document>;
  createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion>;
  getDocumentVersions(documentId: string): Promise<DocumentVersion[]>;
  getDocumentVersion(versionId: string): Promise<DocumentVersion | undefined>;
  getCurrentDocumentVersion(documentId: string): Promise<DocumentVersion | undefined>;
  createDocumentApproval(approval: InsertDocumentApproval): Promise<DocumentApproval>;
  getDocumentApprovals(documentId: string): Promise<DocumentApproval[]>;
  getDocumentApproval(approvalId: string): Promise<DocumentApproval | undefined>;
  updateDocumentApproval(approvalId: string, updates: Partial<DocumentApproval>): Promise<DocumentApproval>;
  processDocumentApproval(approvalId: string, updates: {
    status: "approved" | "rejected";
    comments?: string;
    approverUserId: string;
    tenantId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<DocumentApproval>;
  getPendingApprovals(userId: string, tenantId: string, role?: string): Promise<DocumentApproval[]>;
  createDocumentSignature(signature: InsertDocumentSignature): Promise<DocumentSignature>;
  getDocumentSignatures(documentId: string): Promise<DocumentSignature[]>;
  getDocumentSignature(signatureId: string): Promise<DocumentSignature | undefined>;
}

export function createDocumentContext(deps: StorageDependencies): DocumentContext {
  const validStateTransitions: Record<string, string[]> = {
    draft: ["pending_approval"],
    pending_approval: ["approved", "rejected"],
    approved: ["signed"],
    rejected: [],
    signed: [],
  };

  const validateStateTransition = (currentStatus: string, newStatus: string): { isValid: boolean; error?: string } => {
    const allowedTransitions = validStateTransitions[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      return {
        isValid: false,
        error: `Invalid state transition from '${currentStatus}' to '${newStatus}'. Allowed transitions: [${allowedTransitions.join(", ")}]]`,
      };
    }

    return { isValid: true };
  };

  return {
    async createDocument(document: InsertDocument): Promise<Document> {
      const [newDocument] = await deps.db.insert(documents).values(document).returning();
      return newDocument;
    },

    async getDocument(id: string): Promise<Document | undefined> {
      const [document] = await deps.db.select().from(documents).where(eq(documents.id, id));
      return document;
    },

    async getDocumentsByPatient(patientId: string): Promise<Document[]> {
      return await deps.db
        .select()
        .from(documents)
        .where(eq(documents.patientId, patientId))
        .orderBy(desc(documents.createdAt));
    },

    async updateDocument(id: string, updates: Partial<Document>): Promise<Document> {
      if (updates.status) {
        const currentDocument = await this.getDocument(id);
        if (!currentDocument) {
          throw new Error("Document not found");
        }

        const validation = validateStateTransition(currentDocument.status, updates.status);
        if (!validation.isValid) {
          throw new Error(`STATE_TRANSITION_ERROR: ${validation.error}`);
        }
      }

      const [updatedDocument] = await deps.db
        .update(documents)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(documents.id, id))
        .returning();
      return updatedDocument;
    },

    async createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion> {
      const encryptedVersion = {
        ...version,
        content: deps.encryption.encryptDocumentContent(version.content),
      };

      const [newVersion] = await deps.db.insert(documentVersions).values(encryptedVersion).returning();

      return {
        ...newVersion,
        content: deps.encryption.decryptDocumentContent(newVersion.content),
      };
    },

    async getDocumentVersions(documentId: string): Promise<DocumentVersion[]> {
      const versions = await deps.db
        .select()
        .from(documentVersions)
        .where(eq(documentVersions.documentId, documentId))
        .orderBy(desc(documentVersions.version));

      return versions.map((version) => ({
        ...version,
        content: deps.encryption.decryptDocumentContent(version.content),
      }));
    },

    async getDocumentVersion(versionId: string): Promise<DocumentVersion | undefined> {
      const [version] = await deps.db.select().from(documentVersions).where(eq(documentVersions.id, versionId));

      if (!version) return undefined;

      return {
        ...version,
        content: deps.encryption.decryptDocumentContent(version.content),
      };
    },

    async getCurrentDocumentVersion(documentId: string): Promise<DocumentVersion | undefined> {
      const document = await this.getDocument(documentId);
      if (!document) return undefined;

      const [currentVersion] = await deps.db
        .select()
        .from(documentVersions)
        .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.version, document.currentVersion)));

      if (!currentVersion) return undefined;

      return {
        ...currentVersion,
        content: deps.encryption.decryptDocumentContent(currentVersion.content),
      };
    },

    async createDocumentApproval(approval: InsertDocumentApproval): Promise<DocumentApproval> {
      const [newApproval] = await deps.db.insert(documentApprovals).values(approval).returning();
      return newApproval;
    },

    async getDocumentApprovals(documentId: string): Promise<DocumentApproval[]> {
      return await deps.db
        .select()
        .from(documentApprovals)
        .where(eq(documentApprovals.documentId, documentId))
        .orderBy(desc(documentApprovals.createdAt));
    },

    async getDocumentApproval(approvalId: string): Promise<DocumentApproval | undefined> {
      const [approval] = await deps.db.select().from(documentApprovals).where(eq(documentApprovals.id, approvalId));
      return approval;
    },

    async updateDocumentApproval(approvalId: string, updates: Partial<DocumentApproval>): Promise<DocumentApproval> {
      const [updatedApproval] = await deps.db
        .update(documentApprovals)
        .set({ ...updates, reviewedAt: new Date() })
        .where(eq(documentApprovals.id, approvalId))
        .returning();
      return updatedApproval;
    },

    async processDocumentApproval(approvalId, updates) {
      return await deps.db.transaction(async (tx) => {
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
          throw new Error("Approval not found");
        }

        await tx
          .update(documents)
          .set({
            status: updates.status === "approved" ? "approved" : "rejected",
            updatedAt: new Date(),
          })
          .where(eq(documents.id, updatedApproval.documentId));

        const auditData: InsertAuditLog = {
          tenantId: updates.tenantId,
          userId: updates.approverUserId,
          action: updates.status === "approved" ? "APPROVE_DOCUMENT" : "REJECT_DOCUMENT",
          entity: "DocumentApproval",
          entityId: updatedApproval.id,
          ipAddress: updates.ipAddress || "",
          userAgent: updates.userAgent || "",
          previousHash: "",
        };

        await tx.insert(auditLogs).values({ ...auditData, currentHash: generateAuditHash(auditData) });

        return updatedApproval;
      });
    },

    async getPendingApprovals(userId: string, tenantId: string, role?: string): Promise<DocumentApproval[]> {
      const conditions = [eq(documentApprovals.status, "pending"), eq(patients.tenantId, tenantId)];

      if (role) {
        conditions.push(eq(documentApprovals.approverRole, role));
      }

      return await deps.db
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
    },

    async createDocumentSignature(signature: InsertDocumentSignature): Promise<DocumentSignature> {
      const encryptedSignature = signature.signatureData
        ? { ...signature, signatureData: deps.encryption.encryptSignatureData(signature.signatureData) }
        : signature;

      const [newSignature] = await deps.db.insert(documentSignatures).values(encryptedSignature).returning();

      return {
        ...newSignature,
        signatureData: newSignature.signatureData
          ? deps.encryption.decryptSignatureData(newSignature.signatureData)
          : null,
      };
    },

    async getDocumentSignatures(documentId: string): Promise<DocumentSignature[]> {
      const signatures = await deps.db
        .select()
        .from(documentSignatures)
        .where(eq(documentSignatures.documentId, documentId))
        .orderBy(desc(documentSignatures.signedAt));

      return signatures.map((signature) => ({
        ...signature,
        signatureData: signature.signatureData
          ? deps.encryption.decryptSignatureData(signature.signatureData)
          : null,
      }));
    },

    async getDocumentSignature(signatureId: string): Promise<DocumentSignature | undefined> {
      const [signature] = await deps.db.select().from(documentSignatures).where(eq(documentSignatures.id, signatureId));

      if (!signature) return undefined;

      return {
        ...signature,
        signatureData: signature.signatureData
          ? deps.encryption.decryptSignatureData(signature.signatureData)
          : null,
      };
    },
  };
}
