import fs from 'fs';

// Handle pdf-parse import more robustly
async function getPdfParse() {
  try {
    // Try dynamic import first
    const module = await import('pdf-parse');
    return module.default || module;
  } catch (error) {
    console.error('Error importing pdf-parse:', error);
    // Fallback: try require as last resort
    try {
      return require('pdf-parse');
    } catch (requireError) {
      console.error('Error requiring pdf-parse:', requireError);
      throw new Error('Failed to load PDF parsing library');
    }
  }
}

export interface TextExtractionResult {
  text: string;
  numPages: number;
  confidence: number;
}

export class PdfTextExtractor {
  
  static async extractTextFromBuffer(buffer: Buffer): Promise<TextExtractionResult> {
    try {
      const pdfParseLib = await getPdfParse();
      const pdfData = await pdfParseLib(buffer);
      
      // Calculate confidence based on text extraction quality
      const confidence = this.calculateConfidence(pdfData.text, pdfData.numpages);
      
      return {
        text: pdfData.text,
        numPages: pdfData.numpages,
        confidence
      };
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error('Failed to extract text from PDF: ' + (error as Error).message);
    }
  }

  static async extractTextFromFile(filePath: string): Promise<TextExtractionResult> {
    try {
      const buffer = fs.readFileSync(filePath);
      return await this.extractTextFromBuffer(buffer);
    } catch (error) {
      console.error('Error reading PDF file:', error);
      throw new Error('Failed to read PDF file: ' + (error as Error).message);
    }
  }

  private static calculateConfidence(text: string, numPages: number): number {
    if (!text || text.trim().length === 0) {
      return 0;
    }

    // Basic confidence calculation based on:
    // - Text density (characters per page)
    // - Presence of common medical/form words
    // - Overall structure
    
    const textLength = text.trim().length;
    const textDensity = numPages > 0 ? textLength / numPages : 0;
    
    let confidence = 0.5; // Base confidence
    
    // Adjust based on text density
    if (textDensity > 500) confidence += 0.3; // Good density
    else if (textDensity > 200) confidence += 0.2; // Moderate density
    else if (textDensity < 50) confidence -= 0.3; // Very low density
    
    // Check for medical/form keywords
    const medicalKeywords = [
      'patient', 'diagnosis', 'treatment', 'doctor', 'physician',
      'medical', 'history', 'symptoms', 'medication', 'insurance',
      'dob', 'date of birth', 'address', 'phone', 'name',
      'encounter', 'visit', 'appointment', 'wound', 'care'
    ];
    
    const lowerText = text.toLowerCase();
    const keywordCount = medicalKeywords.filter(keyword => 
      lowerText.includes(keyword)
    ).length;
    
    // Boost confidence based on medical keywords
    confidence += (keywordCount / medicalKeywords.length) * 0.2;
    
    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }
}