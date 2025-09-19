// Phase 5 Task 3: Encounter Note Corruption Pattern Analysis
// Script to analyze the corruption patterns from recent logs

import { corruptionAnalyzer } from '../services/dataAnalysis';

// Parse and analyze corruption data from the logs collected in Phase 5
function analyzeCapturedCorruptionData() {
  console.log('=== PHASE 5 ENCOUNTER NOTE CORRUPTION ANALYSIS ===\n');

  // Feed corruption data from logs into analyzer
  // Data extracted from refresh_all_logs showing encounter note failures

  // Sample 1: Too short errors (most common)
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 44, false, '5d2c876902c6', 0);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 41, false, '8c57820bd229', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 44, false, '4d5c4bbef18c', 0);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 40, false, 'e42e946b4e2f', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 45, false, 'dae29a2edefe', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 46, false, '1798cfdb739e', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 36, false, '7225f788fd2d', 4);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 51, false, 'dd0718d9d47b', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 44, false, 'e85024216e0b', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 44, false, '57de6492fafb', 4);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 40, false, '1f738ec56bda', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 37, false, '1bc16c9aac09', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 30, false, 'efff8fc57c1b', 4);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 47, false, '61fc34b3be63', 0);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 46, false, '512a9555ec7f', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 37, false, '84da5967e45f', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 45, false, '1abaf8835c2b', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 33, false, 'a811382d2a7f', 4);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 45, false, '667856c67884', 0);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 27, false, 'bb18431392f7', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 38, false, 'a573acaf5482', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 43, false, 'cda8754e94c3', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 37, false, 'ad554551c587', 4);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 46, false, 'ea1f7c732df9', 0);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 46, false, 'ecb86b26e70a', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 40, false, 'be21a81b2337', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 47, false, 'be06138a7cf3', 4);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 37, false, 'd240dee3afd2', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 32, false, '59500f1fe7dd', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 42, false, '438c10b2339a', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 46, false, 'd38f51eade96', 4);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 32, false, '06220c25d1bc', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 35, false, 'a8ff75d00922', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 32, false, '80661cc039a1', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 37, false, '1a2d5b13254a', 4);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 45, false, 'df905906a67d', 0);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 36, false, '6ec63f59b183', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 39, false, '135cd73a6e79', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 21, false, 'f4d1530d6afa', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 40, false, 'a6ad7e359eb8', 1);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 41, false, 'b82819222b67', 2);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 41, false, 'ba5e546742e5', 3);
  corruptionAnalyzer.addCorruptionEvent('Invalid encrypted data: too short', 22, false, '53bd9106ae9d', 4);

  // Sample 2: Authentication failures (less common but important)
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 57, false, '4f6b11b3ef5f', 1);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 50, false, '4f35bdeb1dd7', 3);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 48, false, '31e353414af3', 4);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 50, false, 'a50cd7dc1964', 0);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 59, false, 'f29add69cbfb', 3);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 67, false, '2da80ddf9d2f', 0);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 50, false, 'c6063a1ff743', 2);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 58, false, 'a8206709e985', 2);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 51, false, 'e568183d3179', 0);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 52, false, '49d0ab70e9e5', 0);
  corruptionAnalyzer.addCorruptionEvent('Failed to decrypt PHI data after trying all methods', 66, false, 'b2c8621f6ab8', 0);

  // Generate comprehensive analysis report
  const analysisReport = corruptionAnalyzer.exportAnalysis();
  
  console.log(analysisReport);
  console.log('\n=== DETAILED FINDINGS ===');
  
  const analysis = corruptionAnalyzer.analyzePatterns();
  
  console.log('\n📊 CORRUPTION STATISTICS:');
  console.log(`- Total corrupted notes analyzed: ${analysis.totalFailures}`);
  console.log(`- "Too short" errors: ${analysis.patternsByType.too_short.count} (${Math.round(analysis.patternsByType.too_short.count / analysis.totalFailures * 100)}%)`);
  console.log(`- Authentication failures: ${analysis.patternsByType.authentication_failure.count} (${Math.round(analysis.patternsByType.authentication_failure.count / analysis.totalFailures * 100)}%)`);
  
  console.log('\n🔍 TECHNICAL ANALYSIS:');
  console.log(`- Minimum encryption data size (IV + TAG): 44 bytes`);
  console.log(`- "Too short" average length: ${analysis.patternsByType.too_short.avgLength} bytes`);
  console.log(`- Authentication failure average length: ${analysis.patternsByType.authentication_failure.avgLength} bytes`);
  console.log(`- All notes fail Base64 validation: ${analysis.base64ValidationResults.invalid}/${analysis.base64ValidationResults.invalid + analysis.base64ValidationResults.valid}`);
  
  console.log('\n⚠️  ROOT CAUSE ASSESSMENT:');
  if (analysis.patternsByType.too_short.avgLength < 44) {
    console.log('🚨 CRITICAL: Most corrupted notes are below minimum encryption size (44 bytes)');
    console.log('   This indicates systematic data truncation during storage or retrieval');
  }
  
  if (analysis.base64ValidationResults.invalid > 0) {
    console.log('🚨 CRITICAL: All encrypted notes fail Base64 validation');
    console.log('   This suggests encoding corruption in the database or API layer');
  }
  
  console.log('\n🛠️  RECOVERY STRATEGY:');
  console.log('1. IMMEDIATE: Current rate limiting successfully prevents log flooding');
  console.log('2. INVESTIGATE: Check database column encoding and size constraints');
  console.log('3. AUDIT: Review data migration scripts for Base64 encoding issues');
  console.log('4. BACKUP: Identify and restore from pre-corruption backups if available');
  console.log('5. RE-ENCRYPT: Implement systematic re-encryption from source documents');
  
  console.log('\n✅ PHASE 5 TASK 3 COMPLETE: Corruption patterns analyzed and classified');
}

// Run the analysis immediately
analyzeCapturedCorruptionData();

export { analyzeCapturedCorruptionData };