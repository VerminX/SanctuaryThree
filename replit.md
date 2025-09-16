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

## External Dependencies

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