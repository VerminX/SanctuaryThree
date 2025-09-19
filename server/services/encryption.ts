import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Get encryption key from environment (ENCRYPTION_KEY only)
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable must be set for PHI encryption. Do not use SESSION_SECRET for encryption.');
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

export function encryptPHI(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from('PHI-AAD'));
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Combine iv + tag + encrypted data
  const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, 'hex')]);
  return combined.toString('base64');
}

// Cache for failed decryption attempts to avoid repeated processing of corrupted data
const decryptionFailureCache = new Map<string, boolean>();

export function decryptPHI(encryptedData: string): string {
  // PERFORMANCE OPTIMIZATION: Quick cache check for known corrupted data
  if (decryptionFailureCache.has(encryptedData)) {
    throw new Error('Invalid encrypted data: previously failed decryption (cached)');
  }

  const combined = Buffer.from(encryptedData, 'base64');
  
  // Basic validation
  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    decryptionFailureCache.set(encryptedData, true); // Cache this failure
    throw new Error('Invalid encrypted data: too short');
  }
  
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
  
  // Get all possible keys to try (current + legacy methods)
  const keysToTry = getLegacyKeys();
  
  if (keysToTry.length === 0) {
    throw new Error('No encryption keys available. ENCRYPTION_KEY must be set.');
  }
  const aadsToTry = [
    Buffer.from('PHI-AAD'),        // Current standard
    null,                          // No AAD (legacy)
    Buffer.from('woundcare-phi'),  // Alternative AAD
    Buffer.from(''),               // Empty AAD
  ];
  
  let lastError: Error | null = null;
  
  // Try all combinations of keys and AADs
  for (let keyIndex = 0; keyIndex < keysToTry.length; keyIndex++) {
    const key = keysToTry[keyIndex];
    
    for (let aadIndex = 0; aadIndex < aadsToTry.length; aadIndex++) {
      const aad = aadsToTry[aadIndex];
      
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);
        
        if (aad !== null) {
          decipher.setAAD(aad);
        }
        
        let decrypted = decipher.update(encrypted, undefined, 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted; // Success - return immediately
      } catch (error: any) {
        lastError = error;
        // Continue trying other combinations
      }
    }
  }
  
  // All decryption attempts failed - cache this failure for future performance
  decryptionFailureCache.set(encryptedData, true);
  
  // Clean cache periodically to prevent memory leaks (keep only last 1000 failures)
  if (decryptionFailureCache.size > 1000) {
    const entries = Array.from(decryptionFailureCache.keys());
    const toDelete = entries.slice(0, entries.length - 500);
    toDelete.forEach(key => decryptionFailureCache.delete(key));
  }
  
  throw new Error(`Failed to decrypt PHI data after trying all methods. Last error: ${lastError?.message}`);
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
export function safeDecryptPatientData(patient: { id: string; encryptedFirstName: string; encryptedLastName: string; encryptedDob: string | null; [key: string]: any }): { patientData: any; decryptionError: boolean } {
  try {
    const decryptedData = {
      firstName: decryptPHI(patient.encryptedFirstName),
      lastName: decryptPHI(patient.encryptedLastName),  
      dob: patient.encryptedDob ? decryptPHI(patient.encryptedDob) : null,
    };
    
    return {
      patientData: {
        ...patient,
        ...decryptedData,
      },
      decryptionError: false
    };
  } catch (error) {
    console.error(`DECRYPTION FAILURE for patient ${patient.id}:`, {
      patientId: patient.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      hasFirstName: !!patient.encryptedFirstName,
      hasLastName: !!patient.encryptedLastName,
      hasDob: !!patient.encryptedDob
    });
    
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

export function decryptEncounterNotes(encryptedNotes: string[]): string[] {
  return encryptedNotes.map((note, index) => {
    try {
      return decryptPHI(note);
    } catch (error) {
      console.error(`Error decrypting encounter note ${index}:`, error instanceof Error ? error.message : 'Unknown error');
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
