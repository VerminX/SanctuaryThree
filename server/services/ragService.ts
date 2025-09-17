import { storage } from '../storage';
import { PolicySource } from '@shared/schema';

interface RAGContext {
  content: string;
  citations: Array<{
    title: string;
    url: string;
    lcdId: string;
    effectiveDate: string;
    mac: string;
  }>;
}

// Priority-based policy selection algorithm from implementation plan
function calculatePolicyPriority(policy: PolicySource, currentDate: Date): number {
  const daysFromEffective = Math.abs(currentDate.getTime() - policy.effectiveDate.getTime()) / (1000 * 60 * 60 * 24);
  
  // Current policies get highest priority
  if (policy.status === 'current') return 1000 - daysFromEffective;
  
  // Future policies (within 90 days) get medium priority  
  if (policy.status === 'future' && daysFromEffective <= 90) return 500 - daysFromEffective;
  
  // Proposed policies get lower priority but still included
  if (policy.status === 'proposed') return 100 - daysFromEffective;
  
  return 0;
}

export async function buildRAGContext(macRegion: string, woundType: string): Promise<RAGContext> {
  try {
    // Get current and future policies using the new intelligent method
    const policies = await storage.getCurrentAndFuturePoliciesByMAC(macRegion, 90);
    
    if (policies.length === 0) {
      console.warn(`No active policies found for MAC region: ${macRegion}`);
      return {
        content: `No specific LCD policies found for MAC region ${macRegion}. General Medicare coverage principles apply.`,
        citations: []
      };
    }

    // Filter for wound care relevance
    const woundCareRelevantPolicies = policies.filter(policy => 
      policy.content.toLowerCase().includes('skin substitute') ||
      policy.content.toLowerCase().includes('ctp') ||
      policy.content.toLowerCase().includes(woundType.toLowerCase()) ||
      policy.title.toLowerCase().includes('wound') ||
      policy.title.toLowerCase().includes('cellular') ||
      policy.title.toLowerCase().includes('tissue') ||
      policy.title.toLowerCase().includes('ulcer') ||
      policy.title.toLowerCase().includes('diabetic foot') ||
      policy.title.toLowerCase().includes('debridement')
    );

    // Apply priority-based sorting algorithm
    const currentDate = new Date();
    const prioritizedPolicies = woundCareRelevantPolicies
      .map(policy => ({
        policy,
        priority: calculatePolicyPriority(policy, currentDate)
      }))
      .sort((a, b) => b.priority - a.priority) // Sort by priority (highest first)
      .slice(0, 5) // Limit to top 5 most relevant policies
      .map(item => item.policy);

    // Build consolidated content with policy status annotations
    const content = prioritizedPolicies.map(policy => {
      return `
LCD: ${policy.title} (${policy.lcdId})
MAC: ${policy.mac}
Effective Date: ${policy.effectiveDate.toISOString().split('T')[0]}
Status: ${policy.status} ${policy.status === 'future' ? '(Effective in future)' : ''}
Policy Type: ${policy.policyType || 'final'}

Content:
${policy.content}

---`;
    }).join('\n');

    // Build citations (only declared RAGContext fields to prevent type drift)
    const citations = prioritizedPolicies.map(policy => ({
      title: policy.title,
      url: policy.url,
      lcdId: policy.lcdId,
      effectiveDate: policy.effectiveDate.toISOString().split('T')[0],
      mac: policy.mac
    }));

    return {
      content: content || 'No relevant policy content found.',
      citations
    };
  } catch (error) {
    console.error('Error building RAG context:', error);
    return {
      content: 'Error retrieving policy information. Please ensure policies are up to date.',
      citations: []
    };
  }
}

// Legacy stub functions removed - policy data now managed by enhanced CMS fetcher
