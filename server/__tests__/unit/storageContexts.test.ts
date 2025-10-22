import { describe, expect, it, jest } from "@jest/globals";
import { createDocumentContext } from "../../storage/documents";
import { createAuditContext } from "../../storage/audit";
import type { StorageDependencies } from "../../storage/dependencies";
import type { InsertDocumentVersion, InsertAuditLog } from "@shared/schema";

describe("storage context composition", () => {
  const baseLogger = () => ({
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  });

  const buildDeps = (overrides: Partial<StorageDependencies>): StorageDependencies => {
    const encryption = overrides.encryption ?? {
      encryptDocumentContent: jest.fn((value: string) => `enc:${value}`),
      decryptDocumentContent: jest.fn((value: string) => value.replace(/^enc:/, "dec:")),
      encryptSignatureData: jest.fn((value: string) => `sig:${value}`),
      decryptSignatureData: jest.fn((value: string) => value.replace(/^sig:/, "desig:")),
    };

    const logger = overrides.logger ?? baseLogger();

    const db = overrides.db ?? ({} as any);

    return { db, encryption, logger } as StorageDependencies;
  };

  it("encrypts document content via the centralized encryption service without leaking PHI", async () => {
    const returningMock = jest.fn(async () => [
      {
        id: "version-1",
        documentId: "doc-1",
        version: 1,
        content: "enc:raw-content",
        citations: {},
        createdBy: "user-1",
        createdAt: new Date(),
      },
    ]);

    const insertValuesMock = jest.fn().mockReturnValue({
      returning: returningMock,
    });

    const dbMock = {
      insert: jest.fn(() => ({ values: insertValuesMock })),
      select: jest.fn(),
      update: jest.fn(),
      transaction: jest.fn(async () => undefined),
    } as unknown as StorageDependencies["db"];

    const encryption = {
      encryptDocumentContent: jest.fn((value: string) => `enc:${value}`),
      decryptDocumentContent: jest.fn((value: string) => value.replace(/^enc:/, "plain:")),
      encryptSignatureData: jest.fn((value: string) => `sig:${value}`),
      decryptSignatureData: jest.fn((value: string) => value.replace(/^sig:/, "plain-sig:")),
    };

    const logger = baseLogger();

    const documentContext = createDocumentContext(buildDeps({ db: dbMock, encryption, logger }));

    const payload: InsertDocumentVersion = {
      documentId: "doc-1",
      version: 1,
      content: "raw-content",
      citations: {},
      createdBy: "user-1",
    };

    const result = await documentContext.createDocumentVersion(payload);

    expect(encryption.encryptDocumentContent).toHaveBeenCalledWith("raw-content");
    expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({ content: "enc:raw-content" }));
    expect(encryption.decryptDocumentContent).toHaveBeenCalledWith("enc:raw-content");
    expect(result.content).toBe("plain:raw-content");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs sanitized audit failures without including PHI", async () => {
    const failingReturningMock = jest.fn(async () => {
      throw new Error("db failure");
    });

    const insertMock = jest.fn(() => ({
      values: jest.fn(() => ({ returning: failingReturningMock })),
    }));

    const dbMock = {
      insert: insertMock,
      select: jest.fn(() => ({ from: jest.fn() })),
    } as unknown as StorageDependencies["db"];

    const logger = baseLogger();
    const auditContext = createAuditContext(buildDeps({ db: dbMock, logger }));

    const auditPayload: InsertAuditLog = {
      tenantId: "tenant-1",
      userId: "user-9",
      action: "READ_DOC",
      entity: "Document",
      entityId: "doc-22",
      ipAddress: "10.0.0.1",
      userAgent: "jest",
      previousHash: "",
    };

    await expect(auditContext.createAuditLog(auditPayload)).rejects.toThrow("db failure");

    expect(logger.error).toHaveBeenCalledWith(
      "AUDIT_WRITE_FAILED",
      expect.objectContaining({ tenantId: "tenant-1", action: "READ_DOC" })
    );

    const loggedMeta = (logger.error as jest.Mock).mock.calls[0][1];
    expect(loggedMeta).not.toHaveProperty("entityId", "doc-22");
    expect(loggedMeta).not.toHaveProperty("userId", "user-9");
  });
});
