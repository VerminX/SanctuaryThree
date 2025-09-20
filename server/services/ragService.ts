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
    WOUND_TYPE_TITLE: 60,
    WOUND_TYPE_CONTENT: 40,
    LOCATION_HINT: 15,
    PATIENT_CHARACTERISTICS: 25
  },
  SUPERSEDED_PENALTY: -100
} as const;

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
 * Checks if a policy is relevant for wound care scenarios using comprehensive keyword matching
 */
function isWoundCareRelevant(policy: PolicySource, woundType: string, woundLocation?: string): boolean {
  const woundCareKeywords = [
    'skin substitute', 'ctp', 'cellular tissue product', 'wound', 
    'ulcer', 'diabetic foot', 'diabetic', 'venous', 'debridement',
    'cellular', 'tissue', 'graft', 'matrix', 'collagen',
    woundType.toLowerCase()
  ];
  
  if (woundLocation) {
    woundCareKeywords.push(woundLocation.toLowerCase());
  }

  const titleLower = policy.title.toLowerCase();
  const contentLower = policy.content.toLowerCase();
  
  return woundCareKeywords.some(keyword => 
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
  const { macRegion, woundType, woundLocation, patientCharacteristics } = params;
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
      allPolicies.filter(policy => isWoundCareRelevant(policy, woundType, woundLocation))
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
      
      // Wound type match in title
      if (policy.title.toLowerCase().includes(woundType.toLowerCase())) {
        components.applicability += SCORING_WEIGHTS.APPLICABILITY.WOUND_TYPE_TITLE;
      }
      
      // Wound type match in content
      if (policy.content.toLowerCase().includes(woundType.toLowerCase())) {
        components.applicability += SCORING_WEIGHTS.APPLICABILITY.WOUND_TYPE_CONTENT;
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
          p.status === 'current' && isWoundCareRelevant(p, woundType, woundLocation)
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
            p.status === 'future' && isWoundCareRelevant(p, woundType, woundLocation)
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
              p.status === 'proposed' && isWoundCareRelevant(p, woundType, woundLocation)
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
            selectedReason = 'No applicable policies found even with fallback logic';
            fallbackUsed = 'no_policies_available';
          }
        }
      }
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
  }
): Promise<RAGContext> {
  try {
    // Use the new intelligent single policy selection algorithm
    const result = await selectBestPolicy({
      macRegion,
      woundType,
      woundLocation,
      patientCharacteristics
    });

    const { policy, audit } = result;

    // Handle the case where no policy was found
    if (!policy) {
      // Use audit trail to build informative content explaining why no policy was found
      const auditInfo = audit.fallbackUsed ? ` (${audit.selectedReason})` : '';
      const content = `No specific LCD policies found for MAC region ${macRegion} and wound type "${woundType}"${auditInfo}. ` +
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
      selectedPolicyId: policy.lcdId,
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
