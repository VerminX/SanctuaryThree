// Encounter Note Data Recovery Service
// Phase 5 Task 4: Implement data recovery strategy for corrupted encounter notes

import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db';
import { encounters, patients } from '../../shared/schema';
import { decryptPHI } from './encryption';
import { healthMonitor } from './healthMonitoring';

export interface CorruptedEncounter {
  id: string;
  patientId: string;
  date: Date;
  encryptedNotes: string[];
  corruptionDetails: {
    totalNotes: number;
    corruptedNotes: number;
    corruptionTypes: { [type: string]: number };
    avgCorruptedLength: number;
    isQuarantined: boolean;
  };
}

export interface RecoveryReport {
  totalEncountersScanned: number;
  corruptedEncounters: number;
  corruptionRate: number;
  recoverableCount: number;
  quarantinedCount: number;
  recommendations: string[];
}

export class EncounterNoteRecoveryService {
  private corruptionCache = new Map<string, CorruptedEncounter>();
  private quarantinedEncounters = new Set<string>();

  /**
   * Scan database for corrupted encounter notes
   */
  async scanForCorruption(tenantId?: string): Promise<RecoveryReport> {
    console.log('🔍 SCANNING: Starting encounter note corruption scan...');
    
    let encountersToCheck;
    
    if (tenantId) {
      // Scan specific tenant's encounters
      encountersToCheck = await db
        .select()
        .from(encounters)
        .leftJoin(patients, eq(encounters.patientId, patients.id))
        .where(eq(patients.tenantId, tenantId));
    } else {
      // Scan all encounters
      encountersToCheck = await db
        .select()
        .from(encounters)
        .leftJoin(patients, eq(encounters.patientId, patients.id));
    }

    const report: RecoveryReport = {
      totalEncountersScanned: encountersToCheck.length,
      corruptedEncounters: 0,
      corruptionRate: 0,
      recoverableCount: 0,
      quarantinedCount: 0,
      recommendations: []
    };

    for (const row of encountersToCheck) {
      const encounter = row.encounters;
      if (!encounter || !encounter.encryptedNotes) continue;

      const corruptionDetails = await this.analyzeEncounterCorruption(encounter);
      
      if (corruptionDetails.corruptedNotes > 0) {
        report.corruptedEncounters++;
        
        const corruptedEncounter: CorruptedEncounter = {
          id: encounter.id,
          patientId: encounter.patientId,
          date: encounter.date,
          encryptedNotes: encounter.encryptedNotes as string[],
          corruptionDetails
        };
        
        this.corruptionCache.set(encounter.id, corruptedEncounter);
        
        // Determine if recoverable or should be quarantined
        if (this.shouldQuarantine(corruptionDetails)) {
          await this.quarantineEncounter(encounter.id);
          report.quarantinedCount++;
        } else {
          report.recoverableCount++;
        }
      }
    }

    report.corruptionRate = report.totalEncountersScanned > 0 
      ? (report.corruptedEncounters / report.totalEncountersScanned) * 100 
      : 0;

    report.recommendations = this.generateRecoveryRecommendations(report);
    
    console.log(`✅ SCAN COMPLETE: Found ${report.corruptedEncounters} corrupted encounters (${report.corruptionRate.toFixed(1)}% corruption rate)`);
    
    // Report to health monitoring
    healthMonitor.reportCorruptionScanResults(report);
    
    return report;
  }

  /**
   * Analyze individual encounter for corruption patterns
   */
  private async analyzeEncounterCorruption(encounter: any): Promise<CorruptedEncounter['corruptionDetails']> {
    const encryptedNotes = encounter.encryptedNotes as string[];
    let corruptedCount = 0;
    const corruptionTypes: { [type: string]: number } = {};
    const corruptedLengths: number[] = [];

    for (let i = 0; i < encryptedNotes.length; i++) {
      const note = encryptedNotes[i];
      const corruption = this.classifyNoteCorruption(note);
      
      if (corruption.isCorrupted) {
        corruptedCount++;
        corruptionTypes[corruption.type] = (corruptionTypes[corruption.type] || 0) + 1;
        corruptedLengths.push(note.length);
      }
    }

    return {
      totalNotes: encryptedNotes.length,
      corruptedNotes: corruptedCount,
      corruptionTypes,
      avgCorruptedLength: corruptedLengths.length > 0 
        ? Math.round(corruptedLengths.reduce((a, b) => a + b, 0) / corruptedLengths.length) 
        : 0,
      isQuarantined: this.quarantinedEncounters.has(encounter.id)
    };
  }

  /**
   * Classify individual note corruption
   */
  private classifyNoteCorruption(encryptedNote: string): { isCorrupted: boolean; type: string; details: any } {
    // Test for basic corruption patterns
    const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(encryptedNote);
    const isTooShort = encryptedNote.length < 44; // Minimum for IV + TAG
    
    // Test for encryption validity without throwing
    let canDecrypt = false;
    try {
      decryptPHI(encryptedNote);
      canDecrypt = true;
    } catch (error) {
      // Expected for corrupted data
    }

    if (!isBase64) {
      return {
        isCorrupted: true,
        type: 'invalid_base64',
        details: { length: encryptedNote.length, hasSpecialChars: !/^[A-Za-z0-9+/=]*$/.test(encryptedNote) }
      };
    }

    if (isTooShort) {
      return {
        isCorrupted: true,
        type: 'too_short',
        details: { length: encryptedNote.length, minimumRequired: 44 }
      };
    }

    if (!canDecrypt) {
      return {
        isCorrupted: true,
        type: 'decryption_failure',
        details: { length: encryptedNote.length, isValidBase64: true }
      };
    }

    return {
      isCorrupted: false,
      type: 'valid',
      details: { length: encryptedNote.length }
    };
  }

  /**
   * Determine if encounter should be quarantined
   */
  private shouldQuarantine(corruptionDetails: CorruptedEncounter['corruptionDetails']): boolean {
    // Quarantine if >50% of notes are corrupted or average length is critically low
    const corruptionPercentage = (corruptionDetails.corruptedNotes / corruptionDetails.totalNotes) * 100;
    const criticallyShort = corruptionDetails.avgCorruptedLength > 0 && corruptionDetails.avgCorruptedLength < 30;
    
    return corruptionPercentage > 50 || criticallyShort;
  }

  /**
   * Quarantine encounter to prevent repeated decryption attempts
   */
  private async quarantineEncounter(encounterId: string): Promise<void> {
    this.quarantinedEncounters.add(encounterId);
    
    // Add quarantine marker to database (non-destructive)
    try {
      await db
        .update(encounters)
        .set({ 
          attachmentMetadata: sql`COALESCE(attachment_metadata, '{}')::jsonb || '{"quarantined": true, "quarantineDate": "${new Date().toISOString()}", "reason": "corruption_detected"}'::jsonb`
        })
        .where(eq(encounters.id, encounterId));
      
      console.log(`🔒 QUARANTINED: Encounter ${encounterId} marked as quarantined`);
    } catch (error) {
      console.error(`Failed to quarantine encounter ${encounterId}:`, error);
    }
  }

  /**
   * Load quarantine state from database on startup
   */
  async loadQuarantineState(): Promise<void> {
    try {
      const quarantinedRecords = await db
        .select({ id: encounters.id })
        .from(encounters)
        .where(sql`(attachment_metadata->>'quarantined')::boolean = true`);
      
      quarantinedRecords.forEach(record => {
        this.quarantinedEncounters.add(record.id);
      });
      
      console.log(`📋 LOADED: ${quarantinedRecords.length} quarantined encounters from database`);
    } catch (error) {
      console.error('Failed to load quarantine state:', error);
    }
  }

  /**
   * Check if encounter is quarantined
   */
  isQuarantined(encounterId: string): boolean {
    return this.quarantinedEncounters.has(encounterId);
  }

  /**
   * Generate recovery recommendations based on scan results
   */
  private generateRecoveryRecommendations(report: RecoveryReport): string[] {
    const recommendations: string[] = [];
    
    if (report.corruptionRate > 20) {
      recommendations.push('🚨 HIGH CORRUPTION RATE: Immediate database investigation required');
      recommendations.push('🔍 CHECK: Database column encoding and size constraints');
      recommendations.push('📋 AUDIT: Recent data migration or backup restoration processes');
    }
    
    if (report.quarantinedCount > 0) {
      recommendations.push(`🔒 QUARANTINED: ${report.quarantinedCount} encounters flagged to prevent performance impact`);
      recommendations.push('🔄 RECOVERY: Use backup restoration or re-encryption utilities');
    }
    
    if (report.recoverableCount > 0) {
      recommendations.push(`🛠️ RECOVERABLE: ${report.recoverableCount} encounters may be repairable`);
      recommendations.push('💾 BACKUP: Check for recent backups to restore note data');
    }
    
    recommendations.push('📊 MONITORING: Enable proactive corruption detection');
    recommendations.push('🔐 PREVENTION: Implement data integrity checks in storage pipeline');
    
    return recommendations;
  }

  /**
   * Attempt to recover encounter from backup data
   */
  async recoverFromBackup(encounterId: string, backupNotes: string[]): Promise<boolean> {
    try {
      // Validate backup notes are valid strings
      const validatedNotes = backupNotes.map(note => {
        if (typeof note !== 'string' || note.trim() === '') {
          throw new Error('Invalid backup note data');
        }
        return note.trim();
      });

      // CRITICAL: Properly encrypt backup notes using existing encryption service
      const { encryptEncounterNotes } = await import('./encryption');
      const encryptedNotes = encryptEncounterNotes(validatedNotes);
      
      // Verify encryption worked by testing decryption - STRICT validation
      const { decryptEncounterNotes } = await import('./encryption.js');
      const testDecrypted = await decryptEncounterNotes(encryptedNotes);
      const isValidRoundTrip = testDecrypted.every((decrypted, i) => 
        decrypted === validatedNotes[i] // STRICT: Must match exactly, no placeholders allowed
      );
      
      if (!isValidRoundTrip) {
        throw new Error('Encryption round-trip validation failed - all notes must decrypt correctly');
      }

      // Update encounter with properly encrypted notes
      await db
        .update(encounters)
        .set({ 
          encryptedNotes: encryptedNotes,
          attachmentMetadata: sql`COALESCE(attachment_metadata, '{}')::jsonb || '{"recovered": true, "recoveryDate": "${new Date().toISOString()}", "quarantined": false}'::jsonb`
        })
        .where(eq(encounters.id, encounterId));

      // Remove from quarantine
      this.quarantinedEncounters.delete(encounterId);
      this.corruptionCache.delete(encounterId);

      console.log(`✅ RECOVERED: Encounter ${encounterId} successfully restored with ${encryptedNotes.length} encrypted notes`);
      return true;
    } catch (error) {
      console.error(`Failed to recover encounter ${encounterId}:`, error);
      return false;
    }
  }

  /**
   * Generate comprehensive recovery report
   */
  generateRecoveryReport(): string {
    const report = Array.from(this.corruptionCache.values());
    const quarantined = report.filter(enc => enc.corruptionDetails.isQuarantined);
    const recoverable = report.filter(enc => !enc.corruptionDetails.isQuarantined);
    
    return `
=== ENCOUNTER NOTE RECOVERY REPORT ===
📊 SUMMARY:
- Total Corrupted Encounters: ${report.length}
- Quarantined (Severe): ${quarantined.length}
- Recoverable (Moderate): ${recoverable.length}

🔒 QUARANTINED ENCOUNTERS:
${quarantined.map(enc => 
  `- ${enc.id}: ${enc.corruptionDetails.corruptedNotes}/${enc.corruptionDetails.totalNotes} notes corrupted`
).join('\n')}

🛠️ RECOVERABLE ENCOUNTERS:
${recoverable.map(enc => 
  `- ${enc.id}: ${enc.corruptionDetails.corruptedNotes}/${enc.corruptionDetails.totalNotes} notes corrupted`
).join('\n')}

🔍 CORRUPTION PATTERNS:
${report.map(enc => {
  const types = Object.entries(enc.corruptionDetails.corruptionTypes)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');
  return `- ${enc.id}: ${types}`;
}).join('\n')}
    `.trim();
  }
}

// Export singleton instance
export const encounterRecovery = new EncounterNoteRecoveryService();