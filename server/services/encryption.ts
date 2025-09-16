import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Get encryption key from environment or generate a default (should be in production env)
const getEncryptionKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!key) {
    throw new Error('ENCRYPTION_KEY or SESSION_SECRET must be set for PHI encryption');
  }
  
  // Derive a consistent key from the provided secret
  return crypto.scryptSync(key, 'woundcare-phi-salt', KEY_LENGTH);
};

export function encryptPHI(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipher(ALGORITHM, key);
  cipher.setAAD(Buffer.from('PHI-AAD'));
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Combine iv + tag + encrypted data
  const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, 'hex')]);
  return combined.toString('base64');
}

export function decryptPHI(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');
  
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
  
  const decipher = crypto.createDecipher(ALGORITHM, key);
  decipher.setAuthTag(tag);
  decipher.setAAD(Buffer.from('PHI-AAD'));
  
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
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

// Helper for encounter notes
export function encryptEncounterNotes(notes: string[]): string[] {
  return notes.map(note => encryptPHI(note));
}

export function decryptEncounterNotes(encryptedNotes: string[]): string[] {
  return encryptedNotes.map(note => decryptPHI(note));
}
