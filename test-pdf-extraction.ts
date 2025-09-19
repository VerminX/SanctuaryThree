import { extractDataFromPdfText } from './server/services/pdfDataExtractor';
import * as fs from 'fs';
import * as pdfParse from 'pdf-parse';

async function testPdfExtraction() {
  console.log('=== TESTING PDF EXTRACTION WITH PATIENT FILE ===\n');
  
  try {
    // Read the PDF file
    const pdfPath = './attached_assets/BLynch MED REC_1758284398804_1758291918437.pdf';
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Extract text from PDF
    console.log('Extracting text from PDF...');
    const pdfData = await pdfParse(pdfBuffer);
    const pdfText = pdfData.text;
    
    console.log('PDF Text length:', pdfText.length, 'characters');
    
    // Look for wound measurements in the text
    console.log('\n=== SEARCHING FOR WOUND MEASUREMENTS IN PDF TEXT ===');
    const searchPatterns = [
      'measuring',
      '1 cm x 1 cm',
      '1×1',
      'Full-thickness',
      'ulceration',
      'wound'
    ];
    
    searchPatterns.forEach(pattern => {
      const index = pdfText.toLowerCase().indexOf(pattern.toLowerCase());
      if (index !== -1) {
        console.log(`Found "${pattern}" at position ${index}`);
        // Show context around the match
        const start = Math.max(0, index - 50);
        const end = Math.min(pdfText.length, index + 100);
        console.log('  Context:', pdfText.substring(start, end).replace(/\n/g, ' '));
      } else {
        console.log(`"${pattern}" not found`);
      }
    });
    
    // Extract structured data
    console.log('\n=== CALLING PDF EXTRACTION SERVICE ===');
    const extractedData = await extractDataFromPdfText(pdfText);
    
    console.log('\n=== EXTRACTION COMPLETE ===');
    console.log('Patient Data:', JSON.stringify(extractedData.patientData, null, 2));
    console.log('\nNumber of encounters:', extractedData.encounterData.length);
    
    // Check wound measurements in each encounter
    extractedData.encounterData.forEach((encounter: any, index: number) => {
      console.log(`\n--- Encounter ${index + 1} ---`);
      console.log('Date:', encounter.encounterDate);
      
      if (encounter.woundDetails) {
        console.log('Wound Details:');
        console.log('  Type:', encounter.woundDetails.type);
        console.log('  Location:', encounter.woundDetails.location);
        
        if (encounter.woundDetails.measurements) {
          console.log('  Measurements:');
          const m = encounter.woundDetails.measurements;
          console.log('    Length:', m.length, '(type:', typeof m.length, ')');
          console.log('    Width:', m.width, '(type:', typeof m.width, ')');
          console.log('    Depth:', m.depth, '(type:', typeof m.depth, ')');
          console.log('    Unit:', m.unit);
          
          // Check if measurements are properly numeric
          if (typeof m.length === 'number' && typeof m.width === 'number') {
            console.log('  ✅ Measurements are properly numeric');
          } else {
            console.log('  ❌ WARNING: Measurements are NOT numeric!');
          }
        } else {
          console.log('  ❌ NO MEASUREMENTS FOUND');
        }
      } else {
        console.log('  ❌ NO WOUND DETAILS FOUND');
      }
      
      // Also check the notes for measurement mentions
      if (encounter.notes && encounter.notes.length > 0) {
        console.log('  Notes contain measurement mentions:', 
          encounter.notes.some((note: string) => 
            note.includes('cm') || note.includes('measuring') || /\d+\s*x\s*\d+/i.test(note)
          )
        );
      }
    });
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

// Run the test
testPdfExtraction();