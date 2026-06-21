# PAAX AI — System Architecture Overview

> Arsitektur sistem PAAX AI v0.3: layered architecture dengan pemisahan jelas
> antara frontend, API layer, services, dan storage.

---

## 1. High-Level Architecture

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Web["🌐 Next.js Web App\n(apps/web)"]
        Mobile["📱 Mobile App\n(Future - PWA)"]
    end

    subgraph API["API Gateway Layer"]
        NextAPI["Next.js API Routes\n(/api/*)"]
    end

    subgraph Services["Service Layer"]
        Core["🔧 Core Engine\n(FastAPI / Python)\nservices/core-engine"]
        Orch["🤖 AI Orchestrator\n(Genkit / TypeScript)\nservices/ai-orchestrator"]
        DocIntel["📄 Document Intelligence\n(Cloud Functions)\nservices/document-intelligence"]
        Site["🏗️ Site Agent\n(Cloud Functions)\nservices/site-agent"]
    end

    subgraph Storage["Storage Layer"]
        Firestore["🔥 Firestore\n(Database)"]
        GCS["☁️ Cloud Storage\n(Files)"]
        Cache["⚡ Redis / Memory\n(Cache - Future)"]
    end

    subgraph External["External Services"]
        Gemini["🧠 Gemini API\n(AI Models)"]
        Maps["🗺️ Google Maps\n(Geocoding)"]
    end

    Web --> NextAPI
    Mobile --> NextAPI
    NextAPI --> Core
    NextAPI --> Orch
    NextAPI --> DocIntel

    Core --> Firestore
    Core --> GCS
    Orch --> Gemini
    Orch --> Core
    Orch --> Firestore
    DocIntel --> GCS
    DocIntel --> Gemini
    DocIntel --> Firestore
    Site --> Firestore
    Site --> Gemini

    style Client fill:#e8f5e9
    style API fill:#e3f2fd
    style Services fill:#fff3e0
    style Storage fill:#f3e5f5
    style External fill:#fce4ec
```

---

## 2. Service Boundaries

Setiap service memiliki tanggung jawab yang jelas dan tidak overlap:

### 2.1 Frontend (Next.js) — `apps/web/`

**Responsibility**: Display, interaction, routing

```
✅ DOES:
- Render UI components
- Handle user interactions
- Client-side routing (/project/:id/*)
- Form validation (client-side)
- Real-time Firestore subscriptions (read-only)
- File upload to Cloud Storage (via signed URLs)
- Call API routes for mutations

❌ DOES NOT:
- Direct database writes (except real-time reads)
- Business logic calculations
- AI model calls
- File processing
```

### 2.2 Core Engine (FastAPI) — `services/core-engine/`

**Responsibility**: Deterministic calculation, data processing, export

```
✅ DOES:
- RAB calculation (volume × HSP)
- AHSP lookup and computation
- Schedule generation (CPM algorithm)
- Excel export (template-based)
- Data validation (server-side)
- Harga satuan management

❌ DOES NOT:
- AI/LLM calls
- File upload handling
- User authentication
- Frontend rendering
```

### 2.3 AI Orchestrator (Genkit) — `services/ai-orchestrator/`

**Responsibility**: AI flow management, tool calling, chat

```
✅ DOES:
- Engineering chat with context
- RAB advisory analysis
- Schedule advisory
- Drawing understanding coordination
- Tool calling to Core Engine
- Prompt management
- Context assembly from project data

❌ DOES NOT:
- Direct calculation (delegates to Core Engine)
- File processing (delegates to Document Intelligence)
- Database schema management
- User authentication
```

### 2.4 Document Intelligence — `services/document-intelligence/`

**Responsibility**: File processing, OCR, extraction

```
✅ DOES:
- PDF page splitting
- OCR processing
- Page classification (via Gemini Vision)
- Dimension extraction
- Quantity candidate generation
- File format conversion

❌ DOES NOT:
- RAB calculation
- User-facing chat
- Schedule generation
- Direct user interaction
```

### 2.5 Site Agent — `services/site-agent/`

**Responsibility**: Field monitoring, reporting

```
✅ DOES:
- Daily report analysis
- Progress vs plan comparison
- Photo analysis (Gemini Vision)
- Anomaly detection
- Auto-generated reports
- Weather impact assessment

❌ DOES NOT:
- RAB modification
- File upload processing
- Schedule recalculation (requests Core Engine)
```

---

## 3. Communication Patterns

```mermaid
sequenceDiagram
    participant User
    participant Web as Next.js Frontend
    participant API as API Routes
    participant Core as Core Engine
    participant Orch as AI Orchestrator
    participant DI as Doc Intelligence
    participant DB as Firestore
    participant GCS as Cloud Storage

    Note over User,GCS: Pattern 1: RAB Generation
    User->>Web: Click "Generate RAB"
    Web->>API: POST /api/rab/generate
    API->>Core: POST /rab/generate
    Core->>DB: Read project data + volumes
    Core->>Core: Calculate RAB (deterministic)
    Core->>DB: Write RAB version
    Core-->>API: RAB result
    API-->>Web: Response
    Web-->>User: Display RAB

    Note over User,GCS: Pattern 2: AI Chat
    User->>Web: Send chat message
    Web->>API: POST /api/chat
    API->>Orch: POST /flow/engineering-chat
    Orch->>DB: Load project context
    Orch->>Core: Tool call (if needed)
    Core-->>Orch: Tool result
    Orch-->>API: AI response (streamed)
    API-->>Web: SSE stream
    Web-->>User: Display response

    Note over User,GCS: Pattern 3: Document Upload
    User->>Web: Upload PDF
    Web->>GCS: Upload via signed URL
    Web->>DB: Create file record
    DB->>DI: Trigger (Firestore onCreate)
    DI->>GCS: Download & process
    DI->>DB: Write extraction results
    DB-->>Web: Real-time update
    Web-->>User: Show results
```

---

## 4. Data Flow Architecture

```mermaid
flowchart LR
    subgraph Input["Input Data"]
        Files["📄 Project Files\n(PDF, DWG, JPG)"]
        Manual["✏️ Manual Input\n(volumes, specs)"]
        Chat["💬 Chat Messages"]
        SiteData["📸 Site Reports\n(photos, notes)"]
    end

    subgraph Processing["Processing"]
        DI["Document\nIntelligence"]
        Core["Core\nEngine"]
        Orch["AI\nOrchestrator"]
        Site["Site\nAgent"]
    end

    subgraph Output["Output Data"]
        RAB["📊 RAB\n(versions)"]
        Schedule["📅 Jadwal\n(scenarios)"]
        Insights["💡 AI Insights\n(recommendations)"]
        Reports["📋 Reports\n(daily/weekly)"]
        Exports["📁 Excel/PDF\n(exports)"]
    end

    Files --> DI
    DI --> Core
    Manual --> Core
    Core --> RAB
    Core --> Schedule
    Core --> Exports
    Chat --> Orch
    Orch --> Insights
    RAB --> Orch
    SiteData --> Site
    Site --> Reports
```

---

## 5. Deployment Architecture

```mermaid
graph TB
    subgraph GCP["Google Cloud Platform"]
        subgraph CloudRun["Cloud Run"]
            CoreDeploy["Core Engine\n(Python container)"]
            OrchDeploy["AI Orchestrator\n(Node.js container)"]
        end

        subgraph Firebase["Firebase"]
            Hosting["Firebase Hosting\n(Next.js SSR)"]
            Functions["Cloud Functions\n(Doc Intel + Site Agent)"]
            FirestoreDB["Firestore\n(Database)"]
            Auth["Firebase Auth\n(Authentication)"]
        end

        subgraph CloudServices["Cloud Services"]
            Storage["Cloud Storage\n(Files)"]
            SecretMgr["Secret Manager\n(API Keys)"]
            Logging["Cloud Logging\n(Monitoring)"]
        end

        subgraph AI["AI Services"]
            GeminiAPI["Gemini API\n(gemini-2.0-flash)"]
            GeminiVision["Gemini Vision\n(gemini-2.0-flash)"]
        end
    end

    Hosting --> CoreDeploy
    Hosting --> OrchDeploy
    Functions --> Storage
    Functions --> GeminiVision
    OrchDeploy --> GeminiAPI
    CoreDeploy --> FirestoreDB
    OrchDeploy --> FirestoreDB
    OrchDeploy --> CoreDeploy

    style GCP fill:#f0f0f0
    style CloudRun fill:#e3f2fd
    style Firebase fill:#fff3e0
    style CloudServices fill:#e8f5e9
    style AI fill:#fce4ec
```

---

## 6. Technology Stack

### 6.1 Frontend

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Framework | Next.js | 15.x | SSR + routing |
| Language | TypeScript | 5.x | Type safety |
| UI Library | shadcn/ui | latest | Component library |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| State | Zustand | 5.x | Client state management |
| Charts | Recharts | 2.x | Data visualization |
| Gantt | Custom | — | Schedule visualization |

### 6.2 Core Engine

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Framework | FastAPI | 0.115+ | REST API |
| Language | Python | 3.12+ | Calculation logic |
| Validation | Pydantic | 2.x | Schema validation |
| Excel | openpyxl | 3.x | Excel generation |
| Database | firebase-admin | 6.x | Firestore access |
| Testing | pytest | 8.x | Unit/integration tests |

### 6.3 AI Orchestrator

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Framework | Genkit | 1.x | AI flow framework |
| Language | TypeScript | 5.x | Type-safe flows |
| AI Model | Gemini 2.0 Flash | latest | LLM inference |
| Runtime | Node.js | 22.x | Server runtime |

### 6.4 Shared Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@paax/types` | `packages/types/` | Shared TypeScript type definitions |
| `@paax/schemas` | `packages/schemas/` | Zod validation schemas |
| `@paax/utils` | `packages/utils/` | Common utility functions |
| `@paax/config` | `packages/config/` | Shared configuration |
| `@paax/ui` | `packages/ui/` | Shared UI components |

---

## 7. Security Architecture

```mermaid
flowchart TD
    A["User Request"] --> B["Firebase Auth\n(JWT Token)"]
    B --> C{"Token Valid?"}
    C -->|No| D["401 Unauthorized"]
    C -->|Yes| E["API Route\n(extract user + org)"]
    E --> F{"Project Access?"}
    F -->|No| G["403 Forbidden"]
    F -->|Yes| H["Service Call\nwith context"]
    H --> I["Service processes\nwith scoped data"]
    I --> J["Firestore Security Rules\nenforce at DB level"]
```

### Key Security Principles:

1. **Authentication**: Firebase Auth (email/password + Google OAuth)
2. **Authorization**: Project-level RBAC (Owner, Editor, Viewer)
3. **Data Isolation**: Firestore security rules scope queries to organization
4. **File Access**: Signed URLs with expiration for Cloud Storage
5. **Secret Management**: Google Secret Manager for API keys
6. **AI Safety**: Prompt injection mitigation in AI Orchestrator
7. **Audit Trail**: All mutations logged in `usageLogs` collection

---

## 8. Scalability Considerations

| Aspect | Current (MVP) | Future Scale |
|--------|---------------|--------------|
| Users | ~100 | 10,000+ |
| Projects | ~500 | 50,000+ |
| File Storage | 100 GB | 10 TB+ |
| AI Requests | 1,000/day | 100,000/day |
| Compute | Cloud Run (min instances: 0) | Cloud Run (auto-scale) |
| Database | Firestore (free tier) | Firestore (paid tier + indexes) |
| Caching | None | Redis / Memorystore |

---

*Arsitektur ini dirancang untuk skala MVP dan bisa di-scale secara horizontal menggunakan Google Cloud infrastructure.*
