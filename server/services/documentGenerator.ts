import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { storage } from '../storage';
import { EligibilityCheck, Patient, Tenant, Episode, Encounter } from '@shared/schema';
import { decryptPatientData } from './encryption';
import fs from 'fs';
import path from 'path';

export interface DocumentGenerationRequest {
  type: 'PreDetermination' | 'LMN';
  patientId: string;
  tenantId: string;
  eligibilityCheckId?: string; // Optional for single-encounter generation
  episodeId?: string; // Optional for episode-level generation
  content: string;
}

export interface GeneratedDocument {
  id: string;
  pdfPath?: string;
  docxPath?: string;
  content: string;
}

export async function generateDocument(request: DocumentGenerationRequest): Promise<GeneratedDocument> {
  const { type, patientId, tenantId, eligibilityCheckId, episodeId, content } = request;

  // Validate request - must have either eligibilityCheckId or episodeId
  if (!eligibilityCheckId && !episodeId) {
    throw new Error('Either eligibilityCheckId or episodeId must be provided for document generation');
  }

  try {
    // Get patient and tenant information
    const patient = await storage.getPatient(patientId);
    const tenant = await storage.getTenant(tenantId);

    if (!patient || !tenant) {
      throw new Error('Patient or tenant not found for document generation');
    }

    let eligibilityCheck: EligibilityCheck | undefined;
    let episode: Episode | undefined;
    let episodeEligibilityChecks: EligibilityCheck[] = [];
    let episodeEncounters: Encounter[] = [];

    if (episodeId) {
      // Episode-level document generation
      episode = await storage.getEpisode(episodeId);
      if (!episode) {
        throw new Error('Episode not found for document generation');
      }

      // Get all encounters for the episode
      episodeEncounters = await storage.getEncountersByEpisode(episodeId);
      
      // Get all eligibility checks for the episode (for context)
      episodeEligibilityChecks = await storage.getEligibilityChecksByEpisode(episodeId);
      
      // If eligibilityCheckId is provided, use it directly to avoid duplication
      if (eligibilityCheckId) {
        eligibilityCheck = await storage.getEligibilityCheck(eligibilityCheckId);
      } else {
        // Fallback: Use the most recent episode-level eligibility check
        eligibilityCheck = episodeEligibilityChecks
          .filter(check => check.episodeId === episodeId)
          .sort((a, b) => {
            const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
          })[0];
      }
    } else {
      // Single-encounter document generation (existing functionality)
      eligibilityCheck = await storage.getEligibilityCheck(eligibilityCheckId!);
      if (!eligibilityCheck) {
        throw new Error('Eligibility check not found for document generation');
      }
    }

    // Decrypt patient data for document generation
    const patientData = decryptPatientData(patient);

    // Create episode-aware document title and link to episode
    const documentTitle = episode 
      ? `${type} - ${patientData.firstName} ${patientData.lastName} - Episode: ${episode.woundType} (${episode.woundLocation}) - ${new Date().toLocaleDateString()}`
      : `${type} - ${patientData.firstName} ${patientData.lastName} - ${new Date().toLocaleDateString()}`;

    // Create document record with optional episode link
    const document = await storage.createDocument({
      patientId,
      episodeId: episode?.id,
      type,
      title: documentTitle,
      createdBy: 'system',
    });

    // Generate file paths
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `${type}_${patient.mrn}_${timestamp}`;
    const pdfPath = path.join(process.cwd(), 'documents', `${baseFilename}.pdf`);
    const docxPath = path.join(process.cwd(), 'documents', `${baseFilename}.docx`);

    // Ensure documents directory exists
    const documentsDir = path.dirname(pdfPath);
    if (!fs.existsSync(documentsDir)) {
      fs.mkdirSync(documentsDir, { recursive: true });
    }

    // Generate DOCX with episode context
    await generateDocxDocument(content, docxPath, {
      patient: patientData,
      tenant,
      type,
      eligibilityCheck,
      episode,
      episodeEncounters,
      episodeEligibilityChecks
    });

    // Generate PDF placeholder with episode context
    await generatePdfPlaceholder(content, pdfPath, {
      patient: patientData,
      tenant,
      type,
      eligibilityCheck,
      episode,
      episodeEncounters,
      episodeEligibilityChecks
    });

    // Create document version with content and file paths
    const documentVersion = await storage.createDocumentVersion({
      documentId: document.id,
      version: 1,
      content,
      pdfUrl: pdfPath,
      docxUrl: docxPath,
      citations: (eligibilityCheck?.citations as any) || [],
      changeLog: 'Initial version',
      createdBy: 'system',
    });

    return {
      id: document.id,
      pdfPath,
      docxPath,
      content,
    };
  } catch (error) {
    console.error('Error generating document:', error);
    throw new Error('Failed to generate document: ' + (error as Error).message);
  }
}

async function generateDocxDocument(
  content: string,
  filePath: string,
  context: {
    patient: any;
    tenant: Tenant;
    type: string;
    eligibilityCheck: EligibilityCheck | undefined;
    episode?: Episode;
    episodeEncounters?: Encounter[];
    episodeEligibilityChecks?: EligibilityCheck[];
  }
): Promise<void> {
  const { patient, tenant, type, eligibilityCheck, episode, episodeEncounters, episodeEligibilityChecks } = context;

  const doc = new DocxDocument({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: tenant.name,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `${tenant.address || ''}`,
                break: 1,
              }),
              new TextRun({
                text: `Phone: ${tenant.phone || 'N/A'}`,
                break: 1,
              }),
              new TextRun({
                text: `NPI: ${tenant.npi} | TIN: ${tenant.tin}`,
                break: 1,
              }),
            ],
          }),
          new Paragraph({
            text: '',
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: `${type === 'PreDetermination' ? 'Pre-Determination Letter' : 'Letter of Medical Necessity'}`,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Date: ${new Date().toLocaleDateString()}`,
                break: 1,
              }),
              new TextRun({
                text: `Patient: ${patient.firstName} ${patient.lastName}`,
                break: 1,
              }),
              new TextRun({
                text: `MRN: ${context.patient.mrn || 'N/A'}`,
                break: 1,
              }),
              new TextRun({
                text: `DOB: ${patient.dob || 'N/A'}`,
                break: 1,
              }),
            ],
          }),
          new Paragraph({
            text: '',
            spacing: { after: 200 },
          }),
          // Episode Information Section
          ...(episode ? [
            new Paragraph({
              text: 'Episode Information',
              heading: HeadingLevel.HEADING_3,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Wound Type: ${episode.woundType || 'Not specified'}`,
                  break: 1,
                }),
                new TextRun({
                  text: `Wound Location: ${episode.woundLocation || 'Not specified'}`,
                  break: 1,
                }),
                new TextRun({
                  text: `Episode Start Date: ${episode.episodeStartDate ? new Date(episode.episodeStartDate).toLocaleDateString() : 'Not specified'}`,
                  break: 1,
                }),
                new TextRun({
                  text: `Episode Status: ${episode.status || 'active'}`,
                  break: 1,
                }),
                new TextRun({
                  text: `Primary Diagnosis: ${episode.primaryDiagnosis || 'Not specified'}`,
                  break: 1,
                }),
                new TextRun({
                  text: `Total Encounters in Episode: ${episodeEncounters?.length || 0}`,
                  break: 1,
                }),
              ],
            }),
            new Paragraph({
              text: '',
              spacing: { after: 200 },
            }),
          ] : []),
          // Episode Timeline Section  
          ...(episode && episodeEncounters && episodeEncounters.length > 0 ? [
            new Paragraph({
              text: 'Episode Timeline',
              heading: HeadingLevel.HEADING_3,
            }),
            new Paragraph({
              text: 'Chronological encounter progression throughout this episode:',
              spacing: { after: 200 },
            }),
            ...episodeEncounters
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((encounter, index) => [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Encounter ${index + 1}: ${new Date(encounter.date).toLocaleDateString()}`,
                      bold: true,
                      break: 1,
                    }),
                    new TextRun({
                      text: `Wound Status: ${encounter.woundDetails ? JSON.stringify(encounter.woundDetails).substring(0, 100) + '...' : 'Not documented'}`,
                      break: 1,
                    }),
                    new TextRun({
                      text: `Conservative Care: ${encounter.conservativeCare ? JSON.stringify(encounter.conservativeCare).substring(0, 100) + '...' : 'Not documented'}`,
                      break: 1,
                    }),
                    new TextRun({
                      text: `Infection Status: ${encounter.infectionStatus || 'None'}`,
                      break: 1,
                    }),
                  ],
                }),
                new Paragraph({
                  text: '',
                  spacing: { after: 150 },
                }),
              ]).flat(),
            new Paragraph({
              text: '',
              spacing: { after: 200 },
            }),
          ] : []),
          ...content.split('\n\n').map(paragraph => 
            new Paragraph({
              text: paragraph.trim(),
              spacing: { after: 200 },
            })
          ),
          new Paragraph({
            text: '',
            spacing: { after: 400 },
          }),
          new Paragraph({
            text: 'Citations and References:',
            heading: HeadingLevel.HEADING_3,
          }),
          ...((eligibilityCheck?.citations as any[]) || []).map(citation => 
            new Paragraph({
              children: [
                new TextRun({
                  text: `• ${citation.title}`,
                  break: 1,
                }),
                new TextRun({
                  text: `  ${citation.url}`,
                  break: 1,
                }),
                new TextRun({
                  text: `  Effective Date: ${citation.effectiveDate}`,
                  break: 1,
                }),
              ],
            })
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
}

async function generatePdfPlaceholder(
  content: string,
  filePath: string,
  context: {
    patient: any;
    tenant: Tenant;
    type: string;
    eligibilityCheck: EligibilityCheck | undefined;
    episode?: Episode;
    episodeEncounters?: Encounter[];
    episodeEligibilityChecks?: EligibilityCheck[];
  }
): Promise<void> {
  // PDF generation placeholder - requires additional setup like Puppeteer, jsPDF, or html-pdf
  // In production, implement proper PDF generation with libraries like puppeteer
  
  const { patient, tenant, type, eligibilityCheck, episode, episodeEncounters, episodeEligibilityChecks } = context;
  
  const pdfContent = `
${tenant.name}
${tenant.address || ''}
Phone: ${tenant.phone || 'N/A'}
NPI: ${tenant.npi} | TIN: ${tenant.tin}

${type === 'PreDetermination' ? 'PRE-DETERMINATION LETTER' : 'LETTER OF MEDICAL NECESSITY'}

Date: ${new Date().toLocaleDateString()}
Patient: ${patient.firstName} ${patient.lastName}
MRN: ${context.patient.mrn || 'N/A'}
DOB: ${patient.dob || 'N/A'}

${content}

CITATIONS AND REFERENCES:
${((eligibilityCheck?.citations as any[]) || []).map(citation => 
  `• ${citation.title}\n  ${citation.url}\n  Effective Date: ${citation.effectiveDate}`
).join('\n')}

Generated by WoundCare Pre-Determination Portal
${new Date().toISOString()}
  `;

  // Write as text file for now (in production, use proper PDF generation)
  fs.writeFileSync(filePath.replace('.pdf', '.txt'), pdfContent);
  
  // Create a placeholder PDF file
  fs.writeFileSync(filePath, `PDF placeholder for: ${type} - ${patient.firstName} ${patient.lastName}`);
}

export async function getDocumentsByPatient(patientId: string) {
  return await storage.getDocumentsByPatient(patientId);
}

export async function getDocument(documentId: string) {
  return await storage.getDocument(documentId);
}
