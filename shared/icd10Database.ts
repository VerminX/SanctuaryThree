// ICD-10 Code Database with Clinical Recommendations for Wound Care
// Focused on Diabetic Foot Ulcers, Venous Leg Ulcers, Pressure Ulcers, and related conditions

export interface ICD10Code {
  code: string;
  description: string;
  category: string;
  chapter: string;
  laterality?: 'left' | 'right' | 'bilateral' | null;
  severity?: 'mild' | 'moderate' | 'severe' | null;
  complications?: string[];
  synonyms?: string[];
  isWoundRelated: boolean;
  medicareCompliance: {
    isLCDCovered: boolean;
    lcdNumbers?: string[];
    frequencyLimitations?: string;
    documentation_requirements?: string[];
    coverage_conditions?: string[];
  };
  clinicalRecommendations: {
    immediate_care?: string[];
    conservative_care?: string[];
    monitoring_requirements?: string[];
    contraindications?: string[];
    treatment_protocols?: string[];
    evidence_level?: 'A' | 'B' | 'C'; // Evidence-based grading
  };
  relatedCodes?: string[];
}

export const ICD10_DATABASE: ICD10Code[] = [
  // Diabetic Foot Ulcers - Type 1 Diabetes
  {
    code: "E10.621",
    description: "Type 1 diabetes mellitus with foot ulcer",
    category: "Diabetic Foot Ulcer",
    chapter: "Endocrine, nutritional and metabolic diseases",
    isWoundRelated: true,
    synonyms: ["T1DM with foot ulcer", "Type 1 diabetic foot ulcer", "insulin dependent diabetes foot ulcer"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831", "L33822"],
      frequencyLimitations: "Weekly visits for active treatment, monthly for maintenance",
      documentation_requirements: [
        "Diabetic status documentation",
        "HbA1c levels within 90 days",
        "Wound measurements and photography",
        "Vascular assessment",
        "Conservative care documentation"
      ],
      coverage_conditions: [
        "Failed conservative care for 30 days minimum",
        "Adequate arterial circulation (ABI >0.7 or TcPO2 >30mmHg)",
        "Controlled infection status"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Assess for infection signs",
        "Evaluate vascular status",
        "Blood glucose monitoring",
        "Offloading assessment"
      ],
      conservative_care: [
        "Total contact casting or offloading boot",
        "Daily wound cleansing and dressing",
        "Glucose management optimization",
        "Nutrition assessment",
        "Patient education on foot care"
      ],
      monitoring_requirements: [
        "Weekly wound measurements",
        "Monthly HbA1c if >7%",
        "Quarterly vascular assessment",
        "Annual comprehensive foot exam"
      ],
      contraindications: [
        "Active osteomyelitis without treatment",
        "Severe PAD (ABI <0.5)",
        "Uncontrolled infection"
      ],
      treatment_protocols: [
        "Standard wound care protocol",
        "Advanced wound care products after 30 days conservative care",
        "Hyperbaric oxygen therapy consideration for Wagner 3+ ulcers"
      ],
      evidence_level: 'A'
    },
    relatedCodes: ["E10.40", "E10.51", "Z87.891"]
  },

  // Type 2 Diabetes with Foot Ulcer
  {
    code: "E11.621",
    description: "Type 2 diabetes mellitus with foot ulcer",
    category: "Diabetic Foot Ulcer", 
    chapter: "Endocrine, nutritional and metabolic diseases",
    isWoundRelated: true,
    synonyms: ["T2DM with foot ulcer", "Type 2 diabetic foot ulcer", "adult-onset diabetes foot ulcer"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831", "L33822"],
      frequencyLimitations: "Weekly visits for active treatment, monthly for maintenance",
      documentation_requirements: [
        "Diabetic status documentation",
        "HbA1c levels within 90 days",
        "Wound measurements and photography",
        "Vascular assessment",
        "Conservative care documentation"
      ],
      coverage_conditions: [
        "Failed conservative care for 30 days minimum",
        "Adequate arterial circulation (ABI >0.7 or TcPO2 >30mmHg)",
        "Controlled infection status"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Assess for infection signs",
        "Evaluate vascular status", 
        "Blood glucose monitoring",
        "Offloading assessment"
      ],
      conservative_care: [
        "Total contact casting or offloading boot",
        "Daily wound cleansing and dressing",
        "Glucose management optimization",
        "Weight management counseling",
        "Patient education on foot care"
      ],
      monitoring_requirements: [
        "Weekly wound measurements",
        "Monthly HbA1c if >7%",
        "Quarterly vascular assessment",
        "Annual comprehensive foot exam"
      ],
      contraindications: [
        "Active osteomyelitis without treatment",
        "Severe PAD (ABI <0.5)",
        "Uncontrolled infection"
      ],
      treatment_protocols: [
        "Standard wound care protocol",
        "Advanced wound care products after 30 days conservative care",
        "Hyperbaric oxygen therapy consideration for Wagner 3+ ulcers"
      ],
      evidence_level: 'A'
    },
    relatedCodes: ["E11.40", "E11.51", "Z87.891"]
  },

  // Venous Leg Ulcers
  {
    code: "I87.31",
    description: "Chronic venous hypertension (idiopathic) with ulcer of right lower extremity",
    category: "Venous Leg Ulcer",
    chapter: "Diseases of the circulatory system",
    laterality: "right",
    isWoundRelated: true,
    synonyms: ["Venous stasis ulcer right leg", "Chronic venous insufficiency ulcer right"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831", "L33822"],
      frequencyLimitations: "Weekly visits for active treatment",
      documentation_requirements: [
        "Venous insufficiency documentation",
        "Doppler ultrasound results", 
        "Compression therapy trial documentation",
        "Wound measurements and photography"
      ],
      coverage_conditions: [
        "Failed compression therapy for 30 days",
        "No arterial insufficiency (ABI >0.8)",
        "Adequate ambulatory status"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Assess compression status",
        "Evaluate for infection",
        "Measure ankle-brachial index",
        "Assess mobility and ambulation"
      ],
      conservative_care: [
        "Compression therapy (30-40mmHg gradient)",
        "Elevation therapy",
        "Regular exercise program",
        "Wound cleansing and appropriate dressing",
        "Treatment of underlying venous disease"
      ],
      monitoring_requirements: [
        "Weekly wound measurements",
        "Monthly compression therapy compliance",
        "Quarterly vascular assessment"
      ],
      contraindications: [
        "Arterial insufficiency (ABI <0.8)",
        "Severe heart failure",
        "Severe peripheral neuropathy"
      ],
      treatment_protocols: [
        "Four-layer compression bandaging",
        "Advanced wound care products after failed conservative care",
        "Venous ablation consideration for underlying insufficiency"
      ],
      evidence_level: 'A'
    },
    relatedCodes: ["I87.32", "I87.33", "I83.91"]
  },

  {
    code: "I87.32", 
    description: "Chronic venous hypertension (idiopathic) with ulcer of left lower extremity",
    category: "Venous Leg Ulcer",
    chapter: "Diseases of the circulatory system",
    laterality: "left",
    isWoundRelated: true,
    synonyms: ["Venous stasis ulcer left leg", "Chronic venous insufficiency ulcer left"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831", "L33822"],
      frequencyLimitations: "Weekly visits for active treatment",
      documentation_requirements: [
        "Venous insufficiency documentation",
        "Doppler ultrasound results",
        "Compression therapy trial documentation", 
        "Wound measurements and photography"
      ],
      coverage_conditions: [
        "Failed compression therapy for 30 days",
        "No arterial insufficiency (ABI >0.8)",
        "Adequate ambulatory status"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Assess compression status",
        "Evaluate for infection",
        "Measure ankle-brachial index",
        "Assess mobility and ambulation"
      ],
      conservative_care: [
        "Compression therapy (30-40mmHg gradient)",
        "Elevation therapy",
        "Regular exercise program", 
        "Wound cleansing and appropriate dressing",
        "Treatment of underlying venous disease"
      ],
      monitoring_requirements: [
        "Weekly wound measurements",
        "Monthly compression therapy compliance",
        "Quarterly vascular assessment"
      ],
      contraindications: [
        "Arterial insufficiency (ABI <0.8)",
        "Severe heart failure",
        "Severe peripheral neuropathy"
      ],
      treatment_protocols: [
        "Four-layer compression bandaging",
        "Advanced wound care products after failed conservative care",
        "Venous ablation consideration for underlying insufficiency"
      ],
      evidence_level: 'A'
    },
    relatedCodes: ["I87.31", "I87.33", "I83.92"]
  },

  // Pressure Ulcers
  {
    code: "L89.003",
    description: "Pressure ulcer of unspecified part of back, stage 3",
    category: "Pressure Ulcer", 
    chapter: "Diseases of the skin and subcutaneous tissue",
    severity: "severe",
    isWoundRelated: true,
    synonyms: ["Decubitus ulcer stage 3", "Bed sore stage 3", "Pressure sore stage 3"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831", "L33822"],
      frequencyLimitations: "Daily visits for stage 3-4 ulcers",
      documentation_requirements: [
        "Pressure ulcer staging documentation",
        "Risk factor assessment",
        "Pressure redistribution measures",
        "Nutritional status assessment"
      ],
      coverage_conditions: [
        "Stage 3 or 4 pressure ulcer",
        "Comprehensive pressure relief plan",
        "Nutritional optimization"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Assess ulcer staging",
        "Evaluate for infection/osteomyelitis",
        "Pressure redistribution immediately",
        "Nutritional assessment"
      ],
      conservative_care: [
        "Advanced pressure redistribution surface",
        "Frequent repositioning protocol",
        "Nutritional supplementation",
        "Appropriate wound dressing for exudate management",
        "Management of incontinence if present"
      ],
      monitoring_requirements: [
        "Daily wound assessment",
        "Weekly measurements and photography",
        "Monthly nutritional status review"
      ],
      contraindications: [
        "Continued pressure exposure",
        "Severe malnutrition without supplementation",
        "Untreated infection"
      ],
      treatment_protocols: [
        "Surgical debridement for necrotic tissue",
        "Advanced wound care products",
        "Negative pressure wound therapy consideration"
      ],
      evidence_level: 'A'
    },
    relatedCodes: ["L89.001", "L89.002", "L89.004"]
  },

  {
    code: "L89.004",
    description: "Pressure ulcer of unspecified part of back, stage 4", 
    category: "Pressure Ulcer",
    chapter: "Diseases of the skin and subcutaneous tissue",
    severity: "severe",
    isWoundRelated: true,
    synonyms: ["Decubitus ulcer stage 4", "Bed sore stage 4", "Full thickness pressure ulcer"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831", "L33822"],
      frequencyLimitations: "Daily visits for stage 4 ulcers",
      documentation_requirements: [
        "Pressure ulcer staging documentation",
        "Bone/muscle exposure documentation", 
        "Surgical consultation notes",
        "Risk factor assessment"
      ],
      coverage_conditions: [
        "Stage 4 pressure ulcer with exposed bone/muscle",
        "Surgical evaluation completed",
        "Comprehensive care plan"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Urgent surgical evaluation",
        "Rule out osteomyelitis",
        "Immediate pressure redistribution",
        "Pain management assessment"
      ],
      conservative_care: [
        "Specialized pressure redistribution surface",
        "Aggressive nutritional support",
        "Surgical debridement as indicated",
        "Advanced wound care products",
        "Multidisciplinary team approach"
      ],
      monitoring_requirements: [
        "Daily wound assessment", 
        "Weekly multidisciplinary rounds",
        "Monthly surgical re-evaluation"
      ],
      contraindications: [
        "Continued pressure exposure",
        "Severe malnutrition",
        "Untreated osteomyelitis"
      ],
      treatment_protocols: [
        "Surgical flap closure consideration",
        "Negative pressure wound therapy",
        "Bioengineered skin substitutes"
      ],
      evidence_level: 'A'
    },
    relatedCodes: ["L89.003", "M86.9", "Z87.891"]
  },

  // Arterial Ulcers
  {
    code: "I70.25",
    description: "Atherosclerosis of native arteries of extremities with ulceration",
    category: "Arterial Ulcer",
    chapter: "Diseases of the circulatory system", 
    isWoundRelated: true,
    synonyms: ["Arterial insufficiency ulcer", "Ischemic ulcer", "PAD with ulceration"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831"],
      frequencyLimitations: "Weekly visits with vascular surgery coordination",
      documentation_requirements: [
        "Vascular studies (ABI, TcPO2)",
        "Arterial insufficiency documentation",
        "Revascularization evaluation",
        "Conservative care failure"
      ],
      coverage_conditions: [
        "Documented arterial insufficiency",
        "Vascular surgery consultation",
        "Optimized medical management"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Vascular surgery consultation",
        "Pain management assessment",
        "Avoid compression therapy",
        "Infection evaluation"
      ],
      conservative_care: [
        "Revascularization if appropriate",
        "Antiplatelet therapy",
        "Risk factor modification",
        "Gentle wound care without compression",
        "Pain management"
      ],
      monitoring_requirements: [
        "Weekly wound assessment",
        "Monthly vascular status evaluation",
        "Quarterly ABI measurement"
      ],
      contraindications: [
        "Compression therapy",
        "Aggressive debridement without adequate perfusion",
        "Delay in revascularization evaluation"
      ],
      treatment_protocols: [
        "Revascularization first-line treatment",
        "Conservative wound care pending vascular intervention",
        "Advanced wound care products after revascularization"
      ],
      evidence_level: 'A'
    },
    relatedCodes: ["I70.20", "I70.26", "I25.10"]
  },

  // Wound-related Infections
  {
    code: "L03.116",
    description: "Cellulitis of right lower limb",
    category: "Wound Infection",
    chapter: "Diseases of the skin and subcutaneous tissue",
    laterality: "right",
    isWoundRelated: true,
    synonyms: ["Lower leg cellulitis right", "Soft tissue infection right leg"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831"],
      frequencyLimitations: "Daily visits during acute phase",
      documentation_requirements: [
        "Clinical signs of infection",
        "Culture results if available",
        "Antibiotic therapy documentation",
        "Response to treatment"
      ],
      coverage_conditions: [
        "Clinical evidence of infection",
        "Appropriate antibiotic therapy",
        "Wound care coordination"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Immediate antibiotic therapy",
        "Culture and sensitivity if purulent",
        "Elevation and rest",
        "Pain management"
      ],
      conservative_care: [
        "Oral or IV antibiotics as appropriate",
        "Daily wound assessment",
        "Elevation therapy",
        "Address underlying wound if present"
      ],
      monitoring_requirements: [
        "Daily clinical assessment",
        "48-72 hour antibiotic response evaluation",
        "Weekly until resolution"
      ],
      contraindications: [
        "Delay in antibiotic treatment",
        "Compression therapy during acute phase",
        "Inadequate antibiotic coverage"
      ],
      treatment_protocols: [
        "Empiric antibiotics pending culture",
        "Adjust based on culture results",
        "Treat underlying wound condition"
      ],
      evidence_level: 'A'
    },
    relatedCodes: ["L03.115", "A49.9", "L97.911"]
  },

  // Chronic Wounds - General
  {
    code: "L97.911",
    description: "Non-pressure chronic ulcer of unspecified part of right lower leg with fat layer exposed",
    category: "Chronic Wound",
    chapter: "Diseases of the skin and subcutaneous tissue", 
    laterality: "right",
    severity: "moderate",
    isWoundRelated: true,
    synonyms: ["Chronic leg ulcer right", "Lower leg wound right", "Non-healing wound right leg"],
    medicareCompliance: {
      isLCDCovered: true,
      lcdNumbers: ["L33831", "L33822"],
      frequencyLimitations: "Weekly visits for active treatment",
      documentation_requirements: [
        "Chronic wound duration >30 days",
        "Underlying etiology assessment",
        "Conservative care documentation",
        "Wound progression tracking"
      ],
      coverage_conditions: [
        "Failed standard wound care",
        "Underlying condition treated",
        "Adequate vascular status"
      ]
    },
    clinicalRecommendations: {
      immediate_care: [
        "Identify underlying etiology",
        "Assess vascular status",
        "Rule out infection",
        "Evaluate current treatment"
      ],
      conservative_care: [
        "Address underlying cause",
        "Appropriate wound dressing selection",
        "Nutritional optimization",
        "Patient education and compliance",
        "Offloading if lower extremity"
      ],
      monitoring_requirements: [
        "Weekly wound measurements",
        "Monthly treatment plan review",
        "Quarterly underlying condition assessment"
      ],
      contraindications: [
        "Untreated underlying etiology",
        "Poor vascular supply",
        "Active infection without treatment"
      ],
      treatment_protocols: [
        "Standard wound care protocol",
        "Advanced wound care products consideration",
        "Biological therapy if appropriate"
      ],
      evidence_level: 'B'
    },
    relatedCodes: ["L97.912", "L97.913", "L97.919"]
  }
];

// Helper functions for searching and validation
export const searchICD10Codes = (query: string): ICD10Code[] => {
  if (!query || query.length < 2) return [];
  
  const searchTerm = query.toLowerCase().trim();
  
  return ICD10_DATABASE.filter(code => 
    code.code.toLowerCase().includes(searchTerm) ||
    code.description.toLowerCase().includes(searchTerm) ||
    code.category.toLowerCase().includes(searchTerm) ||
    (code.synonyms && code.synonyms.some(synonym => 
      synonym.toLowerCase().includes(searchTerm)
    ))
  ).sort((a, b) => {
    // Prioritize exact code matches
    if (a.code.toLowerCase() === searchTerm) return -1;
    if (b.code.toLowerCase() === searchTerm) return 1;
    
    // Prioritize code prefix matches
    if (a.code.toLowerCase().startsWith(searchTerm)) return -1;
    if (b.code.toLowerCase().startsWith(searchTerm)) return 1;
    
    // Sort by relevance to wound care
    if (a.isWoundRelated && !b.isWoundRelated) return -1;
    if (!a.isWoundRelated && b.isWoundRelated) return 1;
    
    return a.code.localeCompare(b.code);
  });
};

export const validateICD10Format = (code: string): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!code) {
    errors.push("Diagnosis code is required");
    return { isValid: false, errors, warnings };
  }
  
  // ICD-10 format: Letter + 2-3 digits + optional decimal + 1-4 characters
  const icd10Pattern = /^[A-Z][0-9]{2,3}(\.[0-9A-Z]{1,4})?$/;
  
  if (!icd10Pattern.test(code.toUpperCase())) {
    errors.push("Invalid ICD-10 format. Expected format: Letter + 2-3 digits + optional decimal + 1-4 characters (e.g., E11.621)");
  }
  
  // Check if code exists in our database
  const foundCode = ICD10_DATABASE.find(c => c.code.toLowerCase() === code.toLowerCase());
  if (!foundCode) {
    warnings.push("Code not found in wound care database. Verify code accuracy.");
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

export const getCodeByCode = (code: string): ICD10Code | undefined => {
  return ICD10_DATABASE.find(c => c.code.toLowerCase() === code.toLowerCase());
};

export const getWoundRelatedCodes = (): ICD10Code[] => {
  return ICD10_DATABASE.filter(code => code.isWoundRelated);
};

export const getClinicalRecommendations = (code: string): ICD10Code['clinicalRecommendations'] | null => {
  const foundCode = getCodeByCode(code);
  return foundCode?.clinicalRecommendations || null;
};

export const getMedicareCompliance = (code: string): ICD10Code['medicareCompliance'] | null => {
  const foundCode = getCodeByCode(code);
  return foundCode?.medicareCompliance || null;
};