import { encryptEncounterNotes } from '../server/services/encryption.js';
import { DatabaseStorage } from '../server/storage.js';
import { db } from '../server/db.js';
import { patients } from '../shared/schema.js';

const storage = new DatabaseStorage();

// Sample encounter data templates for different scenarios
const encounterTemplates = [
  {
    // Scenario 1: Clearly eligible DFU with 6+ weeks conservative care
    woundType: 'DFU',
    location: 'plantar aspect of right great toe',
    measurements: { length: '2.5', width: '1.8', depth: '0.5' },
    duration: '8 weeks',
    conservativeCare: {
      offloading: true,
      compression: false,
      debridement: true,
      moistureBalance: true,
      infectionControl: true,
      duration: '6 weeks',
      details: 'Total contact cast applied, regular sharp debridement, antimicrobial dressings used'
    },
    infectionStatus: 'Controlled',
    notes: [
      'Patient presents with non-healing diabetic foot ulcer on plantar aspect right great toe, present for 8 weeks despite aggressive conservative management',
      'Wound dimensions: 2.5cm x 1.8cm x 0.5cm depth. Minimal progress despite 6 weeks of total contact cast offloading',
      'Sharp debridement performed weekly, wound bed shows granulation tissue but minimal size reduction (<20% in 4 weeks)',
      'Patient compliant with offloading, HbA1c improved to 7.2%, adequate vascular supply confirmed with ABI 1.1',
      'Previous treatments: Total contact cast, sharp debridement, antimicrobial foam dressings, glucose optimization'
    ],
    comorbidities: {
      diabetes: true,
      peripheralNeuropathy: true,
      hypertension: true,
      hba1c: '7.2%'
    }
  },
  {
    // Scenario 2: Eligible VLU with compression therapy failure
    woundType: 'VLU',
    location: 'medial aspect left lower leg',
    measurements: { length: '4.2', width: '3.1', depth: '0.3' },
    duration: '12 weeks',
    conservativeCare: {
      offloading: false,
      compression: true,
      debridement: true,
      moistureBalance: true,
      infectionControl: true,
      duration: '8 weeks',
      details: 'Multi-layer compression bandaging, enzymatic and sharp debridement, hydrocolloid dressings'
    },
    infectionStatus: 'None',
    notes: [
      'Chronic venous leg ulcer present for 12 weeks on medial malleolus, inadequate healing despite optimal compression therapy',
      'Current size 4.2 x 3.1 x 0.3cm, minimal improvement (<15%) over past 4 weeks of treatment',
      'Patient compliant with multi-layer compression therapy, ABI 0.9 rules out significant arterial disease',
      'Weekly debridement performed, wound bed 80% granulation tissue, minimal exudate',
      'Failed treatments include: 4-layer compression bandaging, enzymatic debridement, hydrocolloid and foam dressings'
    ],
    comorbidities: {
      venousInsufficiency: true,
      previousDVT: true,
      obesity: true
    }
  },
  {
    // Scenario 3: Borderline case - insufficient conservative care duration
    woundType: 'DFU',
    location: 'lateral border right foot',
    measurements: { length: '1.8', width: '1.2', depth: '0.4' },
    duration: '5 weeks',
    conservativeCare: {
      offloading: true,
      compression: false,
      debridement: true,
      moistureBalance: true,
      infectionControl: false,
      duration: '3 weeks',
      details: 'Removable cast walker, weekly debridement, alginate dressings'
    },
    infectionStatus: 'None',
    notes: [
      'Diabetic foot ulcer lateral border right foot, 5 weeks duration with 3 weeks conservative treatment',
      'Wound measuring 1.8 x 1.2 x 0.4cm, showing some granulation but limited epithelialization',
      'Patient using removable cast walker with good compliance reported',
      'Weekly sharp debridement, alginate dressings changed 3x weekly',
      'May benefit from extended conservative care trial before considering advanced therapies'
    ],
    comorbidities: {
      diabetes: true,
      peripheralNeuropathy: true,
      hba1c: '8.1%'
    }
  },
  {
    // Scenario 4: Not eligible - active infection
    woundType: 'DFU',
    location: 'plantar aspect left hallux',
    measurements: { length: '3.0', width: '2.5', depth: '1.2' },
    duration: '6 weeks',
    conservativeCare: {
      offloading: true,
      compression: false,
      debridement: true,
      moistureBalance: true,
      infectionControl: true,
      duration: '4 weeks',
      details: 'Total contact cast, aggressive debridement, antibiotic therapy'
    },
    infectionStatus: 'Active - cellulitis present',
    notes: [
      'Deep diabetic foot ulcer with surrounding cellulitis and purulent drainage',
      'Wound dimensions 3.0 x 2.5 x 1.2cm with exposed tendon, significant erythema extending 3cm from wound edge',
      'Currently on IV antibiotics for cellulitis, wound culture growing MRSA',
      'Patient requires infection control before consideration of advanced wound care products',
      'Offloading with total contact cast, daily dressing changes with antimicrobial agents'
    ],
    comorbidities: {
      diabetes: true,
      peripheralNeuropathy: true,
      peripheralArterialDisease: true,
      hba1c: '9.2%'
    }
  },
  {
    // Scenario 5: Eligible VLU with documentation of treatment failure
    woundType: 'VLU',
    location: 'lateral malleolus right leg',
    measurements: { length: '5.1', width: '4.2', depth: '0.6' },
    duration: '16 weeks',
    conservativeCare: {
      offloading: false,
      compression: true,
      debridement: true,
      moistureBalance: true,
      infectionControl: true,
      duration: '12 weeks',
      details: 'Unna boot followed by 4-layer compression, sharp debridement, various topical agents'
    },
    infectionStatus: 'None',
    notes: [
      'Large chronic venous ulcer lateral malleolus with 16 weeks duration and comprehensive conservative care failure',
      'Current measurements 5.1 x 4.2 x 0.6cm, actually increased in size over past 4 weeks despite optimal treatment',
      'Excellent compression compliance, duplex showing severe reflux in GSV and SSV',
      'Multiple dressing trials including hydrocolloid, foam, alginate, and silver-containing products',
      'Patient motivated for healing, no contraindications to cellular therapy'
    ],
    comorbidities: {
      venousInsufficiency: true,
      lipodermatosclerosis: true
    }
  },
  {
    // Scenario 6: Pressure ulcer scenario (Other wound type)
    woundType: 'Other',
    location: 'sacral region',
    measurements: { length: '6.2', width: '4.8', depth: '1.5' },
    duration: '10 weeks',
    conservativeCare: {
      offloading: true,
      compression: false,
      debridement: true,
      moistureBalance: true,
      infectionControl: true,
      duration: '8 weeks',
      details: 'Pressure redistribution mattress, turning schedule, enzymatic and sharp debridement'
    },
    infectionStatus: 'None',
    notes: [
      'Stage IV pressure ulcer sacral region in wheelchair-bound patient, 10 weeks duration',
      'Dimensions 6.2 x 4.8 x 1.5cm, minimal healing progress despite optimal pressure relief',
      'Patient on pressure redistribution surface, strict turning protocol implemented',
      'Adequate nutrition confirmed, albumin 3.2 g/dL, wound bed 70% granulation tissue',
      'Failed conservative treatments: multiple dressing types, negative pressure therapy trial'
    ],
    comorbidities: {
      spinalCordInjury: true,
      neurogenicBladder: true
    }
  }
];

async function generateTestEncounters() {
  try {
    console.log('Starting test encounter generation...');
    
    // Get all existing patients using direct DB query for test data generation
    const allPatients = await db.select().from(patients);
    
    console.log(`Found ${allPatients.length} patients`);
    
    let encounterCount = 0;
    
    for (const patient of allPatients) {
      // Generate 1-2 encounters per patient with different scenarios
      const numEncounters = Math.floor(Math.random() * 2) + 1;
      
      for (let i = 0; i < numEncounters; i++) {
        const template = encounterTemplates[encounterCount % encounterTemplates.length];
        
        // Create encounter date (within last 30 days)
        const encounterDate = new Date();
        encounterDate.setDate(encounterDate.getDate() - Math.floor(Math.random() * 30));
        
        // Encrypt the encounter notes
        const encryptedNotes = encryptEncounterNotes(template.notes);
        
        // Prepare wound details
        const woundDetails = {
          type: template.woundType,
          location: template.location,
          measurements: template.measurements,
          duration: template.duration
        };
        
        // Create encounter using storage interface
        await storage.createEncounter({
          patientId: patient.id,
          date: encounterDate,
          encryptedNotes,
          woundDetails: woundDetails,
          conservativeCare: template.conservativeCare,
          infectionStatus: template.infectionStatus,
          comorbidities: template.comorbidities
        });
        
        encounterCount++;
        console.log(`Created encounter ${encounterCount} for patient ${patient.mrn} (${template.woundType})`);
      }
    }
    
    console.log(`Successfully generated ${encounterCount} test encounters`);
    
  } catch (error) {
    console.error('Error generating test encounters:', error);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateTestEncounters();
}

export { generateTestEncounters };