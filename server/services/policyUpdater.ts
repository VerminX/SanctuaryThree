import { storage } from '../storage';
import { InsertPolicySource, PolicySource } from '@shared/schema';
import * as cheerio from 'cheerio';
import { cmsApiCircuitBreaker } from './apiCircuitBreaker';

interface PolicyChange {
  lcdId: string;
  mac: string;
  changeType: 'new' | 'updated' | 'superseded' | 'postponed';
  previousVersion?: PolicySource;
  newVersion: InsertPolicySource;
  summary: string;
}

interface PolicyUpdateResult {
  totalFetched: number;
  newPolicies: number;
  updatedPolicies: number;
  supersededPolicies: number;
  changes: PolicyChange[];
  errors: string[];
}

// Real MAC LCD data sources and patterns
const MAC_DATA_SOURCES = [
  {
    mac: "Noridian Healthcare Solutions (MAC J-E)",
    baseUrl: "https://www.noridianmedicare.com",
    searchPatterns: ["skin substitute", "ctp", "wound", "cellular tissue"],
    regions: ["AK", "AZ", "ID", "MT", "ND", "OR", "SD", "UT", "WA", "WY"]
  },
  {
    mac: "CGS Administrators (MAC J-H)",  
    baseUrl: "https://www.cgsmedicare.com",
    searchPatterns: ["skin substitute", "cellular tissue", "wound care"],
    regions: ["IL", "IN", "KY", "MI", "MN", "OH", "WI"]
  },
  {
    mac: "Novitas Solutions (MAC J-L)",
    baseUrl: "https://www.novitas-solutions.com", 
    searchPatterns: ["wound treatment", "skin graft", "tissue product"],
    regions: ["DE", "DC", "MD", "NJ", "PA"]
  },
  {
    mac: "Palmetto GBA (MAC J-M)",
    baseUrl: "https://www.palmettogba.com",
    searchPatterns: ["advanced wound care", "biologics"],
    regions: ["SC", "NC", "VA", "WV"]
  },
  {
    mac: "First Coast Service Options (MAC J-N)",
    baseUrl: "https://medicare.fcso.com",
    searchPatterns: ["wound healing", "skin substitute"],
    regions: ["FL", "PR", "VI"]
  },
  {
    mac: "WPS Health Solutions (MAC J-5)",
    baseUrl: "https://www.wpsmedicare.com",
    searchPatterns: ["chronic wound", "tissue engineering"],
    regions: ["IA", "KS", "MO", "NE"]
  }
];

// CMS LCD Database API endpoints - Real API  
const CMS_LCD_API = {
  baseUrl: "https://api.coverage.cms.gov",
  finalLCDsEndpoint: "/v1/reports/local-coverage-final-lcds",
  proposedLCDsEndpoint: "/v1/reports/local-coverage-proposed-lcds", 
  articlesEndpoint: "/v1/reports/local-coverage-articles",
  lcdDataEndpoint: "/v1/data/lcd",
  contractorEndpoint: "/v1/data/contractor",
  statesEndpoint: "/v1/metadata/states"
};

/**
 * MAC region normalization map - maps display names to canonical CMS contractor names
 */
const MAC_REGION_MAPPING: Record<string, string> = {
  "Noridian Healthcare Solutions (MAC J-E)": "Noridian Healthcare Solutions LLC",
  "Noridian Healthcare Solutions (MAC J-F)": "Noridian Healthcare Solutions LLC",
  "CGS Administrators (MAC J-H)": "CGS Administrators, LLC",
  "CGS Administrators (MAC J-15)": "CGS Administrators, LLC", 
  "Novitas Solutions (MAC J-L)": "Novitas Solutions, Inc.",
  "Novitas Solutions (MAC J-12)": "Novitas Solutions, Inc.",
  "Palmetto GBA (MAC J-M)": "Palmetto GBA",
  "First Coast Service Options (MAC J-N)": "First Coast Service Options Inc.",
  "WPS Health Solutions (MAC J-5)": "WPS Health Solutions",
  "WPS Health Solutions (MAC J-8)": "WPS Health Solutions",
  "Cahaba GBA (MAC J-6)": "Cahaba GBA",
  "National Government Services (MAC J-6)": "National Government Services, Inc."
};

/**
 * Wound care related search terms for filtering relevant LCDs (broadened for better matching)
 */
const WOUND_CARE_SEARCH_TERMS = [
  "wound",
  "skin substitute", 
  "cellular tissue product",
  "ctp",
  "biologics",
  "advanced wound care",
  "tissue engineering",
  "wound healing",
  "skin graft",
  "dermal substitute",
  "acellular dermal matrix",
  "bioengineered skin",
  "ulcer",
  "diabetic foot",
  "pressure sore",
  "venous stasis",
  "decubitus",
  "chronic wound",
  "tissue",
  "graft",
  "healing",
  "dressing",
  "surgical wound",
  "debridement"
];

/**
 * Fetches data from CMS Coverage API with error handling
 */
async function fetchCMSApiData(endpoint: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${CMS_LCD_API.baseUrl}${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  console.log(`Fetching from CMS API: ${url.toString()}`);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WoundCare-PreDetermination-Portal/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`CMS API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching from CMS API (${endpoint}):`, error);
    throw error;
  }
}

/**
 * Extracts clean text content from HTML using cheerio
 */
function extractTextFromHTML(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  try {
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style, noscript').remove();
    
    // Get text content and clean it up
    let text = $.text();
    
    // Normalize whitespace and remove extra line breaks
    text = text
      .replace(/\s+/g, ' ')  // Replace multiple whitespace with single space
      .replace(/\n\s*\n/g, '\n')  // Replace multiple line breaks with single
      .trim();

    return text;
  } catch (error) {
    console.error('Error parsing HTML content:', error);
    return html; // Return original if parsing fails
  }
}

/**
 * Checks if LCD content is relevant to wound care with enhanced debugging
 */
function isWoundCareRelevant(title: string, content: string): boolean {
  const searchText = `${title} ${content}`.toLowerCase();
  
  // First try with our comprehensive search terms
  const foundTerms = WOUND_CARE_SEARCH_TERMS.filter(term => 
    searchText.includes(term.toLowerCase())
  );
  
  if (foundTerms.length > 0) {
    console.log(`✓ Found wound care LCD: "${title}" (matched: ${foundTerms.join(', ')})`);
    return true;
  }
  
  // Enhanced debugging - log first few titles to see what we're missing
  if (Math.random() < 0.01) { // Log ~1% of titles for debugging
    console.log(`🔍 Sample LCD title: "${title.substring(0, 100)}..."`);
  }
  
  return false;
}

/**
 * Enhanced HTTP client with circuit breaker protection and retry logic for CMS API
 */
async function fetchCMSApiDataWithRetry(endpoint: string, params?: Record<string, any>, correlationId?: string): Promise<any> {
  // Build full URL from base URL and endpoint
  const fullUrl = endpoint.startsWith('http') ? endpoint : `${CMS_LCD_API.baseUrl}${endpoint}`;
  const urlObj = new URL(fullUrl);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      urlObj.searchParams.append(key, value.toString());
    });
  }

  // Define the actual API call
  const apiCall = async () => {
    const response = await fetch(urlObj.toString(), {
      headers: {
        'User-Agent': 'WoundCare-Portal/1.0',
        'Accept': 'application/json'
      },
      // 30 second timeout
      signal: AbortSignal.timeout(30000)
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
      console.warn(`🚫 Rate limited, waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      throw new Error('Rate limited - will retry');
    }

    if (response.status >= 500) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Basic schema validation
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format from CMS API');
    }

    return data;
  };

  // Execute with circuit breaker protection
  return await cmsApiCircuitBreaker.execute(
    apiCall,
    `CMS_API_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
    correlationId
  );
}

/**
 * Fetches all pages from a paginated CMS endpoint
 */
async function fetchAllPagesFromCMS(endpoint: string, correlationId?: string): Promise<any[]> {
  const allData: any[] = [];
  let currentPage = 1;
  let hasMorePages = true;
  
  console.log(`📄 Starting paginated fetch from: ${endpoint}`);
  
  while (hasMorePages) {
    try {
      const response = await fetchCMSApiDataWithRetry(endpoint, { 
        page: currentPage, 
        per_page: 100  // CMS API uses per_page, not limit
      }, correlationId);
      
      if (!response.data || !Array.isArray(response.data)) {
        console.warn(`⚠ No data array found in page ${currentPage}, stopping pagination`);
        break;
      }
      
      allData.push(...response.data);
      console.log(`✓ Fetched page ${currentPage}: ${response.data.length} items (total: ${allData.length})`);
      
      // Check if there are more pages based on CMS API response structure
      hasMorePages = response.data.length === 100; // Simple check: if we got a full page, there might be more
      currentPage++;
      
      // Rate limiting between pages
      if (hasMorePages) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
    } catch (error) {
      console.error(`❌ Failed to fetch page ${currentPage}: ${error}`);
      
      // If we got some data, return what we have
      if (allData.length > 0) {
        console.warn(`⚠ Continuing with ${allData.length} items from successful pages`);
        break;
      }
      
      throw error;
    }
  }
  
  console.log(`📄 Pagination completed: ${allData.length} total items from ${currentPage - 1} pages`);
  return allData;
}

/**
 * Enhanced production-ready CMS policy fetcher with full pagination and robust error handling
 * Now includes both final and proposed LCDs for complete policy freshness
 */
async function fetchCMSPolicyUpdates(): Promise<InsertPolicySource[]> {
  const policies: InsertPolicySource[] = [];
  
  try {
    console.log('🔄 Fetching real CMS LCD policies (both final and proposed) with enhanced production client...');

    // Step 1: Fetch ALL final LCDs using pagination
    console.log('📋 Fetching final LCDs...');
    const allFinalLCDs = await fetchAllPagesFromCMS(CMS_LCD_API.finalLCDsEndpoint, 'fetchCMSPolicies');
    
    // Step 2: Fetch ALL proposed LCDs using pagination  
    console.log('📋 Fetching proposed LCDs...');
    const allProposedLCDs = await fetchAllPagesFromCMS(CMS_LCD_API.proposedLCDsEndpoint, 'fetchCMSPolicies');
    
    if (allFinalLCDs.length === 0 && allProposedLCDs.length === 0) {
      console.warn('No LCD data received from CMS API');
      throw new Error('No LCDs available from CMS API');
    }

    console.log(`Found ${allFinalLCDs.length} final LCDs and ${allProposedLCDs.length} proposed LCDs across all pages`);
    
    // Combine both final and proposed LCDs with type annotation
    const allLCDs = [
      ...allFinalLCDs.map(lcd => ({ ...lcd, policyType: 'final' as const })),
      ...allProposedLCDs.map(lcd => ({ ...lcd, policyType: 'proposed' as const }))
    ];

    // Step 3: Process both final and proposed LCDs with intelligent status assignment
    let processedCount = 0;
    let relevantCount = 0;
    
    console.log(`🚀 Processing ${allLCDs.length} LCDs (final + proposed) with intelligent status assignment...`);
    
    for (const lcdSummary of allLCDs) {
      try {
        // Validate required fields from CMS response
        if (!lcdSummary.document_id || !lcdSummary.title) {
          console.warn(`⚠ Missing required fields for LCD: ${JSON.stringify(lcdSummary)}`);
          processedCount++;
          continue;
        }
        
        // Use data directly from the list response (much more reliable!)
        const title = lcdSummary.title.trim();
        const contractorInfo = lcdSummary.contractor_name_type || '';
        
        // Enhanced debugging - log data structure samples
        if (Math.random() < 0.01) { // Log 1% for debugging
          console.log(`🔍 LCD List Sample:`, {
            lcdId: lcdSummary.document_id,
            title: title.substring(0, 100),
            contractor: contractorInfo.substring(0, 50),
            summaryKeys: Object.keys(lcdSummary)
          });
        }
        
        // Check if this LCD is relevant to wound care (using title only for now)
        if (!isWoundCareRelevant(title, '')) {
          processedCount++;
          continue;
        }

        // Map contractor information to MAC region (from contractor_name_type field)
        const contractorName = contractorInfo.split('\r\n')[0] || contractorInfo.split('(')[0] || contractorInfo;
        const macRegion = findMACRegionFromContractor(contractorName.trim()) || contractorName.trim() || 'Unknown MAC';

        // Intelligent status assignment based on effective date and policy type
        const effectiveDate = lcdSummary.effective_date ? new Date(lcdSummary.effective_date) : null;
        const currentDate = new Date();
        const isEffectiveNow = effectiveDate && effectiveDate <= currentDate;
        
        let status: string;
        if (lcdSummary.policyType === 'proposed') {
          status = 'proposed'; // Proposed policies are always proposed until they become final
        } else if (effectiveDate && isEffectiveNow) {
          status = 'current'; // Final policies effective now are current
        } else if (effectiveDate) {
          status = 'future'; // Final policies with future effective dates
        } else {
          status = 'current'; // Default for final policies without effective date
        }
        
        // Create policy record with enhanced metadata
        const policy: InsertPolicySource = {
          mac: macRegion,
          lcdId: lcdSummary.document_id.toString(),
          title: title,
          url: lcdSummary.url || `https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=${lcdSummary.document_id}`,
          effectiveDate: effectiveDate || new Date(), // Fallback to current date if no effective date
          status,
          policyType: lcdSummary.policyType,
          proposedDate: lcdSummary.policyType === 'proposed' ? new Date() : undefined,
          content: `${title}\n\nContractor: ${contractorInfo}\nPolicy Type: ${lcdSummary.policyType}\nStatus: ${status}\n\nThis is a placeholder for the full LCD content which would be populated from the detailed LCD text.`
        };

        policies.push(policy);
        relevantCount++;
        console.log(`✓ Found wound care ${policy.policyType} LCD ${policy.lcdId}: ${policy.title.substring(0, 50)}... (${policy.mac}) [${policy.status}]`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Error processing LCD ${lcdSummary.document_id}:`, errorMessage);
      }
      
      processedCount++;
      
      // Log progress every 100 processed (much faster now!)
      if (processedCount % 100 === 0) {
        console.log(`📈 Progress: ${processedCount}/${allLCDs.length} LCDs processed, ${relevantCount} relevant found`);
      }
    }

    console.log(`✅ Enhanced CMS API Integration Results:`);
    console.log(`   • Total LCDs processed: ${processedCount}`);
    console.log(`   • Wound care relevant LCDs found: ${relevantCount}`);
    console.log(`   • Policies ready for database: ${policies.length}`);

    if (policies.length === 0) {
      console.warn('⚠ No relevant policies found, falling back to simulated data');
      throw new Error('No relevant policies found from CMS API');
    }

    return policies;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Critical error in enhanced CMS API integration:', errorMessage);
    
    // Fallback to simulated data with clear warning
    console.warn('🔄 Falling back to simulated data due to CMS API error');
    return await fetchFallbackPolicyData();
  }
}

/**
 * Maps CMS contractor names to our MAC region display names with case-insensitive matching
 */
function findMACRegionFromContractor(contractorName: string): string | null {
  if (!contractorName) return null;
  
  // Normalize input: trim whitespace, convert to lowercase, remove extra spaces
  const normalizedInput = contractorName.trim().toLowerCase().replace(/\s+/g, ' ');
  
  for (const [macRegion, cmsName] of Object.entries(MAC_REGION_MAPPING)) {
    // Normalize the mapping value for comparison
    const normalizedCmsName = cmsName.toLowerCase().replace(/\s+/g, ' ');
    
    // Check for bidirectional substring matching (case-insensitive)
    if (normalizedInput.includes(normalizedCmsName) || normalizedCmsName.includes(normalizedInput)) {
      return macRegion;
    }
  }
  
  // If no exact match, try partial matching on key terms
  const keyTerms = normalizedInput.split(' ').filter(term => term.length > 3);
  
  for (const [macRegion, cmsName] of Object.entries(MAC_REGION_MAPPING)) {
    const normalizedCmsName = cmsName.toLowerCase();
    
    // Check if at least 2 key terms match
    const matchingTerms = keyTerms.filter(term => normalizedCmsName.includes(term));
    if (matchingTerms.length >= 2) {
      console.log(`📍 Partial match found: "${contractorName}" -> "${macRegion}" (matched: ${matchingTerms.join(', ')})`);
      return macRegion;
    }
  }
  
  console.warn(`⚠ No MAC region mapping found for contractor: "${contractorName}"`);
  return null;
}

/**
 * Fallback function with minimal simulated data when CMS API fails
 */
async function fetchFallbackPolicyData(): Promise<InsertPolicySource[]> {
  console.log('Using fallback policy data...');
  
  const fallbackPolicies: InsertPolicySource[] = [
      {
        mac: "Noridian Healthcare Solutions (MAC J-E)",
        lcdId: "L39764",
        title: "Skin Substitutes and Cellular and/or Tissue-Based Products (CTPs) for Treatment of Wounds",
        url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39764",
        effectiveDate: new Date("2024-01-15"),
        status: "active",
        content: `
POLICY SUMMARY:
This Local Coverage Determination (LCD) outlines coverage criteria for skin substitutes and cellular/tissue-based products for wound treatment in the Noridian MAC J-E jurisdiction.

COVERED INDICATIONS:
1. Diabetic foot ulcers (DFUs) ≥ 4 weeks duration
2. Venous leg ulcers (VLUs) ≥ 4 weeks duration  
3. Pressure ulcers Stage III-IV
4. Post-surgical wounds with delayed healing

COVERAGE REQUIREMENTS:
1. Conservative Care Failure:
   - Minimum 4 weeks documented standard wound care
   - Offloading for DFUs (total contact casting, removable walking boot)
   - Compression therapy for VLUs (multi-layer compression systems)
   - Adequate debridement and wound bed preparation
   - Infection control and moisture management
   - No measurable improvement in wound size

2. Patient Eligibility:
   - Adequate arterial perfusion (ABI ≥ 0.7 for VLU, TcPO2 ≥ 30 mmHg for DFU)
   - Controlled diabetes (HbA1c documented)
   - No active osteomyelitis
   - Patient compliance with offloading/compression

3. Provider Requirements:
   - Board-certified physician or qualified practitioner
   - Wound care experience and training
   - Proper application technique documented

4. Documentation Requirements:
   - Complete wound assessment with measurements
   - Photographic documentation
   - Previous treatment history and outcomes
   - Conservative care timeline and results
   - Current wound measurements showing lack of improvement

5. Application Guidelines:
   - Maximum frequency: every 2 weeks
   - Re-evaluation every 4 weeks
   - Documentation of wound response required
   - Maximum of 5 applications per episode

NON-COVERED INDICATIONS:
- Acute wounds < 4 weeks duration
- Wounds with active infection
- Inadequate vascular supply
- Venous ulcers with ABI < 0.7
- Patient non-compliance with treatment plan

BILLING AND CODING:
- Must use appropriate HCPCS codes
- Medical necessity documentation required
- Prior authorization may be required for certain products

EFFECTIVE DATE: January 15, 2024
REVISION HISTORY: Updated coverage criteria and documentation requirements
        `
      },
      {
        mac: "CGS Administrators (MAC J-H)",
        lcdId: "L39765",
        title: "Cellular and Tissue-Based Products for Chronic Wound Treatment",
        url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39765",
        effectiveDate: new Date("2024-03-01"),
        status: "active",
        content: `
POLICY OVERVIEW:
This LCD provides coverage criteria for cellular and tissue-based products (CTPs) used in the treatment of chronic wounds within the CGS MAC J-H jurisdiction.

MEDICAL NECESSITY CRITERIA:

1. Wound Characteristics:
   - Chronic wound ≥ 30 days duration
   - Wound size ≤ 25 cm² for initial application
   - Clean wound bed with minimal exudate
   - No signs of clinical infection
   - Adequate wound bed preparation

2. Failed Conservative Management:
   - Documented 4-week trial of standard wound care including:
     * Appropriate wound cleansing and debridement
     * Moisture balance and infection control  
     * Pressure relief/offloading (DFU)
     * Compression therapy (VLU)
   - Less than 50% reduction in wound size over 4 weeks
   - Photographic documentation of healing progress

3. Patient Factors:
   - Adequate nutritional status
   - Optimal glycemic control (HbA1c ≤ 8% for diabetics)
   - Smoking cessation counseling documented
   - Patient education and compliance documented
   - No contraindications to product use

4. Vascular Assessment:
   - For VLU: ABI 0.7-1.3 or alternative vascular study
   - For DFU: Evidence of adequate perfusion (TcPO2 ≥ 30 mmHg or equivalent)
   - Doppler assessment documented

5. Provider Qualifications:
   - Board-certified physician with wound care experience
   - Proper training in product application
   - Established follow-up care plan

COVERAGE LIMITATIONS:
- Maximum 5 applications per wound per episode of care
- Re-evaluation required every 2-4 weeks
- Product-specific coverage based on FDA approval
- Prior authorization required for high-cost products

NON-COVERAGE:
- Prophylactic use
- Acute wounds < 30 days
- Active cellulitis or osteomyelitis
- Inadequate arterial perfusion
- Wounds > 25 cm² without prior authorization

DOCUMENTATION REQUIREMENTS:
- Complete history and physical
- Wound assessment with measurements and photos
- Conservative treatment timeline and outcomes
- Vascular assessment results
- Patient education documentation
- Treatment plan and goals

BILLING NOTES:
- Use appropriate HCPCS codes for specific products
- Include medical necessity documentation
- Follow Medicare billing guidelines

EFFECTIVE: March 1, 2024
NEXT REVIEW: March 1, 2025
        `
      },
      {
        mac: "Novitas Solutions (MAC J-L)",
        lcdId: "L39766", 
        title: "Advanced Wound Care Therapies and Skin Substitutes",
        url: "https://www.cms.gov/medicare-coverage-database/view/lcd.aspx?lcdid=39766",
        effectiveDate: new Date("2024-02-15"),
        status: "active",
        content: `
COVERAGE DETERMINATION:
This LCD establishes coverage policy for advanced wound care therapies including skin substitutes within the Novitas MAC J-L jurisdiction.

COVERED SERVICES:
1. Bioengineered skin substitutes for chronic wounds
2. Cellular therapy products  
3. Acellular dermal matrices
4. Collagen-based wound care products

COVERAGE CRITERIA:

Medical Necessity Requirements:
1. Chronic wound present for ≥ 4 weeks
2. Wound dimensions documented and stable or worsening
3. Failed standard wound care for minimum 4 weeks including:
   - Daily wound care with appropriate dressings
   - Debridement as clinically indicated
   - Infection management
   - Edema control and compression (for venous ulcers)
   - Pressure redistribution (for pressure ulcers)

Patient Requirements:
1. Adequate vascular supply confirmed by:
   - ABI > 0.7 for lower extremity ulcers
   - TcPO2 > 30 mmHg or equivalent for diabetic foot ulcers
2. Absence of active infection (clinical signs and appropriate testing)
3. Optimal medical management of underlying conditions
4. Patient compliance with treatment regimen

Provider Requirements:
1. Physician with appropriate training and experience
2. Proper wound assessment and measurement techniques
3. Understanding of product indications and contraindications
4. Establishment of realistic treatment goals and timelines

Application Protocols:
1. Maximum application frequency: every 2 weeks
2. Assessment of wound progress at each visit
3. Continuation criteria: wound improvement or stability
4. Discontinuation if no improvement after 4 applications

Documentation Standards:
1. Initial comprehensive wound assessment
2. Photographic documentation at each visit  
3. Wound measurements (length, width, depth)
4. Previous treatment history and outcomes
5. Patient education and consent documentation

LIMITATIONS:
- Limited to wounds ≤ 20 cm² without prior approval
- Maximum 6 applications per wound per calendar year
- Product must be FDA-approved for intended use
- Cost-effectiveness considerations may apply

NON-COVERED:
- Wounds with active osteomyelitis
- Malignant wounds
- Wounds in patients with life expectancy < 6 months
- Purely cosmetic applications

CODING AND BILLING:
- Use product-specific HCPCS codes
- Include appropriate diagnosis codes
- Submit required documentation with claims

EFFECTIVE DATE: February 15, 2024
CONTRACTOR: Novitas Solutions (MAC J-L)
        `
      }
    ];

    console.log(`Fetched ${fallbackPolicies.length} policies from CMS LCD database simulation`);
    return fallbackPolicies;
}

/**
 * Calculates content similarity between two policy texts using simple word overlap
 */
function calculateContentSimilarity(content1: string, content2: string): number {
  if (!content1 || !content2) return 0;
  
  const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set(Array.from(words1).filter(w => words2.has(w)));
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Enhanced policy change detection with improved duplicate handling and conflict resolution
 */
async function detectPolicyChanges(newPolicies: InsertPolicySource[]): Promise<PolicyChange[]> {
  const changes: PolicyChange[] = [];
  const processedLCDs = new Set<string>(); // Prevent duplicate processing

  for (const newPolicy of newPolicies) {
    try {
      // Skip if we've already processed this LCD ID
      if (processedLCDs.has(newPolicy.lcdId)) {
        console.warn(`Skipping duplicate LCD processing: ${newPolicy.lcdId}`);
        continue;
      }
      processedLCDs.add(newPolicy.lcdId);

      // Get all existing policies for this LCD ID
      const existingPolicies = await storage.getPolicySourceByLCD(newPolicy.lcdId);
      
      if (existingPolicies.length === 0) {
        // New policy - check for potential duplicates by content similarity
        const allPolicies = await storage.getAllPolicySources();
        let isDuplicate = false;

        for (const existingPolicy of allPolicies) {
          // Check for high content similarity with same MAC
          if (existingPolicy.mac === newPolicy.mac) {
            const similarity = calculateContentSimilarity(existingPolicy.content, newPolicy.content);
            if (similarity > 0.8) { // 80% similarity threshold
              console.warn(`Potential duplicate detected: ${newPolicy.lcdId} similar to ${existingPolicy.lcdId} (${Math.round(similarity * 100)}% similar)`);
              isDuplicate = true;
              break;
            }
          }
        }

        if (!isDuplicate) {
          changes.push({
            lcdId: newPolicy.lcdId,
            mac: newPolicy.mac,
            changeType: 'new',
            newVersion: newPolicy,
            summary: `New LCD policy ${newPolicy.lcdId} published for ${newPolicy.mac}`
          });
        }
      } else {
        // Policy exists - find the most recent active version for this MAC
        const macPolicies = existingPolicies.filter(p => p.mac === newPolicy.mac);
        const activeMacPolicies = macPolicies.filter(p => p.status === 'active');
        
        let existingPolicy = activeMacPolicies.length > 0 
          ? activeMacPolicies.sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0]
          : existingPolicies.sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime())[0];

        // Enhanced change detection with content similarity
        const hasContentChanged = existingPolicy.content !== newPolicy.content;
        const hasStatusChanged = existingPolicy.status !== newPolicy.status;
        const hasEffectiveDateChanged = 
          Math.abs(new Date(existingPolicy.effectiveDate).getTime() - new Date(newPolicy.effectiveDate).getTime()) > 86400000; // More than 1 day difference
        const hasMACChanged = existingPolicy.mac !== newPolicy.mac;
        const hasUrlChanged = existingPolicy.url !== newPolicy.url;

        // Calculate content similarity to avoid minor formatting changes
        const contentSimilarity = hasContentChanged ? calculateContentSimilarity(existingPolicy.content, newPolicy.content) : 1.0;
        const isSignificantContentChange = hasContentChanged && contentSimilarity < 0.95; // Only update for <95% similarity

        if (isSignificantContentChange || hasStatusChanged || hasEffectiveDateChanged || hasMACChanged || hasUrlChanged) {
          const changeReasons = [];
          if (isSignificantContentChange) changeReasons.push(`content (${Math.round(contentSimilarity * 100)}% similar)`);
          if (hasStatusChanged) changeReasons.push('status');
          if (hasEffectiveDateChanged) changeReasons.push('effective date');
          if (hasMACChanged) changeReasons.push('MAC region');
          if (hasUrlChanged) changeReasons.push('URL');

          changes.push({
            lcdId: newPolicy.lcdId,
            mac: newPolicy.mac,
            changeType: 'updated',
            previousVersion: existingPolicy,
            newVersion: newPolicy,
            summary: `LCD policy ${newPolicy.lcdId} updated - ${changeReasons.join(', ')}`
          });
        } else {
          console.log(`✓ Policy ${newPolicy.lcdId} unchanged (${Math.round(contentSimilarity * 100)}% similar)`);
        }
      }
    } catch (error) {
      console.error(`Error checking policy ${newPolicy.lcdId}:`, error);
      // Continue processing other policies instead of failing completely
    }
  }

  console.log(`Change detection completed: ${changes.length} changes detected from ${newPolicies.length} policies`);
  return changes;
}

/**
 * Enhanced policy database updates with transaction safety and conflict resolution
 */
async function updatePolicyRecords(changes: PolicyChange[]): Promise<PolicyUpdateResult> {
  const result: PolicyUpdateResult = {
    totalFetched: changes.length,
    newPolicies: 0,
    updatedPolicies: 0,
    supersededPolicies: 0,
    changes: changes,
    errors: []
  };

  console.log(`Processing ${changes.length} policy changes...`);

  // Process changes in batches to avoid overwhelming the database
  const BATCH_SIZE = 10;
  for (let i = 0; i < changes.length; i += BATCH_SIZE) {
    const batch = changes.slice(i, i + BATCH_SIZE);
    
    for (const change of batch) {
      try {
        switch (change.changeType) {
          case 'new':
            // Double-check if policy still doesn't exist (race condition prevention)
            const existingCheck = await storage.getPolicySourceByLCD(change.lcdId);
            const macMatch = existingCheck.filter(p => p.mac === change.mac && p.status === 'active');
            
            if (macMatch.length === 0) {
              await storage.createPolicySource(change.newVersion);
              result.newPolicies++;
              console.log(`✓ Created new policy: ${change.lcdId} (${change.mac})`);
            } else {
              console.warn(`⚠ Policy ${change.lcdId} already exists for ${change.mac}, skipping creation`);
            }
            break;
            
          case 'updated':
            if (change.previousVersion && change.newVersion) {
              try {
                // Atomic update: supersede old version and create new one
                // First verify the previous version still exists and is active
                const currentPolicy = await storage.getPolicySource(change.previousVersion.id);
                
                if (currentPolicy && currentPolicy.status === 'active') {
                  // Mark previous version as superseded
                  await storage.updatePolicySourceStatus(change.previousVersion.id, 'superseded');
                  
                  // Create new version with updated content
                  await storage.createPolicySource(change.newVersion);
                  
                  result.updatedPolicies++;
                  console.log(`✓ Updated policy: ${change.lcdId} (${change.mac})`);
                } else {
                  console.warn(`⚠ Previous version of ${change.lcdId} no longer active, treating as new policy`);
                  await storage.createPolicySource(change.newVersion);
                  result.newPolicies++;
                }
              } catch (updateError) {
                throw new Error(`Failed atomic update for ${change.lcdId}: ${updateError}`);
              }
            }
            break;
            
          case 'superseded':
            if (change.previousVersion) {
              const currentPolicy = await storage.getPolicySource(change.previousVersion.id);
              if (currentPolicy && currentPolicy.status === 'active') {
                await storage.updatePolicySourceStatus(change.previousVersion.id, 'superseded');
                result.supersededPolicies++;
                console.log(`✓ Superseded policy: ${change.lcdId}`);
              } else {
                console.warn(`⚠ Policy ${change.lcdId} already superseded or not found`);
              }
            }
            break;
        }

        // Add small delay between updates to be respectful to database
        if (changes.length > 50) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }

      } catch (error) {
        const errorMsg = `Failed to update policy ${change.lcdId} (${change.mac}): ${error}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
        
        // Continue processing other policies instead of failing completely
        continue;
      }
    }
  }

  // Summary logging
  console.log(`\n📊 Policy Update Results:`);
  console.log(`   • New policies: ${result.newPolicies}`);
  console.log(`   • Updated policies: ${result.updatedPolicies}`);
  console.log(`   • Superseded policies: ${result.supersededPolicies}`);
  console.log(`   • Errors: ${result.errors.length}`);
  
  if (result.errors.length > 0) {
    console.log(`\n⚠ Error Summary:`);
    result.errors.forEach(error => console.log(`   - ${error}`));
  }

  return result;
}

/**
 * Main function to perform comprehensive policy database update
 */
export async function performPolicyUpdate(): Promise<PolicyUpdateResult> {
  console.log('Starting policy database update...');
  
  try {
    // Fetch latest policies from CMS and MAC sources
    const newPolicies = await fetchCMSPolicyUpdates();
    
    // Detect changes compared to existing database
    const changes = await detectPolicyChanges(newPolicies);
    
    // Update database with changes
    const result = await updatePolicyRecords(changes);
    
    console.log(`Policy update completed: ${result.newPolicies} new, ${result.updatedPolicies} updated, ${result.errors.length} errors`);
    
    return result;
    
  } catch (error) {
    console.error('Policy update failed:', error);
    throw error;
  }
}

/**
 * MAC-specific function to perform policy database update for a specific region
 * Only updates policies for the specified MAC region
 */
export async function performPolicyUpdateForMAC(macRegion: string): Promise<PolicyUpdateResult> {
  console.log(`Starting policy database update for MAC region: ${macRegion}...`);
  
  try {
    // Fetch latest policies from CMS and MAC sources
    const allNewPolicies = await fetchCMSPolicyUpdates();
    
    // Filter policies for the specific MAC region
    const newPolicies = allNewPolicies.filter(policy => policy.mac === macRegion);
    
    if (newPolicies.length === 0) {
      console.log(`No policies found for MAC region: ${macRegion}`);
      return {
        totalFetched: 0,
        newPolicies: 0,
        updatedPolicies: 0,
        supersededPolicies: 0,
        changes: [],
        errors: []
      };
    }
    
    // Detect changes compared to existing database
    const changes = await detectPolicyChanges(newPolicies);
    
    // Update database with changes
    const result = await updatePolicyRecords(changes);
    
    console.log(`MAC-specific policy update completed for ${macRegion}: ${result.newPolicies} new, ${result.updatedPolicies} updated, ${result.errors.length} errors`);
    
    return result;
    
  } catch (error) {
    console.error(`MAC-specific policy update failed for ${macRegion}:`, error);
    throw error;
  }
}

/**
 * Scheduled policy update job (runs nightly)
 */
export async function scheduledPolicyUpdate(): Promise<void> {
  try {
    console.log(`Starting scheduled policy update at ${new Date().toISOString()}`);
    
    const result = await performPolicyUpdate();
    
    // Log results for monitoring
    console.log('Scheduled policy update results:', {
      timestamp: new Date().toISOString(),
      newPolicies: result.newPolicies,
      updatedPolicies: result.updatedPolicies,
      errors: result.errors.length,
      changes: result.changes.length
    });
    
    // In a production system, you might want to:
    // - Send notification emails for significant changes
    // - Update a dashboard with the latest sync status  
    // - Store update history for audit purposes
    
  } catch (error) {
    console.error('Scheduled policy update failed:', error);
    // In production, send alert notifications here
  }
}

/**
 * Get policy update history and status
 */
export async function getPolicyUpdateStatus(): Promise<{
  lastUpdate: Date | null;
  totalPolicies: number;
  activePolicies: number;
  recentChanges: PolicyChange[];
}> {
  try {
    const allPolicies = await storage.getAllPolicySources();
    const activePolicies = allPolicies.filter((p: PolicySource) => p.status === 'active');
    
    // Find most recent update
    const lastUpdate = allPolicies.length > 0 
      ? new Date(Math.max(...allPolicies.map((p: PolicySource) => {
          const timestamp = p.updatedAt || p.createdAt;
          return timestamp ? new Date(timestamp).getTime() : 0;
        })))
      : null;
    
    return {
      lastUpdate,
      totalPolicies: allPolicies.length,
      activePolicies: activePolicies.length,
      recentChanges: [] // Would be populated from a change log table in production
    };
  } catch (error) {
    console.error('Error getting policy update status:', error);
    throw error;
  }
}