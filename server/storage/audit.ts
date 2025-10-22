import crypto from "crypto";
import { desc, eq } from "drizzle-orm";
import { auditLogs, type AuditLog, type InsertAuditLog } from "@shared/schema";
import type { StorageDependencies } from "./dependencies";

export const generateAuditHash = (log: InsertAuditLog): string => {
  const data = `${log.tenantId}:${log.userId}:${log.action}:${log.entity}:${log.entityId}:${Date.now()}`;
  return crypto.createHash("sha256").update(data).digest("hex");
};

export interface AuditContext {
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsByTenant(tenantId: string, limit?: number): Promise<AuditLog[]>;
}

export function createAuditContext(deps: StorageDependencies): AuditContext {
  return {
    async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
      const auditWithHash = { ...log, currentHash: generateAuditHash(log) };

      try {
        const [newLog] = await deps.db.insert(auditLogs).values(auditWithHash).returning();
        return newLog;
      } catch (error) {
        deps.logger.error("AUDIT_WRITE_FAILED", { tenantId: log.tenantId, action: log.action });
        throw error;
      }
    },

    async getAuditLogsByTenant(tenantId: string, limit: number = 100): Promise<AuditLog[]> {
      return await deps.db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, tenantId))
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);
    },
  };
}
