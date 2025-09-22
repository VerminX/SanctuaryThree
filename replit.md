# WoundCare Pre-Determination Portal

## Overview

This is a HIPAA-compliant pre-determination portal for wound care clinics that combines AI-powered eligibility analysis with automated medical letter generation. The application helps clinics streamline their pre-determination process for skin substitutes and cellular tissue products (CTPs) by analyzing patient encounters against Medicare LCD policies and generating compliant documentation.

The system supports multi-tenant clinic accounts with role-based access control, encrypted PHI storage, comprehensive audit logging, and integrates with both cloud-based and local LLM providers for compliance flexibility.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query for server state management and caching
- **Routing**: Wouter for client-side routing
- **Forms**: React Hook Form with Zod schema validation
- **Styling**: Tailwind CSS with CSS custom properties for theming

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Replit Auth with OpenID Connect/OAuth2 support
- **Session Management**: Express sessions with PostgreSQL storage
- **API Design**: RESTful endpoints with consistent error handling and logging

### Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless connection pooling
- **Schema Management**: Drizzle Kit for migrations and schema management
- **PHI Encryption**: AES-256-GCM encryption for sensitive patient data at rest
- **Session Storage**: PostgreSQL-backed session store with TTL management
- **Vector Storage**: pgvector extension for embedding-based policy retrieval

### Authentication and Authorization
- **Primary Auth**: Replit Auth with OIDC/OAuth2 flows
- **Multi-tenant RBAC**: Tenant-based role assignments (Admin, Physician, Staff)
- **Session Security**: HTTP-only cookies with CSRF protection and session timeouts
- **2FA Support**: TOTP integration for enhanced security
- **Audit Logging**: Comprehensive logging of all user actions with signed audit trails

### AI and LLM Integration
- **Primary Provider**: OpenAI API with Azure OpenAI fallback for HIPAA compliance
- **Local Option**: Ollama support for on-premises deployment with privacy requirements
- **RAG System**: Policy database with embedding-based retrieval using pgvector
- **Policy Updates**: Automated nightly jobs to sync Medicare LCD policies and MAC documentation
- **Analysis Engine**: Structured eligibility analysis with gap identification and citation tracking

### Document Generation
- **PDF Generation**: React-PDF for browser-based PDF creation with physician-editable templates
- **DOCX Export**: docx package for Microsoft Word compatible documents
- **Template System**: Configurable templates for different payer types and MAC regions
- **Citation Management**: Automatic citation linking to source policies and effective dates

## Development and Testing

### Test Data

The application includes test patient accounts for LCD policy selection testing and MAC region validation:

#### Test Patient Accounts
- **Patient 1**:
  - Patient ID: `9a2ca2f8-2133-45e0-a44b-3ed94ea96491`
  - Condition: DFU (Diabetic Foot Ulcer) episode
  - MAC Region: "Noridian Healthcare Solutions (MAC J-E)"

- **Patient 2 - Michael Hudson**:
  - Patient ID: `52a391af-b38e-4b94-ac06-b3e229d56f8d`
  - MRN: `MH001`
  - Condition: DFU (Diabetic Foot Ulcer) episode
  - MAC Region: "Noridian Healthcare Solutions (MAC J-E)"

Both test accounts are configured with proper MAC region assignments to ensure accurate LCD policy selection during eligibility analysis.

### MAC Region Bug Fix (September 2025)

A critical bug was identified and resolved related to MAC region data handling:

#### Issues Resolved
- **Fallback Masking**: Removed `|| 'default'` fallbacks that were masking missing MAC region data, preventing proper error detection
- **Validation Enhancement**: Added proper validation with 422 error responses when MAC regions are missing from patient records
- **TypeScript Safety**: Fixed TypeScript errors related to null/undefined MAC region handling to prevent runtime issues

#### Technical Changes
- Eliminated default value assignments that were hiding data quality issues
- Implemented explicit validation checks in eligibility analysis endpoints
- Enhanced error messaging to clearly indicate when MAC region data is required but missing
- Added type guards and null checks to prevent undefined MAC region processing

### Testing Guidance

#### Using Test Accounts
1. **LCD Policy Selection Testing**: Use either test patient account to verify that MAC region-specific policies are correctly identified and applied
2. **Error Validation Testing**: Temporarily remove MAC region data to test 422 error responses and validation messaging
3. **Policy Matching Testing**: Both accounts use Noridian Healthcare Solutions (MAC J-E) region for consistent testing of J-E jurisdiction policies

#### Expected Results
- **Proper MAC Region Set**: Eligibility analysis should correctly identify and apply MAC J-E specific LCD policies
- **Missing MAC Region**: System should return 422 error with clear messaging about required MAC region data
- **Policy Database Queries**: Should filter to relevant jurisdiction-specific policies when MAC region is properly set

#### Available MAC Regions in Policy Database
The system supports all Medicare Administrative Contractor regions:
- **MAC J-E**: Noridian Healthcare Solutions (test accounts use this region)
- **MAC J-F**: Noridian Healthcare Solutions  
- **MAC J-H**: Novitas Solutions
- **MAC J-J**: Palmetto GBA
- **MAC J-K**: WPS Government Health Administrators
- **MAC J-L**: CGS Administrators
- **MAC J-M**: First Coast Service Options
- **MAC J-N**: National Government Services

Each MAC region has specific LCD policies that apply to their geographic jurisdiction, making proper MAC region assignment critical for accurate eligibility analysis.

## Recent Changes

### Navigation Pane Restructuring (September 22, 2025)

Redesigned the sidebar navigation to improve user workflow and organization:

#### Navigation Structure Updates
- **Main Navigation Items**: Reordered to follow clinical workflow:
  1. Dashboard
  2. PDF Upload
  3. Patients 
  4. Episodes
  5. Encounters
  6. Eligibility Analysis
  7. Document Generation

- **"Other" Dropdown Section**: Consolidated secondary features into collapsible dropdown:
  - Policy Database
  - Audit Logs
  - System Validation
  - Settings
  - Analytics Dashboard
  - Reports & Exports

#### Technical Implementation
- **Collapsible Component**: Used Radix UI Collapsible for smooth dropdown functionality
- **Persistent Navigation**: Sidebar remains consistent across all application pages
- **Visual Indicators**: ChevronRight/ChevronDown icons show dropdown state
- **Indented Styling**: Dropdown items use smaller icons (16px) and left padding for hierarchy
- **Active State Management**: Maintains active navigation state across main and dropdown items

#### User Experience Improvements
- **Workflow Optimization**: Main navigation follows typical clinic workflow from patient intake to documentation
- **Reduced Clutter**: Secondary administrative functions organized under "Other" dropdown
- **Consistent Access**: Navigation structure preserved across all pages for reliable user experience

### Episode Detail Workspace Implementation (September 21, 2025)

Successfully implemented the comprehensive Episode Detail Workspace as the foundation for the clinical workflow system:

#### Core Features Delivered
- **Episode Detail Route**: New `/episodes/:episodeId` route providing dedicated workspace for clinical episode management
- **6-Tab Clinical Interface**: Complete tabbed workspace including:
  - Timeline & Metrics: Wound progression tracking and Medicare 20% reduction monitoring
  - Conservative Care: Treatment history and effectiveness scoring
  - Diagnosis: ICD-10 validation with clinical recommendations
  - Vascular & Diabetic: Specialized assessments for diabetes and vascular conditions
  - Products: LCD policy compliance and product application workflow
  - Compliance: Medicare requirements tracking with traffic light indicators

#### Technical Implementation
- **Authentication Integration**: Proper route protection and authentication flow
- **Data Loading**: Real-time data fetching from multiple API endpoints using TanStack Query
- **Error Handling**: Comprehensive error states, loading indicators, and retry mechanisms
- **Responsive Design**: Mobile-responsive clinical workspace following existing design patterns
- **Testing Infrastructure**: Full data-testid coverage for automated testing and quality assurance

#### Bug Fixes Applied
- **Database Connectivity**: Resolved critical Neon DB connection timeouts and double-response errors
- **Routing Configuration**: Fixed 404 errors on protected routes and authentication redirects
- **Patient Selector**: Enhanced Create Episode modal with proper loading states and empty data handling
- **Audit Logging**: Implemented fire-and-forget pattern to prevent response blocking

#### Clinical Workflow Foundation
This workspace provides the foundation for Priority 2-4 features including:
- Real-time compliance monitoring and Medicare LCD tracking
- Clinical decision support with automated recommendations
- Analytics dashboard with outcome metrics and reporting
- Automated documentation generation with LCD policy citations

The Episode Detail Workspace enables clinicians to manage complete wound care episodes within a unified interface, supporting the pre-determination workflow with comprehensive data visualization and clinical decision support tools.

## External Dependencies

### CMS Integration (Updated September 2025)
- **CMS Coverage API**: Real-time Medicare LCD policy integration via api.coverage.cms.gov
- **No Authentication Required**: Public API access for LCD policies and contractor data
- **973 Active LCDs**: Live integration with Medicare Local Coverage Determinations
- **Production Ready**: Enhanced pagination, retry logic, and robust error handling
- **Wound Care Filtering**: Successfully identifies relevant policies (9% match rate on real data)

### Database Services  
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **pgvector**: PostgreSQL extension for vector similarity search and embeddings storage

### AI and Machine Learning
- **OpenAI API**: GPT models for eligibility analysis and letter generation
- **Azure OpenAI**: HIPAA-eligible alternative with data processing agreements
- **Ollama**: Local LLM deployment option for privacy-sensitive environments

### Authentication and Security
- **Replit Auth**: OAuth2/OIDC authentication provider with multi-tenant support
- **Node.js Crypto**: Built-in cryptographic functions for PHI encryption
- **Express Session**: Session management with PostgreSQL persistence

### Development and Build Tools
- **Vite**: Frontend build tool with HMR and development server
- **Drizzle Kit**: Database schema management and migration tool
- **ESBuild**: Backend bundling for production deployment
- **TypeScript**: Type system for both frontend and backend code

### UI and Component Libraries
- **Radix UI**: Unstyled, accessible component primitives
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Lucide React**: Icon library with consistent design system
- **React Hook Form**: Form validation and state management
- **TanStack Query**: Server state management and caching

### Document and File Processing
- **React-PDF**: Client-side PDF generation and manipulation
- **docx**: Microsoft Word document generation for export functionality
- **date-fns**: Date manipulation and formatting utilities

The application is designed to be cloud-agnostic with Docker support, allowing deployment flexibility while maintaining HIPAA compliance requirements through proper encryption, audit logging, and access controls.