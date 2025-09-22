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
      const errorMessage = (error as Error).message || 'Unknown error';
      
      // Handle specific PDF format errors that should return 400 instead of 500
      if (errorMessage.includes('FormatError') || 
          errorMessage.includes('bad XRef entry') ||
          errorMessage.includes('Invalid PDF structure') ||
          errorMessage.includes('PDF is corrupted') ||
          errorMessage.includes('unexpected end of input') ||
          errorMessage.includes('Invalid or corrupted PDF') ||
          errorMessage.includes('PDF header signature not found')) {
        
        // Create a user-friendly validation error for malformed PDFs
        const validationError = new Error('This PDF file appears to be corrupted or in an unsupported format. Please try uploading a different PDF file or ensure the file is not damaged.');
        (validationError as any).isValidationError = true; // Mark as validation error
        throw validationError;
      }
      
      // Handle password-protected PDFs
      if (errorMessage.includes('password') || 
          errorMessage.includes('encrypted') ||
          errorMessage.includes('security')) {
        const validationError = new Error('This PDF file is password-protected or encrypted. Please upload an unlocked PDF file.');
        (validationError as any).isValidationError = true;
        throw validationError;
      }
      
      // Handle unsupported PDF versions or features
      if (errorMessage.includes('unsupported') || 
          errorMessage.includes('not supported') ||
          errorMessage.includes('version')) {
        const validationError = new Error('This PDF file uses features that are not supported. Please try converting it to a standard PDF format.');
        (validationError as any).isValidationError = true;
        throw validationError;
      }
      
      // Generic server error for other cases
      throw new Error('Failed to extract text from PDF: ' + errorMessage);
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