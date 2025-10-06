import { db } from '../server/db';
import { patients } from '../shared/schema';
import { encryptPHI } from '../server/services/encryption';
import { eq } from 'drizzle-orm';

async function encryptExistingPatients() {
  console.log('Starting patient data encryption migration...\n');
  
  try {
    // Fetch all patients
    const allPatients = await db.select().from(patients);
    console.log(`Found ${allPatients.length} patients to process\n`);
    
    let encrypted = 0;
    let alreadyEncrypted = 0;
    let errors = 0;
    
    for (const patient of allPatients) {
      try {
        // Check if data is already encrypted (base64 strings are typically longer)
        // Encrypted data will be base64 and much longer than plain text
        const isFirstNameEncrypted = patient.encryptedFirstName.length > 50;
        const isLastNameEncrypted = patient.encryptedLastName.length > 50;
        const isDobEncrypted = patient.encryptedDob ? patient.encryptedDob.length > 50 : true;
        
        if (isFirstNameEncrypted && isLastNameEncrypted && isDobEncrypted) {
          console.log(`✓ Patient ${patient.mrn} already encrypted, skipping`);
          alreadyEncrypted++;
          continue;
        }
        
        // Encrypt the plain text data
        console.log(`Encrypting patient ${patient.mrn}...`);
        const encryptedFirstName = encryptPHI(patient.encryptedFirstName);
        const encryptedLastName = encryptPHI(patient.encryptedLastName);
        const encryptedDob = patient.encryptedDob ? encryptPHI(patient.encryptedDob) : null;
        
        // Update the database
        await db.update(patients)
          .set({
            encryptedFirstName,
            encryptedLastName,
            encryptedDob,
          })
          .where(eq(patients.id, patient.id));
        
        console.log(`✓ Successfully encrypted patient ${patient.mrn}`);
        encrypted++;
      } catch (error) {
        console.error(`✗ Error encrypting patient ${patient.mrn}:`, error instanceof Error ? error.message : error);
        errors++;
      }
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`Total patients: ${allPatients.length}`);
    console.log(`Newly encrypted: ${encrypted}`);
    console.log(`Already encrypted: ${alreadyEncrypted}`);
    console.log(`Errors: ${errors}`);
    console.log('=========================\n');
    
    if (errors === 0) {
      console.log('✓ Migration completed successfully!');
    } else {
      console.log('⚠ Migration completed with errors. Please review the logs above.');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

encryptExistingPatients();
