import { Document } from 'react-pdf';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { storage } from '../storage';
import { EligibilityCheck, Patient, Tenant } from '@shared/schema';
import { decryptPatientData } from './encryption';
import fs from 'fs';
import path from 'path';

export interface DocumentGenerationRequest {
  type: 'PreDetermination' | 'LMN';
  patientId: string;
  tenantId: string;
  eligibilityCheckId: string;
  content: string;
}

export interface GeneratedDocument {
  id: string;
  pdfPath?: string;
  docxPath?: string;
  content: string;
}

export async function generateDocument(request: DocumentGenerationRequest): Promise<GeneratedDocument> {
  const { type, patientId, tenantId, eligibilityCheckId, content } = request;

  try {
    // Get patient and tenant information
    const patient = await storage.getPatient(patientId);
    const tenant = await storage.getTenant(tenantId);
    const eligibilityCheck = await storage.getEligibilityCheck(eligibilityCheckId);

    if (!patient || !tenant || !eligibilityCheck) {
      throw new Error('Required data not found for document generation');
    }

    // Decrypt patient data for document generation
    const patientData = decryptPatientData(patient);

    // Create document record
    const document = await storage.createDocument({
      patientId,
      type,
      title: `${type} - ${patientData.firstName} ${patientData.lastName} - ${new Date().toLocaleDateString()}`,
      content,
      citations: eligibilityCheck.citations as any,
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

    // Generate DOCX
    await generateDocxDocument(content, docxPath, {
      patient: patientData,
      tenant,
      type,
      eligibilityCheck
    });

    // Generate PDF (using a simple text-based approach for now)
    await generatePdfDocument(content, pdfPath, {
      patient: patientData,
      tenant,
      type,
      eligibilityCheck
    });

    // Update document record with file paths
    const updatedDocument = await storage.updateDocument(document.id, {
      pdfUrl: pdfPath,
      docxUrl: docxPath,
    });

    return {
      id: updatedDocument.id,
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
    eligibilityCheck: EligibilityCheck;
  }
): Promise<void> {
  const { patient, tenant, type, eligibilityCheck } = context;

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
          ...((eligibilityCheck.citations as any[]) || []).map(citation => 
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

async function generatePdfDocument(
  content: string,
  filePath: string,
  context: {
    patient: any;
    tenant: Tenant;
    type: string;
    eligibilityCheck: EligibilityCheck;
  }
): Promise<void> {
  // For now, create a simple text file as PDF generation requires additional setup
  // In production, you would use a proper PDF library like puppeteer or react-pdf
  
  const { patient, tenant, type, eligibilityCheck } = context;
  
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
${((eligibilityCheck.citations as any[]) || []).map(citation => 
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
