/**
 * Data Recovery Utility for PHI Decryption Issues
 * Provides tools to identify, analyze, and manage corrupted encrypted patient data
 */

import { safeDecryptPatientData } from './encryption.js';
import { DatabaseStorage } from '../storage.js';

interface CorruptedPatientRecord {
  id: string;
  tenantId: string;
  encryptedFirstName: string;
  encryptedLastName: string;
  encryptedDob: string | null;
  dataLengths: {
    firstName: number;
    lastName: number;
    dob: number;
  };
  corruptionType: 'too_short' | 'invalid_base64' | 'decryption_failed';
  error: string;
}

/**
 * Analyzes encrypted patient data to identify corruption issues
 */
export function analyzePatientDataCorruption(patient: {
  id: string;
  tenantId: string;
  encryptedFirstName: string;
  encryptedLastName: string;
  encryptedDob: string | null;
}): CorruptedPatientRecord | null {
  const MIN_ENCRYPTED_LENGTH = 44; // IV(16) + TAG(16) + minimal data = ~44 chars base64

  const dataLengths = {
    firstName: patient.encryptedFirstName?.length || 0,
    lastName: patient.encryptedLastName?.length || 0,
    dob: patient.encryptedDob?.length || 0
  };

  // Check for too-short encrypted data
  if (dataLengths.firstName < MIN_ENCRYPTED_LENGTH || 
      dataLengths.lastName < MIN_ENCRYPTED_LENGTH ||
      (patient.encryptedDob && dataLengths.dob < MIN_ENCRYPTED_LENGTH)) {
    return {
      id: patient.id,
      tenantId: patient.tenantId,
      encryptedFirstName: patient.encryptedFirstName,
      encryptedLastName: patient.encryptedLastName,
      encryptedDob: patient.encryptedDob,
      dataLengths,
      corruptionType: 'too_short',
      error: 'Encrypted data is too short for valid AES-256-GCM format'
    };
  }

  // Check for invalid base64 encoding
  try {
    Buffer.from(patient.encryptedFirstName, 'base64');
    Buffer.from(patient.encryptedLastName, 'base64');
    if (patient.encryptedDob) {
      Buffer.from(patient.encryptedDob, 'base64');
    }
  } catch (error) {
    return {
      id: patient.id,
      tenantId: patient.tenantId,
      encryptedFirstName: patient.encryptedFirstName,
      encryptedLastName: patient.encryptedLastName,
      encryptedDob: patient.encryptedDob,
      dataLengths,
      corruptionType: 'invalid_base64',
      error: `Invalid base64 encoding: ${error}`
    };
  }

  // Check if decryption fails
  const { decryptionError } = safeDecryptPatientData({
    id: patient.id,
    encryptedFirstName: patient.encryptedFirstName,
    encryptedLastName: patient.encryptedLastName,
    encryptedDob: patient.encryptedDob
  });

  if (decryptionError) {
    return {
      id: patient.id,
      tenantId: patient.tenantId,
      encryptedFirstName: patient.encryptedFirstName,
      encryptedLastName: patient.encryptedLastName,
      encryptedDob: patient.encryptedDob,
      dataLengths,
      corruptionType: 'decryption_failed',
      error: 'Decryption failed with all available keys and methods'
    };
  }

  return null; // No corruption detected
}

/**
 * Scans all patients in a tenant for data corruption issues
 */
export async function scanTenantForCorruptedData(
  storage: DatabaseStorage, 
  tenantId: string
): Promise<CorruptedPatientRecord[]> {
  try {
    // Get all patients for the tenant (with encrypted data)
    const patients = await storage.getPatientsByTenant(tenantId);
    const corruptedRecords: CorruptedPatientRecord[] = [];

    for (const patient of patients) {
      const corruption = analyzePatientDataCorruption({
        id: patient.id,
        tenantId: patient.tenantId,
        encryptedFirstName: patient.encryptedFirstName,
        encryptedLastName: patient.encryptedLastName,
        encryptedDob: patient.encryptedDob
      });

      if (corruption) {
        corruptedRecords.push(corruption);
      }
    }

    return corruptedRecords;
  } catch (error) {
    console.error(`Error scanning tenant ${tenantId} for corrupted data:`, error);
    throw error;
  }
}

/**
 * Generates a data recovery report
 */
export function generateDataRecoveryReport(corruptedRecords: CorruptedPatientRecord[]): string {
  if (corruptedRecords.length === 0) {
    return 'No corrupted patient data found. All records are healthy.';
  }

  const report = [`Data Recovery Report - ${new Date().toISOString()}`, '='.repeat(60), ''];

  // Summary
  report.push(`Total Corrupted Records: ${corruptedRecords.length}`);
  report.push('');

  // Group by corruption type
  const byType = corruptedRecords.reduce((acc, record) => {
    acc[record.corruptionType] = (acc[record.corruptionType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  report.push('Corruption Types:');
  Object.entries(byType).forEach(([type, count]) => {
    report.push(`  - ${type}: ${count} records`);
  });
  report.push('');

  // Individual record details
  report.push('Detailed Record Analysis:');
  corruptedRecords.forEach((record, index) => {
    report.push(`${index + 1}. Patient ID: ${record.id}`);
    report.push(`   Tenant: ${record.tenantId}`);
    report.push(`   Type: ${record.corruptionType}`);
    report.push(`   Error: ${record.error}`);
    report.push(`   Data Lengths: firstName(${record.dataLengths.firstName}), lastName(${record.dataLengths.lastName}), dob(${record.dataLengths.dob})`);
    report.push('');
  });

  // Recommendations
  report.push('Recommendations:');
  if (byType.too_short) {
    report.push('- Records with too-short encrypted data likely suffered truncation during storage/migration');
    report.push('- These records may be unrecoverable and should be flagged for manual review');
  }
  if (byType.invalid_base64) {
    report.push('- Invalid base64 encoding suggests data corruption during transmission');
    report.push('- Check for character encoding issues in the storage layer');
  }
  if (byType.decryption_failed) {
    report.push('- Decryption failures may indicate key rotation or algorithm changes');
    report.push('- Verify encryption key availability and consider data migration tools');
  }

  return report.join('\n');
}

/**
 * Creates a database repair plan (for future implementation)
 */
export function createRepairPlan(corruptedRecords: CorruptedPatientRecord[]): string[] {
  const repairSteps: string[] = [];

  if (corruptedRecords.length === 0) {
    return ['No repair needed - all records are healthy'];
  }

  repairSteps.push('Data Repair Plan:');
  repairSteps.push('1. Backup current database before any repairs');
  repairSteps.push('2. For each corrupted record:');

  corruptedRecords.forEach(record => {
    repairSteps.push(`   Patient ${record.id}:`);
    switch (record.corruptionType) {
      case 'too_short':
        repairSteps.push('     - Flag for manual data re-entry');
        repairSteps.push('     - Contact clinic for original patient information');
        break;
      case 'invalid_base64':
        repairSteps.push('     - Attempt character encoding repair');
        repairSteps.push('     - If unrepairable, flag for manual re-entry');
        break;
      case 'decryption_failed':
        repairSteps.push('     - Try additional legacy key combinations');
        repairSteps.push('     - If keys unavailable, flag for re-entry');
        break;
    }
  });

  repairSteps.push('3. Update application to prevent future corruption');
  repairSteps.push('4. Implement regular data integrity checks');

  return repairSteps;
}