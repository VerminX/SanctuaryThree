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

export async function buildRAGContext(macRegion: string, woundType: string): Promise<RAGContext> {
  try {
    // Get active policy sources for the MAC region
    const policies = await storage.getActivePolicySourcesByMAC(macRegion);
    
    if (policies.length === 0) {
      console.warn(`No active policies found for MAC region: ${macRegion}`);
      return {
        content: `No specific LCD policies found for MAC region ${macRegion}. General Medicare coverage principles apply.`,
        citations: []
      };
    }

    // Filter and prioritize policies based on wound type and relevance
    const relevantPolicies = policies
      .filter(policy => 
        policy.content.toLowerCase().includes('skin substitute') ||
        policy.content.toLowerCase().includes('ctp') ||
        policy.content.toLowerCase().includes(woundType.toLowerCase()) ||
        policy.title.toLowerCase().includes('wound')
      )
      .sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())
      .slice(0, 5); // Limit to top 5 most relevant and recent policies

    // Build consolidated content
    const content = relevantPolicies.map(policy => {
      return `
LCD: ${policy.title} (${policy.lcdId})
MAC: ${policy.mac}
Effective Date: ${policy.effectiveDate.toISOString().split('T')[0]}
Status: ${policy.status}

Content:
${policy.content}

---`;
    }).join('\n');

    // Build citations
    const citations = relevantPolicies.map(policy => ({
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

// Policy updater service (would typically run as a scheduled job)
export async function updatePolicyDatabase(): Promise<void> {
  try {
    // This would typically fetch from CMS/MAC websites
    // For now, we'll create sample policy data
    
    const samplePolicies = [
      {
        mac: "Noridian Healthcare Solutions (MAC J-E)",
        lcdId: "L39764",
        title: "Skin Substitutes and Cellular and/or Tissue-Based Products (CTPs) for Treatment of Wounds",
        url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39764",
        effectiveDate: new Date("2024-01-01"),
        status: "active" as const,
        content: `
Coverage Criteria for Non-Analogous Skin Substitutes:

1. Documentation Requirements:
   - Wound duration ≥ 4 weeks with measurements
   - Failed conservative therapy including:
     * Offloading (for DFU)
     * Compression therapy (for VLU)
     * Adequate debridement
     * Moisture balance
     * Infection control
   - Wound measurements showing no improvement

2. Patient Eligibility:
   - Diabetic foot ulcer (DFU) or venous leg ulcer (VLU)
   - Adequate blood supply
   - Controlled infection
   - Patient compliance with treatment plan

3. Application Frequency:
   - Maximum every 2 weeks
   - Documentation of wound response required
   - Reassessment at 4-week intervals

4. Documentation Must Include:
   - Wound etiology and duration
   - Previous treatments and outcomes
   - Current wound measurements (length, width, depth)
   - Photographic documentation
   - Plan of care and expected outcomes
        `
      },
      {
        mac: "CGS Administrators (MAC J-H)",
        lcdId: "L39765",
        title: "Cellular and Tissue-Based Products for Wound Treatment",
        url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39765",
        effectiveDate: new Date("2024-12-15"),
        status: "active" as const,
        content: `
Medical Necessity Criteria:

1. Conservative Care Requirements:
   - Minimum 4 weeks of standard wound care
   - Documented lack of healing progress
   - Appropriate wound bed preparation

2. Wound Characteristics:
   - Chronic wounds ≥ 30 days duration
   - Clean wound bed with minimal exudate
   - Adequate vascular supply
   - Controlled bacterial burden

3. Patient Factors:
   - Optimal glucose control (for diabetic patients)
   - Adequate nutrition
   - Smoking cessation counseling documented
   - Patient education and compliance

4. Provider Requirements:
   - Board-certified physician
   - Wound care experience
   - Proper application technique
   - Follow-up care plan
        `
      }
    ];

    // Insert or update policies
    for (const policyData of samplePolicies) {
      try {
        await storage.createPolicySource(policyData);
        console.log(`Updated policy: ${policyData.lcdId} for ${policyData.mac}`);
      } catch (error) {
        // If policy already exists, update it
        console.log(`Policy ${policyData.lcdId} may already exist, skipping insert`);
      }
    }

    console.log('Policy database update completed');
  } catch (error) {
    console.error('Error updating policy database:', error);
    throw error;
  }
}

// Initialize policy database with sample data
export async function initializePolicyDatabase(): Promise<void> {
  try {
    await updatePolicyDatabase();
  } catch (error) {
    console.error('Failed to initialize policy database:', error);
  }
}
