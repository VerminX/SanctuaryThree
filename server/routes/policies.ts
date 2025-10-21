import { Router } from "express";

import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { performPolicyUpdate, getPolicyUpdateStatus } from "../services/policyUpdater";
import { trackActivity } from "./utils";

export function createPoliciesRouter(): Router {
  const router = Router();

  router.get('/api/tenants/:tenantId/policies', isAuthenticated, async (req: any, res) => {
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

      const policies = await storage.getAllPolicySources();
      res.json(policies);
    } catch (error) {
      console.error("Error fetching policies:", error);
      res.status(500).json({ message: "Failed to fetch policies" });
    }
  });

  router.post('/api/tenants/:tenantId/policies/refresh', isAuthenticated, async (req: any, res) => {
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

      console.log(`Policy refresh triggered by user: ${userId} for tenant: ${tenantId} - refreshing ALL MAC regions`);
      
      // Perform full policy update for ALL MAC regions
      const result = await performPolicyUpdate();
      
      // Log audit event for tenant-specific action
      await storage.createAuditLog({
        tenantId,
        userId,
        action: 'TRIGGER_TENANT_POLICY_REFRESH',
        entity: 'PolicySource',
        entityId: 'all_regions',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        previousHash: '',
      });

      // Track user activity
      await trackActivity(
        tenantId,
        userId,
        'Refreshed policy database for all MAC regions',
        'PolicyUpdate',
        'all_regions',
        'All MAC regions'
      );

      res.json({
        message: 'Policy refresh completed successfully for all MAC regions',
        result
      });
    } catch (error) {
      console.error("Error refreshing policies:", error);
      res.status(500).json({ message: "Failed to refresh policies" });
    }
  });

  router.post('/api/admin/policies/update', isAuthenticated, async (req: any, res) => {
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

  router.get('/api/admin/policies/status', isAuthenticated, async (req: any, res) => {
    try {
      const status = await getPolicyUpdateStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting policy update status:", error);
      res.status(500).json({ message: "Failed to get policy status" });
    }
  });

  return router;
}
