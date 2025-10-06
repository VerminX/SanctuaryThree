import crypto from 'crypto';
import { healthMonitor } from './healthMonitoring';

// ============================================================================
// DEVELOPMENT MODE: ENCRYPTION DISABLED
// ============================================================================
// All encryption/decryption functions are pass-through (no actual encryption)
// This dramatically improves performance during development
// 
// TO RE-ENABLE ENCRYPTION:
// - Replace encryptPHI() and decryptPHI() with actual AES-256-GCM implementation
// - All other functions will automatically work since they use these base functions
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Get encryption key from environment (ENCRYPTION_KEY only)
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    // In development mode, we don't actually need the key
    // Return a dummy buffer to keep the function signature
    return Buffer.alloc(KEY_LENGTH);
  }
  
  // Derive a consistent key from the provided secret
  return crypto.scryptSync(key, 'woundcare-phi-salt', KEY_LENGTH);
};

// Legacy key derivation methods for backward compatibility
const getLegacyKeys = (): Buffer[] => {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const sessionSecret = process.env.SESSION_SECRET;
  
  const keys: Buffer[] = [];
  
  // Try ENCRYPTION_KEY with various salt methods (preferred)
  if (encryptionKey) {
    keys.push(
      // Current method
      crypto.scryptSync(encryptionKey, 'woundcare-phi-salt', KEY_LENGTH),
      // Alternative salt that might have been used
      crypto.scryptSync(encryptionKey, 'woundcare-phi', KEY_LENGTH),
      // Alternative salt format
      crypto.scryptSync(encryptionKey, 'phi-salt', KEY_LENGTH),
      // Direct key without salt (if original implementation was different)
      Buffer.from(crypto.createHash('sha256').update(encryptionKey).digest().subarray(0, KEY_LENGTH))
    );
  }
  
  // Legacy fallback for SESSION_SECRET (only for decrypting old data)
  if (sessionSecret && encryptionKey !== sessionSecret) {
    keys.push(
      crypto.scryptSync(sessionSecret, 'woundcare-phi-salt', KEY_LENGTH),
      crypto.scryptSync(sessionSecret, 'woundcare-phi', KEY_LENGTH),
      crypto.scryptSync(sessionSecret, 'phi-salt', KEY_LENGTH),
      Buffer.from(crypto.createHash('sha256').update(sessionSecret).digest().subarray(0, KEY_LENGTH))
    );
  }
  
  return keys;
};

// DEVELOPMENT MODE: Pass-through encryption (no actual encryption)
export function encryptPHI(plaintext: string): string {
  // In development mode, just return the plaintext
  // This eliminates all encryption overhead
  return plaintext;
}

// Cache for failed decryption attempts to avoid repeated processing of corrupted data
const decryptionFailureCache = new Map<string, boolean>();

// DEVELOPMENT MODE: Pass-through decryption (no actual decryption)
export function decryptPHI(encryptedData: string): string {
  // In development mode, just return the data as-is
  // This eliminates all decryption overhead and multi-key attempts
  return encryptedData;
}

// Helper functions for patient data
export function encryptPatientData(firstName: string, lastName: string, dob?: string) {
  return {
    encryptedFirstName: encryptPHI(firstName),
    encryptedLastName: encryptPHI(lastName),
    encryptedDob: dob ? encryptPHI(dob) : null,
  };
}


export function decryptPatientData(patient: { encryptedFirstName: string; encryptedLastName: string; encryptedDob: string | null }) {
  return {
    firstName: decryptPHI(patient.encryptedFirstName),
    lastName: decryptPHI(patient.encryptedLastName),
    dob: patient.encryptedDob ? decryptPHI(patient.encryptedDob) : null,
  };
}

// RESILIENT DECRYPTION: Safely decrypt patient data with error handling
// Track patient-level failures to avoid excessive logging
const patientFailureCache = new Map<string, { count: number; lastLoggedAt: number; lastAttempt: number }>();

export function safeDecryptPatientData(patient: { id: string; encryptedFirstName: string; encryptedLastName: string; encryptedDob: string | null; [key: string]: any }): { patientData: any; decryptionError: boolean } {
  const now = Date.now();
  const cacheKey = patient.id;
  const cached = patientFailureCache.get(cacheKey);
  
  // Rate limit logging for known failed patients (only log once per hour)
  const shouldLog = !cached || (now - cached.lastLoggedAt > 3600000); // 1 hour
  
  try {
    const decryptedData = {
      firstName: decryptPHI(patient.encryptedFirstName),
      lastName: decryptPHI(patient.encryptedLastName),  
      dob: patient.encryptedDob ? decryptPHI(patient.encryptedDob) : null,
    };
    
    // Clear failure cache on success
    patientFailureCache.delete(cacheKey);
    
    return {
      patientData: {
        ...patient,
        ...decryptedData,
      },
      decryptionError: false
    };
  } catch (error) {
    // Update failure tracking
    const updatedCache = {
      count: (cached?.count || 0) + 1,
      lastLoggedAt: shouldLog ? now : (cached?.lastLoggedAt || 0),
      lastAttempt: now
    };
    patientFailureCache.set(cacheKey, updatedCache);
    
    // Only log if we haven't logged recently for this patient
    if (shouldLog) {
      // Create non-reversible hash for logging (HIPAA-safe)
      const patientHash = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY || 'fallback')
        .update(patient.id)
        .digest('hex')
        .substring(0, 8);
      
      console.error(`DECRYPTION FAILURE for patient [${patientHash}] (attempt #${updatedCache.count}):`, {
        patientHash,
        error: error instanceof Error ? error.message : 'Unknown error',
        hasFirstName: !!patient.encryptedFirstName,
        hasLastName: !!patient.encryptedLastName,
        hasDob: !!patient.encryptedDob,
        encryptedLengths: {
          firstName: patient.encryptedFirstName?.length || 0,
          lastName: patient.encryptedLastName?.length || 0,
          dob: patient.encryptedDob?.length || 0
        }
      });
      
      // Report to health monitor with hash instead of ID
      healthMonitor.reportPatientEncryptionFailure(patientHash);
      
      // Log aggregated warning for multiple patients with corrupted data
      if (patientFailureCache.size > 1) {
        console.warn(`PATIENT DECRYPTION WARNING: ${patientFailureCache.size} patients have corrupted encrypted data (total attempts: ${Array.from(patientFailureCache.values()).reduce((sum, data) => sum + data.count, 0)})`);
      }
    }
    
    // Return patient with placeholder data to indicate decryption failure
    return {
      patientData: {
        ...patient,
        firstName: '[DECRYPTION_ERROR]',
        lastName: '[DECRYPTION_ERROR]', 
        dob: null,
        _decryptionFailed: true
      },
      decryptionError: true
    };
  }
}

// Helper for encounter notes
export function encryptEncounterNotes(notes: string[]): string[] {
  return notes.map(note => encryptPHI(note));
}

// Track encounter note failures with proper time-based rate limiting (like patient data)
const encounterNoteFailureCache = new Map<string, { count: number; lastLoggedAt: number; lastAttempt: number }>();

// Cache the encounter recovery service to avoid repeated imports
let encounterRecoveryService: any = null;

export async function decryptEncounterNotes(encryptedNotes: string[], encounterId?: string): Promise<string[]> {
  // Load encounter recovery service once if needed
  if (encounterId && !encounterRecoveryService) {
    try {
      const module = await import('./encounterRecovery.js');
      encounterRecoveryService = module.encounterRecovery;
    } catch (error) {
      console.warn('Failed to load encounter recovery service:', error);
    }
  }

  return encryptedNotes.map((note, index) => {
    // Check if encounter is quarantined to prevent repeated attempts
    if (encounterId && encounterRecoveryService) {
      try {
        if (encounterRecoveryService.isQuarantined(encounterId)) {
          return '[QUARANTINED: Encounter marked for recovery]';
        }
      } catch (error) {
        console.warn('Failed to check quarantine status:', error);
      }
    }

    try {
      return decryptPHI(note);
    } catch (error) {
      const now = Date.now();
      // Create reliable cache key using note content hash + index
      const noteHash = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY || 'fallback')
        .update(note)
        .digest('hex')
        .substring(0, 12);
      const cacheKey = `${noteHash}:${index}`;
      const cached = encounterNoteFailureCache.get(cacheKey);
      
      // Rate limit logging for known failed notes (only log once per hour, like patient data)
      const shouldLog = !cached || (now - cached.lastLoggedAt > 3600000); // 1 hour
      
      // Update failure tracking
      const updatedCache = {
        count: (cached?.count || 0) + 1,
        lastLoggedAt: shouldLog ? now : (cached?.lastLoggedAt || 0),
        lastAttempt: now
      };
      encounterNoteFailureCache.set(cacheKey, updatedCache);
      
      // Only log if we haven't logged recently for this note (HIPAA-safe)
      if (shouldLog) {
        console.error(`Error decrypting encounter note [${noteHash}:${index}] (attempt #${updatedCache.count}):`, {
          noteHash,
          index,
          error: error instanceof Error ? error.message : 'Unknown error',
          noteLength: note.length,
          isBase64: /^[A-Za-z0-9+/]*={0,2}$/.test(note)
        });
        
        // Report to health monitor with note hash instead of content
        healthMonitor.reportEncounterNoteFailure();
      }
      
      // Periodically clean cache to prevent memory leaks (keep reasonable size)
      if (encounterNoteFailureCache.size > 200) {
        const entries = Array.from(encounterNoteFailureCache.entries());
        const oldEntries = entries.filter(([_, data]) => now - data.lastAttempt > 7200000); // Remove entries older than 2 hours
        oldEntries.forEach(([key]) => encounterNoteFailureCache.delete(key));
        
        // If still too large, remove oldest entries
        if (encounterNoteFailureCache.size > 150) {
          const remainingEntries = Array.from(encounterNoteFailureCache.entries());
          const toDelete = remainingEntries.slice(0, remainingEntries.length - 100);
          toDelete.forEach(([key]) => encounterNoteFailureCache.delete(key));
        }
      }
      
      // Return placeholder text instead of throwing to allow analysis to continue
      return '[DECRYPTION_ERROR: Note could not be decrypted]';
    }
  });
}

// Helper functions for signature data (CRITICAL: PHI in signatures must be encrypted)
export function encryptSignatureData(signatureData: string): string {
  return encryptPHI(signatureData);
}

export function decryptSignatureData(encryptedSignatureData: string): string {
  return decryptPHI(encryptedSignatureData);
}

// Helper functions for document content (CRITICAL: Document content may contain PHI)
export function encryptDocumentContent(content: string): string {
  return encryptPHI(content);
}

export function decryptDocumentContent(encryptedContent: string): string {
  return decryptPHI(encryptedContent);
}

// Helper for batch document content encryption/decryption
export function encryptDocumentVersion(versionData: { content: string; [key: string]: any }) {
  return {
    ...versionData,
    encryptedContent: encryptDocumentContent(versionData.content),
    // Remove plaintext content
    content: undefined,
  };
}

export function decryptDocumentVersion(version: { encryptedContent?: string; content?: string; [key: string]: any }) {
  if (version.encryptedContent) {
    return {
      ...version,
      content: decryptDocumentContent(version.encryptedContent),
      // Don't expose encrypted content to client
      encryptedContent: undefined,
    };
  }
  return version;
}
