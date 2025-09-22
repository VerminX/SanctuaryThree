import { storage } from '../storage';
import { PolicySource } from '@shared/schema';

// Configurable scoring weights for easy tuning
const SCORING_WEIGHTS = {
  STATUS: {
    CURRENT: 100,
    FUTURE: 60,
    PROPOSED: 20
  },
  RECENCY: {
    MAX_SCORE: 50,
    MAX_DAYS: 365 // Normalize recency over 1 year
  },
  APPLICABILITY: {
    ICD10_EXACT_MATCH: 100,       // Exact ICD-10 code match
    ICD10_PARTIAL_MATCH: 70,      // ICD-10 prefix match
    WOUND_TYPE_TITLE: 60,
    WOUND_TYPE_CONTENT: 40,
    SYNONYM_MATCH: 35,            // Alternative wound type names
    LOCATION_HINT: 15,
    PATIENT_CHARACTERISTICS: 25,
    LCD_SPECIFIC_TERMS: 30        // Skin substitute, CTP, etc.
  },
  SUPERSEDED_PENALTY: -100
} as const;

// Comprehensive wound type synonym mapping
const WOUND_TYPE_SYNONYMS: Record<string, string[]> = {
  'diabetic_foot_ulcer': [
    'diabetic foot ulcer', 'dfu', 'diabetic wound', 'diabetic foot',
    'neuropathic ulcer', 'wagner', 'diabetic ulceration', 'diabetic lower extremity',
    'diabetic limb', 'diabetes-related ulcer', 'diabetic foot wound'
  ],
  'venous_leg_ulcer': [
    'venous leg ulcer', 'vlu', 'venous stasis ulcer', 'venous insufficiency',
    'venous wound', 'stasis ulcer', 'venous ulceration', 'chronic venous ulcer',
    'varicose ulcer', 'venous hypertension ulcer'
  ],
  'pressure_ulcer': [
    'pressure ulcer', 'pu', 'pressure injury', 'decubitus ulcer', 'bedsore',
    'pressure sore', 'stage 3 pressure', 'stage 4 pressure', 'unstageable pressure'
  ],
  'arterial_ulcer': [
    'arterial ulcer', 'ischemic ulcer', 'arterial insufficiency ulcer',
    'peripheral arterial disease ulcer', 'pad ulcer', 'arterial wound'
  ],
  'chronic_ulcer': [
    'chronic ulcer', 'non-healing wound', 'chronic wound', 'complex wound',
    'recalcitrant wound', 'refractory wound'
  ],
  'leg_ulcer': [
    'leg ulcer', 'lower extremity ulcer', 'lower limb ulcer', 'extremity wound'
  ],
  'full-thickness ulceration': [
    'full thickness wound', 'full thickness ulcer', 'deep wound', 'stage 3',
    'stage 4', 'complex ulceration'
  ]
};

// LCD-specific terms that indicate wound care policies
const LCD_SPECIFIC_TERMS = [
  'skin substitute', 'ctp', 'cellular tissue product', 'cellular and tissue',
  'acellular', 'biologic', 'graft', 'matrix', 'collagen', 'amniotic',
  'wound management', 'wound care', 'wound healing', 'advanced wound',
  'debridement', 'hyperbaric oxygen', 'hbot', 'negative pressure'
];

// ICD-10 to wound type mapping
const ICD10_WOUND_MAPPINGS: Record<string, string> = {
  'E10.6': 'diabetic_foot_ulcer',  // Type 1 diabetes with foot complications
  'E11.6': 'diabetic_foot_ulcer',  // Type 2 diabetes with foot complications
  'E13.6': 'diabetic_foot_ulcer',  // Other diabetes with foot complications
  'L89': 'pressure_ulcer',         // Pressure ulcers
  'L97': 'leg_ulcer',              // Non-pressure lower limb ulcers
  'I83.0': 'venous_leg_ulcer',     // Varicose veins with ulcer
  'I83.2': 'venous_leg_ulcer',     // Varicose veins with ulcer and inflammation
  'I87.0': 'venous_leg_ulcer',     // Post-thrombotic syndrome with ulcer
  'I70.2': 'arterial_ulcer'        // Atherosclerosis of arteries with ulceration
};

interface RAGContext {
  content: string;
  citations: Array<{
    title: string;
    url: string;
    lcdId: string;
    effectiveDate: string;
    mac: string;
  }>;
  selectedPolicyId?: string;
  audit?: {
    considered: number;
    filtersApplied: string[];
    scored: PolicyScore[];
    selectedReason: string;
    fallbackUsed?: string;
  };
}

interface SelectBestPolicyParams {
  macRegion: string;
  woundType: string;
  woundLocation?: string;
  icd10Codes?: string[];  // Primary and secondary ICD-10 codes
  patientCharacteristics?: {
    isDiabetic?: boolean;
    hasVenousDisease?: boolean;
  };
}

interface PolicyScore {
  lcdId: string;
  score: number;
  components: Record<string, number>;
}

interface SelectBestPolicyResult {
  policy: PolicySource | null;
  audit: {
    considered: number;
    filtersApplied: string[];
    scored: PolicyScore[];
    selectedReason: string;
    fallbackUsed?: string;
  };
}

/**
 * Get all relevant search terms for a wound type including synonyms
 */
function getWoundTypeSearchTerms(woundType: string): string[] {
  const terms: Set<string> = new Set();
  
  // Add the wound type itself
  terms.add(woundType.toLowerCase());
  
  // Add synonyms if available
  const normalizedType = woundType.toLowerCase().replace(/[\s-_]/g, '_');
  if (WOUND_TYPE_SYNONYMS[normalizedType]) {
    WOUND_TYPE_SYNONYMS[normalizedType].forEach(synonym => terms.add(synonym.toLowerCase()));
  }
  
  // Check if any synonym group contains this wound type
  Object.entries(WOUND_TYPE_SYNONYMS).forEach(([key, synonyms]) => {
    if (synonyms.some(syn => syn.toLowerCase() === woundType.toLowerCase())) {
      synonyms.forEach(synonym => terms.add(synonym.toLowerCase()));
    }
  });
  
  return Array.from(terms);
}

/**
 * Map ICD-10 codes to wound types
 */
function mapICD10ToWoundTypes(icd10Codes?: string[]): string[] {
  if (!icd10Codes || icd10Codes.length === 0) return [];
  
  const woundTypes: Set<string> = new Set();
  
  icd10Codes.forEach(code => {
    // Try exact match
    if (ICD10_WOUND_MAPPINGS[code]) {
      woundTypes.add(ICD10_WOUND_MAPPINGS[code]);
    }
    
    // Try prefix matches (3 and 4 characters)
    const prefix3 = code.substring(0, 3);
    const prefix4 = code.substring(0, 4);
    
    Object.entries(ICD10_WOUND_MAPPINGS).forEach(([mapCode, woundType]) => {
      if (mapCode === prefix3 || mapCode === prefix4 || 
          code.startsWith(mapCode) || mapCode.startsWith(code.substring(0, 4))) {
        woundTypes.add(woundType);
      }
    });
  });
  
  return Array.from(woundTypes);
}

/**
 * Checks if a policy is relevant for wound care scenarios using comprehensive keyword matching
 */
function isWoundCareRelevant(
  policy: PolicySource, 
  woundType: string, 
  woundLocation?: string,
  icd10Codes?: string[]
): boolean {
  const woundCareKeywords: Set<string> = new Set();
  
  // Add LCD-specific terms
  LCD_SPECIFIC_TERMS.forEach(term => woundCareKeywords.add(term.toLowerCase()));
  
  // Add wound type and its synonyms
  const woundTypeTerms = getWoundTypeSearchTerms(woundType);
  woundTypeTerms.forEach(term => woundCareKeywords.add(term));
  
  // Add wound types derived from ICD-10 codes
  const icd10WoundTypes = mapICD10ToWoundTypes(icd10Codes);
  icd10WoundTypes.forEach(type => {
    getWoundTypeSearchTerms(type).forEach(term => woundCareKeywords.add(term));
  });
  
  // Add basic wound care terms
  ['wound', 'ulcer', 'skin', 'healing'].forEach(term => woundCareKeywords.add(term));
  
  // Add location if provided
  if (woundLocation) {
    woundCareKeywords.add(woundLocation.toLowerCase());
    // Add common location synonyms
    if (woundLocation.toLowerCase().includes('foot')) {
      ['lower extremity', 'plantar', 'heel', 'toe'].forEach(term => woundCareKeywords.add(term));
    }
    if (woundLocation.toLowerCase().includes('leg')) {
      ['lower extremity', 'shin', 'calf', 'ankle'].forEach(term => woundCareKeywords.add(term));
    }
  }

  const titleLower = policy.title.toLowerCase();
  const contentLower = policy.content.toLowerCase();
  
  // Check if any keyword matches
  return Array.from(woundCareKeywords).some(keyword => 
    titleLower.includes(keyword) || contentLower.includes(keyword)
  );
}

/**
 * Filters out superseded policies
 */
function filterSupersededPolicies(policies: PolicySource[]): PolicySource[] {
  return policies.filter(policy => !policy.supersededBy);
}

/**
 * Core intelligence algorithm for selecting the best policy for wound care scenarios.
 * Replaces the top-5 approach with sophisticated scoring and fallback logic.
 */
export async function selectBestPolicy(params: SelectBestPolicyParams): Promise<SelectBestPolicyResult> {
  const { macRegion, woundType, woundLocation, icd10Codes, patientCharacteristics } = params;
  const currentDate = new Date();
  const filtersApplied: string[] = [];
  const scoredPolicies: PolicyScore[] = [];
  
  try {
    // 1. Retrieve policies using storage.getCurrentAndFuturePoliciesByMAC(macRegion, 90)
    const allPolicies = await storage.getCurrentAndFuturePoliciesByMAC(macRegion, 90);
    
    if (allPolicies.length === 0) {
      return {
        policy: null,
        audit: {
          considered: 0,
          filtersApplied: [],
          scored: [],
          selectedReason: `No policies found for MAC region: ${macRegion}`,
          fallbackUsed: 'no_policies_available'
        }
      };
    }

    // 2. Filter for wound care relevance and exclude superseded policies
    filtersApplied.push('wound_care_relevance', 'superseded_exclusion');
    const relevantPolicies = filterSupersededPolicies(
      allPolicies.filter(policy => isWoundCareRelevant(policy, woundType, woundLocation, icd10Codes))
    );

    // 3. Score each policy using weighted scoring system
    for (const policy of relevantPolicies) {
      const components: Record<string, number> = {};
      let totalScore = 0;

      // Status scoring
      if (policy.status === 'current') {
        components.status = SCORING_WEIGHTS.STATUS.CURRENT;
      } else if (policy.status === 'future') {
        const daysUntilEffective = Math.ceil((policy.effectiveDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilEffective <= 90) {
          components.status = SCORING_WEIGHTS.STATUS.FUTURE;
        } else {
          components.status = 0;
        }
      } else if (policy.status === 'proposed') {
        components.status = SCORING_WEIGHTS.STATUS.PROPOSED;
      } else {
        components.status = 0;
      }

      // Recency scoring (higher score for more recent effectiveDate)
      const daysSinceEffective = Math.abs((currentDate.getTime() - policy.effectiveDate.getTime()) / (1000 * 60 * 60 * 24));
      const normalizedRecency = Math.max(0, 1 - (daysSinceEffective / SCORING_WEIGHTS.RECENCY.MAX_DAYS));
      components.recency = normalizedRecency * SCORING_WEIGHTS.RECENCY.MAX_SCORE;

      // Applicability scoring
      components.applicability = 0;
      
      // ICD-10 code matching (highest priority)
      if (icd10Codes && icd10Codes.length > 0) {
        for (const code of icd10Codes) {
          // Exact ICD-10 match in policy
          if (policy.title.includes(code) || policy.content.includes(code)) {
            components.applicability += SCORING_WEIGHTS.APPLICABILITY.ICD10_EXACT_MATCH;
            break;
          }
          // Partial ICD-10 match (first 3-4 characters)
          const prefix = code.substring(0, 4);
          if (policy.title.includes(prefix) || policy.content.includes(prefix)) {
            components.applicability += SCORING_WEIGHTS.APPLICABILITY.ICD10_PARTIAL_MATCH;
            break;
          }
        }
      }
      
      // Wound type and synonym matching
      const woundTypeTerms = getWoundTypeSearchTerms(woundType);
      let foundInTitle = false;
      let foundInContent = false;
      
      for (const term of woundTypeTerms) {
        if (!foundInTitle && policy.title.toLowerCase().includes(term)) {
          components.applicability += term === woundType.toLowerCase() 
            ? SCORING_WEIGHTS.APPLICABILITY.WOUND_TYPE_TITLE
            : SCORING_WEIGHTS.APPLICABILITY.SYNONYM_MATCH;
          foundInTitle = true;
        }
        if (!foundInContent && policy.content.toLowerCase().includes(term)) {
          components.applicability += term === woundType.toLowerCase()
            ? SCORING_WEIGHTS.APPLICABILITY.WOUND_TYPE_CONTENT  
            : SCORING_WEIGHTS.APPLICABILITY.SYNONYM_MATCH * 0.7; // Slightly lower for content synonyms
          foundInContent = true;
        }
        if (foundInTitle && foundInContent) break;
      }
      
      // LCD-specific terms bonus
      const hasLCDTerms = LCD_SPECIFIC_TERMS.some(term => 
        policy.title.toLowerCase().includes(term) || policy.content.toLowerCase().includes(term)
      );
      if (hasLCDTerms) {
        components.applicability += SCORING_WEIGHTS.APPLICABILITY.LCD_SPECIFIC_TERMS;
      }
      
      // Location hint scoring
      if (woundLocation && 
          (policy.title.toLowerCase().includes(woundLocation.toLowerCase()) ||
           policy.content.toLowerCase().includes(woundLocation.toLowerCase()))) {
        components.applicability += SCORING_WEIGHTS.APPLICABILITY.LOCATION_HINT;
      }
      
      // Patient characteristics scoring
      if (patientCharacteristics) {
        if (patientCharacteristics.isDiabetic && 
            (policy.title.toLowerCase().includes('diabetic') || 
             policy.content.toLowerCase().includes('diabetic'))) {
          components.applicability += SCORING_WEIGHTS.APPLICABILITY.PATIENT_CHARACTERISTICS;
        }
        
        if (patientCharacteristics.hasVenousDisease && 
            (policy.title.toLowerCase().includes('venous') || 
             policy.content.toLowerCase().includes('venous'))) {
          components.applicability += SCORING_WEIGHTS.APPLICABILITY.PATIENT_CHARACTERISTICS;
        }
      }

      // Superseded penalty
      components.superseded = policy.supersededBy ? SCORING_WEIGHTS.SUPERSEDED_PENALTY : 0;

      // Calculate total score
      totalScore = components.status + components.recency + components.applicability + components.superseded;

      scoredPolicies.push({
        lcdId: policy.lcdId,
        score: totalScore,
        components
      });
    }

    // Sort by score (highest first), then by effectiveDate (later first), then by lcdId (lexical)
    const sortedScores = scoredPolicies.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      
      const policyA = relevantPolicies.find(p => p.lcdId === a.lcdId)!;
      const policyB = relevantPolicies.find(p => p.lcdId === b.lcdId)!;
      
      if (policyA.effectiveDate.getTime() !== policyB.effectiveDate.getTime()) {
        return policyB.effectiveDate.getTime() - policyA.effectiveDate.getTime();
      }
      
      return a.lcdId.localeCompare(b.lcdId);
    });

    // 4. Select highest scoring policy or implement fallback logic
    let selectedPolicy: PolicySource | null = null;
    let selectedReason = '';
    let fallbackUsed: string | undefined;

    if (sortedScores.length > 0 && sortedScores[0].score > 0) {
      // Best scoring policy found
      selectedPolicy = relevantPolicies.find(p => p.lcdId === sortedScores[0].lcdId)!;
      selectedReason = `Selected highest scoring policy with score ${sortedScores[0].score}`;
    } else {
      // Implement fallback logic
      filtersApplied.push('fallback_logic');
      
      // Try to find any current wound-care policy (with proper filtering)
      const currentWoundCarePolicies = filterSupersededPolicies(
        allPolicies.filter(p => 
          p.status === 'current' && isWoundCareRelevant(p, woundType, woundLocation, icd10Codes)
        )
      );
      
      if (currentWoundCarePolicies.length > 0) {
        // Score current policies and select highest
        const currentScored = currentWoundCarePolicies.map(policy => ({
          policy,
          score: SCORING_WEIGHTS.STATUS.CURRENT + 
                 Math.max(0, 1 - Math.abs((currentDate.getTime() - policy.effectiveDate.getTime()) / (1000 * 60 * 60 * 24)) / SCORING_WEIGHTS.RECENCY.MAX_DAYS) * SCORING_WEIGHTS.RECENCY.MAX_SCORE
        })).sort((a, b) => b.score - a.score);
        
        selectedPolicy = currentScored[0].policy;
        selectedReason = 'Fallback: Selected highest-scoring current wound-care policy';
        fallbackUsed = 'current_wound_care';
      } else {
        // Try nearest future wound-care policy (with proper filtering)
        const futurePolicies = filterSupersededPolicies(
          allPolicies.filter(p => 
            p.status === 'future' && isWoundCareRelevant(p, woundType, woundLocation, icd10Codes)
          )
        );
        if (futurePolicies.length > 0) {
          const nearestFuture = futurePolicies.sort((a, b) => 
            a.effectiveDate.getTime() - b.effectiveDate.getTime()
          )[0];
          
          selectedPolicy = nearestFuture;
          selectedReason = 'Fallback: Selected nearest future wound-care policy';
          fallbackUsed = 'nearest_future';
        } else {
          // Try most recent proposed wound-care policy (with proper filtering)
          const proposedPolicies = filterSupersededPolicies(
            allPolicies.filter(p => 
              p.status === 'proposed' && isWoundCareRelevant(p, woundType, woundLocation, icd10Codes)
            )
          );
          if (proposedPolicies.length > 0) {
            const mostRecentProposed = proposedPolicies.sort((a, b) => 
              b.effectiveDate.getTime() - a.effectiveDate.getTime()
            )[0];
            
            selectedPolicy = mostRecentProposed;
            selectedReason = 'Fallback: Selected most recent proposed wound-care policy';
            fallbackUsed = 'most_recent_proposed';
          } else {
            // Final fallback: Try general wound care without specific wound type
            filtersApplied.push('general_wound_care_fallback');
            const generalWoundCarePolicies = filterSupersededPolicies(
              allPolicies.filter(p => {
                const lowerTitle = p.title.toLowerCase();
                const lowerContent = p.content.toLowerCase();
                // Look for any general wound care terms
                return LCD_SPECIFIC_TERMS.some(term => 
                  lowerTitle.includes(term) || lowerContent.includes(term)
                ) || ['wound', 'ulcer', 'skin'].some(term =>
                  lowerTitle.includes(term) || lowerContent.includes(term)
                );
              })
            );
            
            if (generalWoundCarePolicies.length > 0) {
              // Prioritize current, then future, then proposed
              const currentGeneral = generalWoundCarePolicies.filter(p => p.status === 'current');
              const futureGeneral = generalWoundCarePolicies.filter(p => p.status === 'future');
              const proposedGeneral = generalWoundCarePolicies.filter(p => p.status === 'proposed');
              
              if (currentGeneral.length > 0) {
                selectedPolicy = currentGeneral.sort((a, b) => 
                  b.effectiveDate.getTime() - a.effectiveDate.getTime()
                )[0];
                selectedReason = 'Fallback: Selected general wound care policy (current)';
                fallbackUsed = 'general_wound_care_current';
              } else if (futureGeneral.length > 0) {
                selectedPolicy = futureGeneral.sort((a, b) => 
                  a.effectiveDate.getTime() - b.effectiveDate.getTime()
                )[0];
                selectedReason = 'Fallback: Selected general wound care policy (future)';
                fallbackUsed = 'general_wound_care_future';
              } else if (proposedGeneral.length > 0) {
                selectedPolicy = proposedGeneral.sort((a, b) => 
                  b.effectiveDate.getTime() - a.effectiveDate.getTime()
                )[0];
                selectedReason = 'Fallback: Selected general wound care policy (proposed)';
                fallbackUsed = 'general_wound_care_proposed';
              }
            }
            
            if (!selectedPolicy) {
              selectedReason = 'No applicable policies found even with all fallback strategies';
              fallbackUsed = 'no_policies_available';
            }
          }
        }
      }
    }

    // Log detailed scoring for debugging
    if (scoredPolicies.length > 0) {
      console.log(`Policy scoring for wound type: ${woundType}, ICD-10: ${icd10Codes?.join(', ') || 'none'}`);
      scoredPolicies.slice(0, 3).forEach(scored => {
        const policy = relevantPolicies.find(p => p.lcdId === scored.lcdId);
        if (policy) {
          console.log(`  - ${policy.title}: Score ${scored.score} (components: ${JSON.stringify(scored.components)})`);
        }
      });
    }

    return {
      policy: selectedPolicy,
      audit: {
        considered: allPolicies.length,
        filtersApplied,
        scored: scoredPolicies,
        selectedReason,
        fallbackUsed
      }
    };

  } catch (error) {
    console.error('Error in selectBestPolicy:', error);
    return {
      policy: null,
      audit: {
        considered: 0,
        filtersApplied: [],
        scored: [],
        selectedReason: `Error during policy selection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fallbackUsed: 'error_occurred'
      }
    };
  }
}


export async function buildRAGContext(
  macRegion: string, 
  woundType: string,
  woundLocation?: string,
  patientCharacteristics?: {
    isDiabetic?: boolean;
    hasVenousDisease?: boolean;
  },
  icd10Codes?: string[]  // Add ICD-10 codes parameter
): Promise<RAGContext> {
  try {
    // Use the new intelligent single policy selection algorithm
    const result = await selectBestPolicy({
      macRegion,
      woundType,
      woundLocation,
      icd10Codes,  // Pass ICD-10 codes to policy selection
      patientCharacteristics
    });

    const { policy, audit } = result;

    // Handle the case where no policy was found
    if (!policy) {
      // Use audit trail to build informative content explaining why no policy was found
      const auditInfo = audit.fallbackUsed ? ` (${audit.selectedReason})` : '';
      const icd10Info = icd10Codes && icd10Codes.length > 0 ? ` with ICD-10 codes: ${icd10Codes.join(', ')}` : '';
      const content = `No specific LCD policies found for MAC region ${macRegion} and wound type "${woundType}"${icd10Info}${auditInfo}. ` +
        `General Medicare coverage principles apply: ` +
        `Coverage may be available for medically necessary wound care treatments when they meet Medicare criteria. ` +
        `Providers should refer to general Medicare guidelines and consult with the MAC for specific coverage determinations.`;

      return {
        content,
        citations: [],
        selectedPolicyId: undefined,
        audit
      };
    }

    // Build content for the single selected policy
    const content = `LCD: ${policy.title} (${policy.lcdId})
MAC: ${policy.mac}
Effective Date: ${policy.effectiveDate.toISOString().split('T')[0]}
Status: ${policy.status}${policy.status === 'future' ? ' (Effective in future)' : ''}
Policy Type: ${policy.policyType || 'final'}

Content:
${policy.content}`;

    // Build single citation
    const citations = [{
      title: policy.title,
      url: policy.url,
      lcdId: policy.lcdId,
      effectiveDate: policy.effectiveDate.toISOString().split('T')[0],
      mac: policy.mac
    }];

    return {
      content,
      citations,
      selectedPolicyId: policy.id,
      audit
    };
  } catch (error) {
    console.error('Error building RAG context:', error);
    return {
      content: 'Error retrieving policy information. Please ensure policies are up to date.',
      citations: [],
      selectedPolicyId: undefined,
      audit: {
        considered: 0,
        filtersApplied: [],
        scored: [],
        selectedReason: `Error during RAG context building: ${error instanceof Error ? error.message : 'Unknown error'}`,
        fallbackUsed: 'error_occurred'
      }
    };
  }
}

// Legacy stub functions removed - policy data now managed by enhanced CMS fetcher
