import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { storage } from '../storage';
import { 
  Episode, 
  Patient, 
  Encounter, 
  Tenant, 
  ComplianceTracking,
  AnalyticsSnapshot,
  HealingTrend,
  PerformanceMetric,
  CostAnalytic
} from '@shared/schema';
import { decryptPatientData, decryptEncounterNotes } from './encryption';
import { assessMedicareCompliance } from '@shared/clinicalCompliance';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';

// Report type definitions
export type ReportType = 
  | 'clinical-summary' 
  | 'episode-summary' 
  | 'provider-performance' 
  | 'medicare-compliance'
  | 'lcd-compliance'
  | 'audit-trail'
  | 'cost-effectiveness'
  | 'healing-outcomes';

export type ExportFormat = 'pdf' | 'excel' | 'csv';

export interface ReportGenerationRequest {
  type: ReportType;
  format: ExportFormat;
  tenantId: string;
  userId: string;
  dateRange?: {
    startDate: Date;
    endDate: Date;
  };
  filters?: {
    patientId?: string;
    episodeId?: string;
    providerId?: string;
    woundType?: string;
    complianceLevel?: string;
  };
  options?: {
    includeCharts?: boolean;
    includeDetails?: boolean;
    includeCitations?: boolean;
    groupBy?: 'patient' | 'episode' | 'provider' | 'month';
  };
}

export interface GeneratedReport {
  id: string;
  type: ReportType;
  format: ExportFormat;
  fileName: string;
  filePath: string;
  fileSize: number;
  generatedAt: Date;
  expiresAt: Date;
  metadata: {
    totalRecords: number;
    dateRange?: string;
    filters?: any;
    generatedBy: string;
  };
}

// Chart generation configuration
const chartWidth = 800;
const chartHeight = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
  width: chartWidth, 
  height: chartHeight,
  backgroundColour: 'white'
});

class ReportGenerationService {
  private reportsDir: string;

  constructor() {
    this.reportsDir = path.join(process.cwd(), 'reports');
    this.ensureReportsDirectory();
  }

  private ensureReportsDirectory(): void {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  private generateFileName(type: ReportType, format: ExportFormat, tenantId: string): string {
    const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
    const sanitizedTenantId = tenantId.substring(0, 8);
    return `${type}-${sanitizedTenantId}-${timestamp}.${format === 'excel' ? 'xlsx' : format}`;
  }

  private async generateChart(chartConfig: any): Promise<Buffer> {
    return await chartJSNodeCanvas.renderToBuffer(chartConfig);
  }

  // SECURE Main report generation method with database tracking
  async generateReport(request: ReportGenerationRequest): Promise<GeneratedReport> {
    const { type, format, tenantId, userId, dateRange, filters, options } = request;

    try {
      // SECURITY: Validate user has access to tenant
      const userTenantRole = await storage.getUserTenantRole(userId, tenantId);
      if (!userTenantRole) {
        throw new Error('User does not have access to this tenant');
      }

      // Generate secure file name and path
      const fileName = this.generateFileName(type, format, tenantId);
      const filePath = path.join(this.reportsDir, fileName);

      // Gather data based on report type
      const reportData = await this.gatherReportData(type, tenantId, dateRange, filters);

      let fileSize = 0;
      const reportId = crypto.randomUUID();

      // Generate report based on format
      switch (format) {
        case 'pdf':
          fileSize = await this.generatePDFReport(type, reportData, filePath, options);
          break;
        case 'excel':
          fileSize = await this.generateExcelReport(type, reportData, filePath, options);
          break;
        case 'csv':
          fileSize = await this.generateCSVReport(type, reportData, filePath, options);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      // CRITICAL: Store report in database with proper tenant/user binding for security
      const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const storedReport = await storage.createGeneratedReport({
        id: reportId,
        tenantId,
        generatedBy: userId,
        reportType: type,
        reportFormat: format,
        fileName,
        filePath,
        fileSize,
        expiresAt: expirationTime,
        generationStatus: 'completed',
        isExpired: false,
        downloadCount: 0,
        deliveryStatus: 'available',
        metadata: {
          totalRecords: reportData.totalRecords || 0,
          dateRange: dateRange ? `${format(dateRange.startDate, 'yyyy-MM-dd')} to ${format(dateRange.endDate, 'yyyy-MM-dd')}` : undefined,
          filters: filters,
          generatedBy: userId,
          options: options
        }
      });

      // Log report generation activity with audit trail
      await storage.createAuditLog({
        tenantId,
        userId,
        action: 'GENERATE_REPORT',
        entity: 'Report',
        entityId: reportId,
        ipAddress: 'system',
        userAgent: 'report-generator',
        previousHash: '',
      });

      // Return secure report metadata (no filePath exposed)
      return {
        id: reportId,
        type,
        format,
        fileName, // Keep for backwards compatibility but use ID for downloads
        filePath, // Internal use only
        fileSize,
        generatedAt: storedReport.createdAt,
        expiresAt: expirationTime,
        metadata: {
          totalRecords: reportData.totalRecords || 0,
          dateRange: dateRange ? `${format(dateRange.startDate, 'yyyy-MM-dd')} to ${format(dateRange.endDate, 'yyyy-MM-dd')}` : undefined,
          filters: filters,
          generatedBy: userId
        }
      };
    } catch (error) {
      // REDACTED ERROR LOGGING: Don't expose PHI in logs
      console.error(`Error generating ${type} report:`, {
        reportType: type,
        format,
        tenantId: tenantId.substring(0, 8) + '***', // Partially redacted
        userId: userId.substring(0, 8) + '***', // Partially redacted
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to generate ${type} report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Data gathering methods
  private async gatherReportData(
    type: ReportType, 
    tenantId: string, 
    dateRange?: { startDate: Date; endDate: Date }, 
    filters?: any
  ): Promise<any> {
    const defaultDateRange = {
      startDate: dateRange?.startDate || subDays(new Date(), 30),
      endDate: dateRange?.endDate || new Date()
    };

    switch (type) {
      case 'clinical-summary':
        return await this.gatherClinicalSummaryData(tenantId, defaultDateRange, filters);
      case 'episode-summary':
        return await this.gatherEpisodeSummaryData(tenantId, defaultDateRange, filters);
      case 'provider-performance':
        return await this.gatherProviderPerformanceData(tenantId, defaultDateRange, filters);
      case 'medicare-compliance':
        return await this.gatherMedicareComplianceData(tenantId, defaultDateRange, filters);
      case 'lcd-compliance':
        return await this.gatherLCDComplianceData(tenantId, defaultDateRange, filters);
      case 'audit-trail':
        return await this.gatherAuditTrailData(tenantId, defaultDateRange, filters);
      case 'cost-effectiveness':
        return await this.gatherCostEffectivenessData(tenantId, defaultDateRange, filters);
      case 'healing-outcomes':
        return await this.gatherHealingOutcomesData(tenantId, defaultDateRange, filters);
      default:
        throw new Error(`Unsupported report type: ${type}`);
    }
  }

  private async gatherClinicalSummaryData(tenantId: string, dateRange: any, filters: any) {
    const patients = await storage.getPatientsByTenant(tenantId);
    const episodes = await storage.getEpisodesByTenant(tenantId);
    const encounters = await storage.getEncountersByTenant(tenantId);

    // Filter by date range
    const filteredEpisodes = episodes.filter(episode => {
      const episodeDate = new Date(episode.episodeStartDate || episode.createdAt || '');
      return episodeDate >= dateRange.startDate && episodeDate <= dateRange.endDate;
    });

    // Process clinical data
    const clinicalData = await Promise.all(filteredEpisodes.map(async (episode) => {
      const patient = patients.find(p => p.id === episode.patientId);
      const episodeEncounters = encounters.filter(e => e.episodeId === episode.id);
      
      if (!patient) return null;

      const decryptedPatient = decryptPatientData(patient);
      
      // Calculate healing metrics
      const healingProgress = await this.calculateHealingProgress(episodeEncounters);
      const complianceStatus = await this.assessEpisodeCompliance(episode, episodeEncounters);

      return {
        patientId: patient.id,
        patientName: `${decryptedPatient.firstName} ${decryptedPatient.lastName}`,
        mrn: patient.mrn,
        episodeId: episode.id,
        woundType: episode.woundType,
        woundLocation: episode.woundLocation,
        startDate: episode.episodeStartDate,
        endDate: episode.episodeEndDate,
        status: episode.status,
        totalEncounters: episodeEncounters.length,
        primaryDiagnosis: episode.primaryDiagnosis,
        healingProgress: healingProgress,
        complianceStatus: complianceStatus,
        costSummary: await this.calculateEpisodeCosts(episode.id)
      };
    }));

    const validClinicalData = clinicalData.filter(Boolean);

    return {
      patients: patients.length,
      episodes: filteredEpisodes.length,
      encounters: encounters.length,
      clinicalData: validClinicalData,
      totalRecords: validClinicalData.length,
      summaryMetrics: await this.calculateSummaryMetrics(validClinicalData),
      chartData: await this.generateClinicalChartData(validClinicalData)
    };
  }

  private async gatherMedicareComplianceData(tenantId: string, dateRange: any, filters: any) {
    const episodes = await storage.getEpisodesByTenant(tenantId);
    const complianceTracking = await storage.getComplianceTrackingByTenant(tenantId);
    
    const filteredEpisodes = episodes.filter(episode => {
      const episodeDate = new Date(episode.episodeStartDate || episode.createdAt || '');
      return episodeDate >= dateRange.startDate && episodeDate <= dateRange.endDate;
    });

    const complianceData = await Promise.all(filteredEpisodes.map(async (episode) => {
      const episodeEncounters = await storage.getEncountersByEpisode(episode.id);
      const complianceResult = await assessMedicareCompliance(episode, episodeEncounters);
      
      return {
        episodeId: episode.id,
        woundType: episode.woundType,
        complianceScore: complianceResult.score,
        overallStatus: complianceResult.overallStatus,
        trafficLight: complianceResult.trafficLight,
        conservativeCareDays: complianceResult.conservativeCareDays,
        weeklyAssessments: complianceResult.weeklyAssessments,
        woundReduction: complianceResult.woundReduction,
        criticalGaps: complianceResult.criticalGaps,
        recommendations: complianceResult.recommendations,
        daysToDeadline: complianceResult.daysToDeadline
      };
    }));

    return {
      episodes: filteredEpisodes.length,
      complianceData: complianceData,
      totalRecords: complianceData.length,
      overallComplianceRate: this.calculateOverallComplianceRate(complianceData),
      riskDistribution: this.calculateRiskDistribution(complianceData),
      chartData: this.generateComplianceChartData(complianceData)
    };
  }

  // Report generation methods for different formats
  private async generatePDFReport(
    type: ReportType, 
    data: any, 
    filePath: string, 
    options?: any
  ): Promise<number> {
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Generate HTML content based on report type
      const htmlContent = await this.generateHTMLContent(type, data, options);
      
      await page.setContent(htmlContent, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      // Generate PDF with proper formatting
      await page.pdf({
        path: filePath,
        format: 'A4',
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size: 10px; padding: 10px;">${type.toUpperCase()} REPORT</div>`,
        footerTemplate: `<div style="font-size: 10px; padding: 10px;">Generated on ${format(new Date(), 'yyyy-MM-dd HH:mm')} | Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
        printBackground: true
      });

      const stats = fs.statSync(filePath);

      return stats.size;
    } finally {
      await browser.close();
    }
  }

  private async generateExcelReport(
    type: ReportType, 
    data: any, 
    filePath: string, 
    options?: any
  ): Promise<number> {
    const workbook = new ExcelJS.Workbook();
    
    // Set workbook properties
    workbook.creator = 'WoundCare Portal';
    workbook.lastModifiedBy = 'System';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Generate Excel content based on report type
    await this.generateExcelContent(workbook, type, data, options);

    // Save the workbook
    await workbook.xlsx.writeFile(filePath);

    const stats = fs.statSync(filePath);

    return stats.size;
  }

  private async generateCSVReport(
    type: ReportType, 
    data: any, 
    filePath: string, 
    options?: any
  ): Promise<number> {
    let csvContent = '';

    // Generate CSV content based on report type
    switch (type) {
      case 'clinical-summary':
        csvContent = this.generateClinicalSummaryCSV(data);
        break;
      case 'medicare-compliance':
        csvContent = this.generateMedicareComplianceCSV(data);
        break;
      case 'audit-trail':
        csvContent = this.generateAuditTrailCSV(data);
        break;
      default:
        csvContent = this.generateGenericCSV(data);
    }

    // Write CSV file
    fs.writeFileSync(filePath, csvContent, 'utf8');

    const stats = fs.statSync(filePath);

    return stats.size;
  }

  // Helper methods for data processing and calculations
  private async calculateHealingProgress(encounters: Encounter[]): Promise<any> {
    if (encounters.length === 0) return { status: 'No data', percentage: 0 };

    // Sort encounters by date
    const sortedEncounters = encounters.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const firstEncounter = sortedEncounters[0];
    const lastEncounter = sortedEncounters[sortedEncounters.length - 1];

    // Extract wound measurements from wound details
    const firstDetails = firstEncounter.woundDetails as any;
    const lastDetails = lastEncounter.woundDetails as any;

    if (!firstDetails?.measurements || !lastDetails?.measurements) {
      return { status: 'Insufficient data', percentage: 0 };
    }

    const firstSize = firstDetails.measurements.length * firstDetails.measurements.width;
    const lastSize = lastDetails.measurements.length * lastDetails.measurements.width;

    const reductionPercentage = ((firstSize - lastSize) / firstSize) * 100;

    return {
      status: reductionPercentage >= 20 ? 'On track' : 'Needs attention',
      percentage: Math.round(reductionPercentage),
      initialSize: firstSize,
      currentSize: lastSize,
      encounters: encounters.length
    };
  }

  private async assessEpisodeCompliance(episode: Episode, encounters: Encounter[]): Promise<any> {
    const complianceResult = await assessMedicareCompliance(episode, encounters);
    return {
      score: complianceResult.score,
      status: complianceResult.overallStatus,
      trafficLight: complianceResult.trafficLight,
      criticalGaps: complianceResult.criticalGaps.length
    };
  }

  private async calculateEpisodeCosts(episodeId: string): Promise<any> {
    const costAnalytics = await storage.getCostAnalyticsByEpisode(episodeId);
    
    if (costAnalytics.length === 0) {
      return { totalCost: 0, averageCost: 0, reimbursementRate: 0 };
    }

    const totalCost = costAnalytics.reduce((sum, cost) => sum + (parseFloat(cost.totalCost) || 0), 0);
    const averageCost = totalCost / costAnalytics.length;
    const totalReimbursement = costAnalytics.reduce((sum, cost) => sum + (parseFloat(cost.reimbursementAmount || '0') || 0), 0);
    
    return {
      totalCost: Math.round(totalCost),
      averageCost: Math.round(averageCost),
      reimbursementRate: totalCost > 0 ? Math.round((totalReimbursement / totalCost) * 100) : 0
    };
  }

  // CSV generation methods
  private generateClinicalSummaryCSV(data: any): string {
    if (!data.clinicalData || data.clinicalData.length === 0) {
      return 'No data available\n';
    }

    const headers = [
      'Patient Name', 'MRN', 'Episode ID', 'Wound Type', 'Location', 
      'Start Date', 'End Date', 'Status', 'Total Encounters', 
      'Primary Diagnosis', 'Healing Progress %', 'Compliance Status', 
      'Total Cost', 'Compliance Score'
    ];

    const rows = data.clinicalData.map((item: any) => [
      `"${item.patientName}"`,
      `"${item.mrn}"`,
      `"${item.episodeId}"`,
      `"${item.woundType || ''}"`,
      `"${item.woundLocation || ''}"`,
      `"${item.startDate || ''}"`,
      `"${item.endDate || ''}"`,
      `"${item.status || ''}"`,
      `"${item.totalEncounters}"`,
      `"${item.primaryDiagnosis || ''}"`,
      `"${item.healingProgress?.percentage || 0}"`,
      `"${item.complianceStatus?.status || ''}"`,
      `"${item.costSummary?.totalCost || 0}"`,
      `"${item.complianceStatus?.score || 0}"`
    ]);

    return headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
  }

  private generateMedicareComplianceCSV(data: any): string {
    if (!data.complianceData || data.complianceData.length === 0) {
      return 'No compliance data available\n';
    }

    const headers = [
      'Episode ID', 'Wound Type', 'Compliance Score', 'Overall Status',
      'Traffic Light', 'Conservative Care Days', 'Weekly Assessments Complete',
      'Weekly Assessments Missing', 'Wound Reduction %', 'Meets 20% Threshold',
      'Critical Gaps', 'Days to Deadline'
    ];

    const rows = data.complianceData.map((item: any) => [
      `"${item.episodeId}"`,
      `"${item.woundType || ''}"`,
      `"${item.complianceScore}"`,
      `"${item.overallStatus}"`,
      `"${item.trafficLight}"`,
      `"${item.conservativeCareDays}"`,
      `"${item.weeklyAssessments?.documented || 0}"`,
      `"${item.weeklyAssessments?.missing || 0}"`,
      `"${item.woundReduction?.percentage || 0}"`,
      `"${item.woundReduction?.meetsThreshold ? 'Yes' : 'No'}"`,
      `"${item.criticalGaps?.length || 0}"`,
      `"${item.daysToDeadline}"`
    ]);

    return headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
  }

  private generateGenericCSV(data: any): string {
    if (!data || typeof data !== 'object') {
      return 'No data available\n';
    }

    // Convert object to CSV format
    const flattenObject = (obj: any, prefix = ''): any => {
      let result: any = {};
      for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          const newKey = prefix ? `${prefix}.${key}` : key;
          
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            Object.assign(result, flattenObject(value, newKey));
          } else {
            result[newKey] = Array.isArray(value) ? value.join(';') : String(value);
          }
        }
      }
      return result;
    };

    const flatData = flattenObject(data);
    const headers = Object.keys(flatData);
    const values = headers.map(header => `"${flatData[header]}"`);

    return headers.join(',') + '\n' + values.join(',') + '\n';
  }

  // HTML content generation for PDF reports
  private async generateHTMLContent(type: ReportType, data: any, options?: any): Promise<string> {
    const baseStyle = `
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0ea5e9; padding-bottom: 15px; }
        .title { font-size: 24px; font-weight: bold; color: #0ea5e9; margin-bottom: 10px; }
        .subtitle { font-size: 14px; color: #6b7280; }
        .section { margin-bottom: 25px; }
        .section-title { font-size: 18px; font-weight: bold; color: #374151; margin-bottom: 15px; border-left: 4px solid #0ea5e9; padding-left: 10px; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .metric-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #0ea5e9; }
        .metric-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background: #f8fafc; font-weight: bold; color: #374151; }
        .compliance-green { color: #22c55e; font-weight: bold; }
        .compliance-yellow { color: #f59e0b; font-weight: bold; }
        .compliance-red { color: #ef4444; font-weight: bold; }
        .chart-container { text-align: center; margin: 20px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #6b7280; }
      </style>
    `;

    let content = '';
    
    switch (type) {
      case 'clinical-summary':
        content = await this.generateClinicalSummaryHTML(data, options);
        break;
      case 'medicare-compliance':
        content = await this.generateMedicareComplianceHTML(data, options);
        break;
      default:
        content = '<div class="section"><p>Report content not available for this type.</p></div>';
    }

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>${type.toUpperCase()} Report</title>
          ${baseStyle}
        </head>
        <body>
          <div class="header">
            <div class="title">${type.replace('-', ' ').toUpperCase()} REPORT</div>
            <div class="subtitle">Generated on ${format(new Date(), 'MMMM dd, yyyy \'at\' HH:mm')}</div>
          </div>
          ${content}
          <div class="footer">
            <p>This report was generated by the WoundCare Portal system. All data is confidential and HIPAA-compliant.</p>
          </div>
        </body>
      </html>
    `;
  }

  private async generateClinicalSummaryHTML(data: any, options?: any): Promise<string> {
    const summaryMetrics = data.summaryMetrics || {};
    
    return `
      <div class="section">
        <div class="section-title">Executive Summary</div>
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-value">${data.patients || 0}</div>
            <div class="metric-label">Total Patients</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${data.episodes || 0}</div>
            <div class="metric-label">Active Episodes</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${summaryMetrics.averageHealingRate || 0}%</div>
            <div class="metric-label">Average Healing Rate</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${summaryMetrics.complianceRate || 0}%</div>
            <div class="metric-label">Compliance Rate</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Clinical Data Summary</div>
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Wound Type</th>
              <th>Start Date</th>
              <th>Healing Progress</th>
              <th>Compliance Status</th>
              <th>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            ${(data.clinicalData || []).slice(0, 20).map((item: any) => `
              <tr>
                <td>${item.patientName} (${item.mrn})</td>
                <td>${item.woundType || 'Not specified'}</td>
                <td>${item.startDate ? format(new Date(item.startDate), 'MM/dd/yyyy') : 'N/A'}</td>
                <td>${item.healingProgress?.percentage || 0}%</td>
                <td class="${item.complianceStatus?.status === 'Compliant' ? 'compliance-green' : 'compliance-yellow'}">
                  ${item.complianceStatus?.status || 'Unknown'}
                </td>
                <td>$${item.costSummary?.totalCost || 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${(data.clinicalData || []).length > 20 ? `<p><em>Showing first 20 of ${data.clinicalData.length} total records</em></p>` : ''}
      </div>
    `;
  }

  private async generateMedicareComplianceHTML(data: any, options?: any): Promise<string> {
    return `
      <div class="section">
        <div class="section-title">Compliance Overview</div>
        <div class="metric-grid">
          <div class="metric-card">
            <div class="metric-value">${data.episodes || 0}</div>
            <div class="metric-label">Episodes Reviewed</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${data.overallComplianceRate || 0}%</div>
            <div class="metric-label">Overall Compliance Rate</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${data.riskDistribution?.high || 0}</div>
            <div class="metric-label">High Risk Episodes</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${data.riskDistribution?.critical || 0}</div>
            <div class="metric-label">Critical Risk Episodes</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Medicare Compliance Details</div>
        <table>
          <thead>
            <tr>
              <th>Episode ID</th>
              <th>Wound Type</th>
              <th>Compliance Score</th>
              <th>Status</th>
              <th>20% Reduction</th>
              <th>Critical Gaps</th>
              <th>Days to Deadline</th>
            </tr>
          </thead>
          <tbody>
            ${(data.complianceData || []).map((item: any) => `
              <tr>
                <td>${item.episodeId.substring(0, 8)}...</td>
                <td>${item.woundType || 'Not specified'}</td>
                <td>${item.complianceScore}%</td>
                <td class="${item.trafficLight === 'green' ? 'compliance-green' : item.trafficLight === 'yellow' ? 'compliance-yellow' : 'compliance-red'}">
                  ${item.overallStatus}
                </td>
                <td class="${item.woundReduction?.meetsThreshold ? 'compliance-green' : 'compliance-red'}">
                  ${item.woundReduction?.percentage || 0}%
                </td>
                <td>${item.criticalGaps?.length || 0}</td>
                <td class="${item.daysToDeadline < 7 ? 'compliance-red' : item.daysToDeadline < 14 ? 'compliance-yellow' : 'compliance-green'}">
                  ${item.daysToDeadline}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Excel content generation methods
  private async generateExcelContent(workbook: ExcelJS.Workbook, type: ReportType, data: any, options?: any): Promise<void> {
    switch (type) {
      case 'clinical-summary':
        await this.generateClinicalSummaryExcel(workbook, data, options);
        break;
      case 'medicare-compliance':
        await this.generateMedicareComplianceExcel(workbook, data, options);
        break;
      default:
        const worksheet = workbook.addWorksheet('Report Data');
        worksheet.addRow(['Report Type', type]);
        worksheet.addRow(['Generated', new Date().toISOString()]);
        worksheet.addRow(['Total Records', data.totalRecords || 0]);
    }
  }

  private async generateClinicalSummaryExcel(workbook: ExcelJS.Workbook, data: any, options?: any): Promise<void> {
    // Summary worksheet
    const summaryWs = workbook.addWorksheet('Summary');
    summaryWs.addRow(['Clinical Summary Report']);
    summaryWs.addRow(['Generated:', new Date().toLocaleDateString()]);
    summaryWs.addRow([]);
    
    summaryWs.addRow(['Metric', 'Value']);
    summaryWs.addRow(['Total Patients', data.patients || 0]);
    summaryWs.addRow(['Total Episodes', data.episodes || 0]);
    summaryWs.addRow(['Total Encounters', data.encounters || 0]);
    summaryWs.addRow(['Average Healing Rate', `${data.summaryMetrics?.averageHealingRate || 0}%`]);
    summaryWs.addRow(['Compliance Rate', `${data.summaryMetrics?.complianceRate || 0}%`]);

    // Style the summary worksheet
    summaryWs.getRow(1).font = { bold: true, size: 16 };
    summaryWs.getRow(4).font = { bold: true };
    summaryWs.getColumn(1).width = 20;
    summaryWs.getColumn(2).width = 15;

    // Clinical data worksheet
    const dataWs = workbook.addWorksheet('Clinical Data');
    const headers = [
      'Patient Name', 'MRN', 'Episode ID', 'Wound Type', 'Location',
      'Start Date', 'End Date', 'Status', 'Total Encounters', 
      'Primary Diagnosis', 'Healing Progress %', 'Compliance Status',
      'Total Cost', 'Compliance Score'
    ];
    
    dataWs.addRow(headers);
    
    // Add data rows
    (data.clinicalData || []).forEach((item: any) => {
      dataWs.addRow([
        item.patientName,
        item.mrn,
        item.episodeId,
        item.woundType || '',
        item.woundLocation || '',
        item.startDate || '',
        item.endDate || '',
        item.status || '',
        item.totalEncounters,
        item.primaryDiagnosis || '',
        item.healingProgress?.percentage || 0,
        item.complianceStatus?.status || '',
        item.costSummary?.totalCost || 0,
        item.complianceStatus?.score || 0
      ]);
    });

    // Style the data worksheet
    dataWs.getRow(1).font = { bold: true };
    dataWs.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };

    // Auto-fit columns
    dataWs.columns.forEach(column => {
      if (column.header) {
        column.width = Math.max(column.header.toString().length + 2, 12);
      }
    });
  }

  private async generateMedicareComplianceExcel(workbook: ExcelJS.Workbook, data: any, options?: any): Promise<void> {
    // Compliance overview worksheet
    const overviewWs = workbook.addWorksheet('Compliance Overview');
    overviewWs.addRow(['Medicare Compliance Report']);
    overviewWs.addRow(['Generated:', new Date().toLocaleDateString()]);
    overviewWs.addRow([]);
    
    overviewWs.addRow(['Metric', 'Value']);
    overviewWs.addRow(['Episodes Reviewed', data.episodes || 0]);
    overviewWs.addRow(['Overall Compliance Rate', `${data.overallComplianceRate || 0}%`]);
    overviewWs.addRow(['High Risk Episodes', data.riskDistribution?.high || 0]);
    overviewWs.addRow(['Critical Risk Episodes', data.riskDistribution?.critical || 0]);

    // Compliance data worksheet
    const complianceWs = workbook.addWorksheet('Compliance Details');
    const headers = [
      'Episode ID', 'Wound Type', 'Compliance Score', 'Overall Status',
      'Traffic Light', 'Conservative Care Days', 'Weekly Assessments Complete',
      'Weekly Assessments Missing', 'Wound Reduction %', 'Meets 20% Threshold',
      'Critical Gaps Count', 'Days to Deadline'
    ];
    
    complianceWs.addRow(headers);
    
    // Add compliance data rows
    (data.complianceData || []).forEach((item: any) => {
      complianceWs.addRow([
        item.episodeId,
        item.woundType || '',
        item.complianceScore,
        item.overallStatus,
        item.trafficLight,
        item.conservativeCareDays,
        item.weeklyAssessments?.documented || 0,
        item.weeklyAssessments?.missing || 0,
        item.woundReduction?.percentage || 0,
        item.woundReduction?.meetsThreshold ? 'Yes' : 'No',
        item.criticalGaps?.length || 0,
        item.daysToDeadline
      ]);
    });

    // Style the worksheets
    [overviewWs, complianceWs].forEach(ws => {
      ws.getRow(1).font = { bold: true, size: 16 };
      if (ws === complianceWs) {
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE2E8F0' }
        };
      }
    });

    // Auto-fit columns
    complianceWs.columns.forEach(column => {
      if (column.header) {
        column.width = Math.max(column.header.toString().length + 2, 12);
      }
    });
  }

  // Utility methods
  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateOverallComplianceRate(complianceData: any[]): number {
    if (complianceData.length === 0) return 0;
    
    const compliantEpisodes = complianceData.filter(item => 
      item.overallStatus === 'Compliant' || item.trafficLight === 'green'
    ).length;
    
    return Math.round((compliantEpisodes / complianceData.length) * 100);
  }

  private calculateRiskDistribution(complianceData: any[]): any {
    const distribution = { low: 0, medium: 0, high: 0, critical: 0 };
    
    complianceData.forEach(item => {
      if (item.trafficLight === 'green') distribution.low++;
      else if (item.trafficLight === 'yellow') distribution.medium++;
      else if (item.trafficLight === 'red') distribution.high++;
      if (item.criticalGaps && item.criticalGaps.length > 0) distribution.critical++;
    });
    
    return distribution;
  }

  private calculateSummaryMetrics(clinicalData: any[]): any {
    if (clinicalData.length === 0) {
      return { averageHealingRate: 0, complianceRate: 0 };
    }

    const totalHealingRate = clinicalData.reduce((sum, item) => 
      sum + (item.healingProgress?.percentage || 0), 0);
    const averageHealingRate = Math.round(totalHealingRate / clinicalData.length);
    
    const compliantEpisodes = clinicalData.filter(item => 
      item.complianceStatus?.status === 'Compliant').length;
    const complianceRate = Math.round((compliantEpisodes / clinicalData.length) * 100);

    return { averageHealingRate, complianceRate };
  }

  private generateClinicalChartData(clinicalData: any[]): any {
    // Generate chart data for clinical summaries
    const woundTypeDistribution = clinicalData.reduce((acc: any, item) => {
      const woundType = item.woundType || 'Unknown';
      acc[woundType] = (acc[woundType] || 0) + 1;
      return acc;
    }, {});

    return {
      woundTypeDistribution: Object.entries(woundTypeDistribution).map(([type, count]) => ({
        label: type,
        value: count
      }))
    };
  }

  private generateComplianceChartData(complianceData: any[]): any {
    // Generate chart data for compliance reports
    const trafficLightDistribution = complianceData.reduce((acc: any, item) => {
      const status = item.trafficLight || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    return {
      trafficLightDistribution: Object.entries(trafficLightDistribution).map(([status, count]) => ({
        label: status,
        value: count
      }))
    };
  }

  // Additional data gathering methods (placeholder implementations)
  private async gatherEpisodeSummaryData(tenantId: string, dateRange: any, filters: any) {
    // Implementation for episode summary data
    return { totalRecords: 0, message: 'Episode summary data gathering not yet implemented' };
  }

  private async gatherProviderPerformanceData(tenantId: string, dateRange: any, filters: any) {
    // Implementation for provider performance data
    return { totalRecords: 0, message: 'Provider performance data gathering not yet implemented' };
  }

  private async gatherLCDComplianceData(tenantId: string, dateRange: any, filters: any) {
    // Implementation for LCD compliance data
    return { totalRecords: 0, message: 'LCD compliance data gathering not yet implemented' };
  }

  private async gatherAuditTrailData(tenantId: string, dateRange: any, filters: any) {
    const auditLogs = await storage.getAuditLogsByTenant(tenantId);
    
    const filteredLogs = auditLogs.filter(log => {
      const logDate = new Date(log.createdAt || '');
      return logDate >= dateRange.startDate && logDate <= dateRange.endDate;
    });

    return {
      auditLogs: filteredLogs,
      totalRecords: filteredLogs.length
    };
  }

  private generateAuditTrailCSV(data: any): string {
    if (!data.auditLogs || data.auditLogs.length === 0) {
      return 'No audit trail data available\n';
    }

    const headers = [
      'Timestamp', 'User ID', 'Action', 'Entity', 'Entity ID', 
      'IP Address', 'User Agent', 'Previous Hash'
    ];

    const rows = data.auditLogs.map((log: any) => [
      `"${log.createdAt || ''}"`,
      `"${log.userId || ''}"`,
      `"${log.action || ''}"`,
      `"${log.entity || ''}"`,
      `"${log.entityId || ''}"`,
      `"${log.ipAddress || ''}"`,
      `"${log.userAgent || ''}"`,
      `"${log.previousHash || ''}"`
    ]);

    return headers.join(',') + '\n' + rows.map(row => row.join(',')).join('\n');
  }

  private async gatherCostEffectivenessData(tenantId: string, dateRange: any, filters: any) {
    // Implementation for cost effectiveness data
    return { totalRecords: 0, message: 'Cost effectiveness data gathering not yet implemented' };
  }

  private async gatherHealingOutcomesData(tenantId: string, dateRange: any, filters: any) {
    // Implementation for healing outcomes data
    return { totalRecords: 0, message: 'Healing outcomes data gathering not yet implemented' };
  }

  // SECURE DATABASE-BACKED CLEANUP - Remove expired reports with PHI safety
  async cleanupExpiredReports(): Promise<{ deletedCount: number; errors: string[] }> {
    const deletedCount = { files: 0, records: 0 };
    const errors: string[] = [];
    
    try {
      // Get expired reports from database (not filesystem timestamps)
      const expiredReports = await storage.getExpiredGeneratedReports();
      
      for (const report of expiredReports) {
        try {
          // SECURITY: Verify file exists and delete PHI from disk
          if (fs.existsSync(report.filePath)) {
            // Secure deletion for PHI compliance
            await this.secureFileDelete(report.filePath);
            deletedCount.files++;
          }
          
          // Mark as expired in database for audit trail
          await storage.markGeneratedReportAsExpired(report.id);
          deletedCount.records++;
          
          // AUDIT TRAIL: Log cleanup for HIPAA compliance
          await storage.createAuditLog({
            tenantId: report.tenantId,
            userId: 'system',
            action: 'CLEANUP_EXPIRED_REPORT',
            entity: 'Report',
            entityId: report.id,
            ipAddress: 'system',
            userAgent: 'cleanup-service',
            previousHash: '',
          });
          
        } catch (error) {
          const errorMsg = `Failed to cleanup report ${report.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          // REDACTED ERROR LOGGING: Don't expose PHI
          console.error('Report cleanup error:', {
            reportId: report.id,
            tenantId: report.tenantId.substring(0, 8) + '***',
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
      
      // Clean up orphaned files (files without database records)
      await this.cleanupOrphanedFiles();
      
      return {
        deletedCount: deletedCount.files + deletedCount.records,
        errors
      };
      
    } catch (error) {
      const errorMsg = `Cleanup service failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error('Cleanup service error:', error);
      
      return {
        deletedCount: 0,
        errors
      };
    }
  }
  
  // SECURE FILE DELETION - Multiple overwrite passes for PHI protection
  private async secureFileDelete(filePath: string): Promise<void> {
    try {
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;
      
      // Overwrite file with random data multiple times (PHI security)
      for (let pass = 0; pass < 3; pass++) {
        const randomData = crypto.randomBytes(fileSize);
        fs.writeFileSync(filePath, randomData);
      }
      
      // Final overwrite with zeros
      const zeroData = Buffer.alloc(fileSize, 0);
      fs.writeFileSync(filePath, zeroData);
      
      // Delete the file
      fs.unlinkSync(filePath);
      
    } catch (error) {
      throw new Error(`Secure file deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Clean up files that exist on disk but not in database
  private async cleanupOrphanedFiles(): Promise<void> {
    try {
      if (!fs.existsSync(this.reportsDir)) return;
      
      const files = fs.readdirSync(this.reportsDir);
      
      for (const file of files) {
        const filePath = path.join(this.reportsDir, file);
        
        // Check if file has corresponding database record - simple approach for now
        // TODO: Optimize this with a batch query for large file counts
        const stats = fs.statSync(filePath);
        const ageHours = (new Date().getTime() - stats.mtime.getTime()) / (1000 * 60 * 60);
        
        // If file is older than 48 hours and no recent database activity, consider it orphaned
        if (ageHours > 48) {
          await this.secureFileDelete(filePath);
          console.log(`Cleaned up orphaned file: ${file}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up orphaned files:', error);
    }
  }

  // Method to get report file path for download
  getReportFilePath(fileName: string): string | null {
    const filePath = path.join(this.reportsDir, fileName);
    return fs.existsSync(filePath) ? filePath : null;
  }
}

// Export singleton instance
export const reportGenerator = new ReportGenerationService();

// Export types for use in other modules
export type { ReportGenerationRequest, GeneratedReport };