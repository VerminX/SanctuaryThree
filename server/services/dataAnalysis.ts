// Data Analysis Service for Encounter Note Corruption Patterns
// Phase 5 Task 3: Analyze and classify encounter note corruption patterns

export interface CorruptionPattern {
  errorType: 'too_short' | 'authentication_failure';
  noteLength: number;
  isBase64: boolean;
  noteHash: string;
  index: number;
  frequency: number;
}

export interface CorruptionAnalysis {
  totalFailures: number;
  patternsByType: {
    too_short: { count: number; avgLength: number; lengthRange: [number, number] };
    authentication_failure: { count: number; avgLength: number; lengthRange: [number, number] };
  };
  lengthDistribution: { [range: string]: number };
  indexDistribution: { [index: string]: number };
  base64ValidationResults: { valid: number; invalid: number };
  recommendedActions: string[];
}

export class EncounterNoteCorruptionAnalyzer {
  private patterns: CorruptionPattern[] = [];

  /**
   * Add a corruption event from logs for analysis
   */
  addCorruptionEvent(
    errorMessage: string,
    noteLength: number,
    isBase64: boolean,
    noteHash: string,
    index: number
  ): void {
    const errorType: 'too_short' | 'authentication_failure' = 
      errorMessage.includes('too short') ? 'too_short' : 'authentication_failure';

    // Check if we already have this pattern
    const existingPattern = this.patterns.find(p => 
      p.noteHash === noteHash && 
      p.index === index && 
      p.errorType === errorType
    );

    if (existingPattern) {
      existingPattern.frequency++;
    } else {
      this.patterns.push({
        errorType,
        noteLength,
        isBase64,
        noteHash,
        index,
        frequency: 1
      });
    }
  }

  /**
   * Analyze all collected corruption patterns
   */
  analyzePatterns(): CorruptionAnalysis {
    const totalFailures = this.patterns.reduce((sum, p) => sum + p.frequency, 0);
    
    // Separate by error type
    const tooShortPatterns = this.patterns.filter(p => p.errorType === 'too_short');
    const authFailurePatterns = this.patterns.filter(p => p.errorType === 'authentication_failure');

    // Calculate statistics for each type
    const tooShortLengths = tooShortPatterns.map(p => p.noteLength);
    const authFailureLengths = authFailurePatterns.map(p => p.noteLength);

    const patternsByType = {
      too_short: {
        count: tooShortPatterns.length,
        avgLength: tooShortLengths.length > 0 ? Math.round(tooShortLengths.reduce((a, b) => a + b, 0) / tooShortLengths.length) : 0,
        lengthRange: (tooShortLengths.length > 0 ? [Math.min(...tooShortLengths), Math.max(...tooShortLengths)] : [0, 0]) as [number, number]
      },
      authentication_failure: {
        count: authFailurePatterns.length,
        avgLength: authFailureLengths.length > 0 ? Math.round(authFailureLengths.reduce((a, b) => a + b, 0) / authFailureLengths.length) : 0,
        lengthRange: (authFailureLengths.length > 0 ? [Math.min(...authFailureLengths), Math.max(...authFailureLengths)] : [0, 0]) as [number, number]
      }
    };

    // Length distribution analysis
    const lengthDistribution: { [range: string]: number } = {};
    this.patterns.forEach(p => {
      const range = this.getLengthRange(p.noteLength);
      lengthDistribution[range] = (lengthDistribution[range] || 0) + 1;
    });

    // Index distribution analysis
    const indexDistribution: { [index: string]: number } = {};
    this.patterns.forEach(p => {
      indexDistribution[p.index.toString()] = (indexDistribution[p.index.toString()] || 0) + 1;
    });

    // Base64 validation results
    const base64ValidationResults = {
      valid: this.patterns.filter(p => p.isBase64).length,
      invalid: this.patterns.filter(p => !p.isBase64).length
    };

    // Generate recommendations based on analysis
    const recommendedActions = this.generateRecommendations(
      patternsByType,
      lengthDistribution,
      base64ValidationResults
    );

    return {
      totalFailures,
      patternsByType,
      lengthDistribution,
      indexDistribution,
      base64ValidationResults,
      recommendedActions
    };
  }

  /**
   * Classify note length into ranges for analysis
   */
  private getLengthRange(length: number): string {
    if (length < 30) return '0-29';
    if (length < 40) return '30-39';
    if (length < 50) return '40-49';
    if (length < 60) return '50-59';
    return '60+';
  }

  /**
   * Generate actionable recommendations based on analysis
   */
  private generateRecommendations(
    patternsByType: CorruptionAnalysis['patternsByType'],
    lengthDistribution: { [range: string]: number },
    base64Results: { valid: number; invalid: number }
  ): string[] {
    const recommendations: string[] = [];

    // Analysis of error types
    if (patternsByType.too_short.count > patternsByType.authentication_failure.count) {
      recommendations.push(
        "PRIMARY ISSUE: 'Too short' errors dominate, indicating data truncation during storage/retrieval"
      );
      recommendations.push(
        "INVESTIGATE: Database column sizes, API payload limits, or file storage constraints"
      );
    } else {
      recommendations.push(
        "PRIMARY ISSUE: Authentication failures suggest encryption key/AAD mismatches"
      );
      recommendations.push(
        "INVESTIGATE: Encryption key rotation, AAD changes, or algorithm version mismatches"
      );
    }

    // Base64 analysis
    if (base64Results.invalid > base64Results.valid) {
      recommendations.push(
        "CRITICAL: Most encrypted data is not valid Base64, indicating storage corruption"
      );
      recommendations.push(
        "ACTION: Check database encoding, API serialization, and data migration processes"
      );
    }

    // Length pattern analysis
    const avgTooShortLength = patternsByType.too_short.avgLength;
    if (avgTooShortLength > 0 && avgTooShortLength < 44) { // 44 is minimum for IV + TAG
      recommendations.push(
        `DATA CORRUPTION: Average 'too short' length (${avgTooShortLength}) is below minimum encryption overhead (44 bytes)`
      );
      recommendations.push(
        "ACTION: Implement data recovery from backups or re-encryption of source data"
      );
    }

    // Systematic corruption indicators
    recommendations.push(
      "MONITORING: Implement proactive corruption detection in data storage pipeline"
    );
    recommendations.push(
      "RECOVERY: Create data repair utilities for systematic re-encryption"
    );

    return recommendations;
  }

  /**
   * Export analysis results for logging/reporting
   */
  exportAnalysis(): string {
    const analysis = this.analyzePatterns();
    
    return `
=== ENCOUNTER NOTE CORRUPTION ANALYSIS ===
Total Failures: ${analysis.totalFailures}

Error Type Distribution:
- Too Short Errors: ${analysis.patternsByType.too_short.count} (avg length: ${analysis.patternsByType.too_short.avgLength})
- Authentication Failures: ${analysis.patternsByType.authentication_failure.count} (avg length: ${analysis.patternsByType.authentication_failure.avgLength})

Length Distribution:
${Object.entries(analysis.lengthDistribution).map(([range, count]) => `- ${range} chars: ${count} notes`).join('\n')}

Index Distribution:
${Object.entries(analysis.indexDistribution).map(([index, count]) => `- Note ${index}: ${count} failures`).join('\n')}

Base64 Validation:
- Valid Base64: ${analysis.base64ValidationResults.valid}
- Invalid Base64: ${analysis.base64ValidationResults.invalid}

RECOMMENDATIONS:
${analysis.recommendedActions.map(action => `- ${action}`).join('\n')}
    `.trim();
  }
}

// Create global analyzer instance
export const corruptionAnalyzer = new EncounterNoteCorruptionAnalyzer();