# WoundCare Pre-Determination Portal

## Overview
This project is a HIPAA-compliant pre-determination portal for wound care clinics. It leverages AI to analyze patient encounters against Medicare LCD policies, determines eligibility for skin substitutes and cellular tissue products (CTPs), and automates the generation of compliant medical documentation. The system supports multi-tenant clinic accounts with role-based access, encrypted PHI storage, comprehensive audit logging, and integrates with both cloud-based and local LLM providers. Its primary purpose is to streamline the pre-determination process for clinics.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
### UI/UX Decisions
The frontend uses React with TypeScript and Vite, styled with Shadcn/ui (built on Radix UI) and Tailwind CSS. Wouter handles client-side routing, React Hook Form with Zod manages forms, and TanStack Query is used for server state management.

### Technical Implementations
The backend is built with Node.js and Express.js using TypeScript. Drizzle ORM provides type-safe database operations, while Replit Auth (with OpenID Connect/OAuth2) handles authentication. Sessions are managed via Express sessions stored in PostgreSQL. RESTful endpoints ensure consistent API design.

### Feature Specifications
- **Eligibility Analysis**: AI-powered analysis of patient encounters against Medicare LCD policies, identifying gaps and tracking citations.
- **Document Generation**: PDF generation via React-PDF and DOCX export via the `docx` package, using configurable templates and automatic citation linking.
- **PHI Management**: AES-256-GCM encryption for sensitive patient data at rest, with a single-key design and cached key derivation for performance.
- **Multi-tenancy & RBAC**: Supports multiple clinic accounts with role-based access control (Admin, Physician, Staff).
- **Audit Logging**: Comprehensive, signed audit trails of all user actions.
- **AI Integration**: Utilizes OpenAI API (with Azure OpenAI fallback) and supports local LLM deployment via Ollama.
- **RAG System**: Policy database with embedding-based retrieval using `pgvector` and automated nightly updates for Medicare LCD policies.

### System Design Choices
- **Database**: PostgreSQL with Neon serverless connection pooling, Drizzle Kit for migrations, and `pgvector` for vector storage.
- **Authentication**: Replit Auth with OIDC/OAuth2, HTTP-only cookies, CSRF protection, and TOTP support.
- **Error Handling**: Consistent error handling and logging across RESTful endpoints.
- **Performance Optimization**: Optimized PHI encryption to reduce decryption attempts and eliminate redundant key derivation.
- **Navigation**: Restructured sidebar navigation to follow clinical workflow (Dashboard, PDF Upload, Patients, Episodes, Encounters, Eligibility Analysis, Document Generation) with secondary features consolidated under an "Other" dropdown.
- **Episode Detail Workspace**: Dedicated `/episodes/:episodeId` route with a 6-tab clinical interface for timeline & metrics, conservative care, diagnosis, vascular & diabetic assessments, product compliance, and overall compliance tracking.

## External Dependencies
- **CMS Integration**: api.coverage.cms.gov for real-time Medicare LCD policy integration.
- **Database Services**: Neon Database (PostgreSQL), pgvector.
- **AI/ML**: OpenAI API, Azure OpenAI, Ollama.
- **Authentication/Security**: Replit Auth, Node.js Crypto, Express Session.
- **Development/Build Tools**: Vite, Drizzle Kit, ESBuild, TypeScript.
- **UI/Components**: Radix UI, Tailwind CSS, Lucide React, React Hook Form, TanStack Query.
- **Document/File Processing**: React-PDF, docx, date-fns.