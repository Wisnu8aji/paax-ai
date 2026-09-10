<div align="center">

# PAAX

### Project Analytics and eXecution

**An agentic engineering workspace for civil engineering, construction planning, quantity and cost work, technical drawings, and site execution.**

PAAX is being built as a desktop-first environment where an engineering agent can understand project context, work with evidence, use tools, execute longer tasks, and remain under the control of the engineer responsible for the result.

</div>

---

| Project | Current state |
| --- | --- |
| Product line | Active development — `0.6.0` |
| Primary focus | Agent foundation, Command Room, desktop runtime |
| Engineering focus | Drawings, quantities, RAB/BOQ, schedules, documents, site workflows |
| Product model | Desktop-first, project-aware, evidence-oriented |
| Source policy | Implementation remains private during active research and development |
| Public repository | Product overview, development status, roadmap, and project direction |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Why PAAX Exists](#2-why-paax-exists)
3. [Product Map](#3-product-map)
4. [Command Room](#4-command-room)
5. [Project Studio](#5-project-studio)
6. [Drawing Intelligence](#6-drawing-intelligence)
7. [Cost, Quantity, RAB and BOQ](#7-cost-quantity-rab-and-boq)
8. [Schedule Planning and Project Controls](#8-schedule-planning-and-project-controls)
9. [Site Agent](#9-site-agent)
10. [Engineering Data and Knowledge](#10-engineering-data-and-knowledge)
11. [Documents, Reports and Deliverables](#11-documents-reports-and-deliverables)
12. [How the Modules Can Work Together](#12-how-the-modules-can-work-together)
13. [API and Integration Direction](#13-api-and-integration-direction)
14. [Development Status](#14-development-status)
15. [Roadmap](#15-roadmap)
16. [Design Principles](#16-design-principles)
17. [Who PAAX Is For](#17-who-paax-is-for)
18. [Public Repository Policy](#18-public-repository-policy)
19. [Project Position](#19-project-position)

---

## Status Legend

PAAX is an active research and development project. The terms below are used deliberately so unfinished work is not presented as complete.

| Status | Meaning |
| --- | --- |
| **Available** | A working foundation or usable implementation exists in the current development line. |
| **In Progress** | A meaningful implementation exists, but the workflow is still being expanded, hardened, or connected end-to-end. |
| **Planned** | The capability is part of the intended product direction but is not presented as a finished feature. |
| **Research** | The problem is being investigated and may change substantially before becoming a product feature. |

---

# 1. Overview

PAAX — **Project Analytics and eXecution** — is an independent project exploring how an AI agent can become a real working layer for civil engineering and construction rather than remaining only a conversational assistant.

Engineering work is rarely contained in one prompt, one drawing, one spreadsheet, or one calculation. A single project may involve:

- architectural and structural drawings;
- specifications and technical documents;
- RAB and Bill of Quantities data;
- AHSP, material, labor, and equipment rates;
- project schedules and S-curves;
- site photographs and daily reports;
- procurement and material readiness;
- progress claims and quantity verification;
- revisions, comments, approvals, and evidence;
- project decisions that depend on information created days or months earlier.

A useful engineering agent therefore needs more than a chat box. It needs a project workspace, task continuity, document understanding, engineering tools, evidence, controlled execution, and a clear boundary between what the system can propose and what a professional must approve.

PAAX is being developed around that requirement.

---

# 2. Why PAAX Exists

Civil engineering and construction teams spend a significant amount of time moving information between disconnected tools before the engineering work itself can begin.

A quantity may need to be checked against a drawing. A drawing revision may change a BOQ. A BOQ change may affect the RAB. A RAB item may affect the project schedule. A schedule change may alter material procurement dates. Site progress may then require the schedule, cost forecast, and upcoming work plan to be updated again.

These are not isolated tasks. They are one project system.

PAAX is intended to become a workspace where the agent can understand those relationships and assist across the lifecycle without hiding evidence or replacing professional responsibility.

The target is a system that can move through this chain:

```text
Project context
    -> drawings and documents
    -> detected engineering information
    -> reviewed quantities
    -> BOQ / RAB
    -> schedule and work packages
    -> procurement and site readiness
    -> field progress and evidence
    -> cost / schedule feedback
    -> reports, warnings, and next actions
```

---

# 3. Product Map

PAAX is being organized as a connected engineering workspace rather than a collection of unrelated AI features.

| Product area | Purpose | Current direction |
| --- | --- | --- |
| **Desktop Application** | Persistent professional workspace and local project environment | **Available / In Progress** |
| **Command Room** | Main agent interaction and execution surface | **Available / In Progress** |
| **Chat** | Project-aware analysis, questioning, planning, evidence review | **Available / In Progress** |
| **Works** | Longer multi-step work, tools, files, execution, artifacts, recovery | **Available / In Progress** |
| **Project Studio** | Engineering project workspace connecting technical modules | **In Progress** |
| **Drawing Intelligence** | Read, organize, inspect, measure, and structure drawing information | **Available / In Progress** |
| **Cost & Quantity** | Quantities, AHSP/HSP, RAB, BOQ, cost analysis, exports | **Available / In Progress** |
| **Schedule Planning** | S-curve, scenarios, work sequencing, project controls | **Available / In Progress** |
| **Site Agent** | Field workspace, readiness, progress, reminders, and monitoring | **Planned** |
| **Files & Documents** | Project evidence and document context | **In Progress** |
| **Reports** | Structured technical and management reporting | **Planned / In Progress** |
| **Collaboration** | Roles, review, comments, assignments, and project activity | **Planned** |
| **Engineering Data** | AHSP, prices, references, project facts, and future domain databases | **In Progress / Research** |

The immediate priority remains the **agent and Command Room foundation**. Domain automation is being connected progressively rather than being presented as complete before it is dependable.

---

# 4. Command Room

The **Command Room** is the central agent workspace in PAAX.

The objective is to let an engineer move from discussion to execution without losing project context. A conversation can begin as a question, become an investigation, turn into a plan, use files and tools, produce an artifact, require approval, and continue until the task is actually complete.

## 4.1 Chat

**Status: Available / In Progress**

Chat is the reasoning and communication surface of the Command Room. It is being developed for more than question-and-answer interaction.

Current and developing capabilities include:

- persistent conversations and project-oriented sessions;
- project and folder context selection;
- file and document references;
- source and evidence presentation;
- tool-call results presented inside the conversation;
- structured plans and task progress;
- clarification and approval steps when a task requires user input;
- artifacts generated during longer work;
- search and citation-oriented response surfaces;
- conversation history and continuity;
- controlled access policies for actions that should not run silently;
- integration with Works when the task requires execution rather than only explanation.

The long-term engineering objective is for Chat to understand the relationship between a user's question and the active project data. For example, a cost question should be able to refer to the relevant RAB and quantities; a drawing question should be able to refer to drawing evidence; a schedule question should be able to inspect the current plan and related site information.

## 4.2 Works

**Status: Available / In Progress**

Works is the execution-oriented side of the Command Room.

It is intended for tasks that should continue beyond a response, including:

- multi-step task execution;
- working with local project files;
- reading and producing project artifacts;
- using supported tools and command-line workflows;
- maintaining task state during longer operations;
- showing progress rather than hiding execution behind a loading state;
- handling approval boundaries before consequential actions;
- recovering from component or process failure without losing the entire PAAX session;
- keeping work attached to the originating project and conversation;
- returning completed outputs to the user for review.

The intended relationship is simple:

> **Chat is where the engineer and PAAX reason together. Works is where PAAX carries approved work forward.**

## 4.3 Why the Command Room matters

A civil-engineering agent becomes substantially more useful when it can connect reasoning and action. The same workspace can eventually support workflows such as:

1. inspect a drawing package;
2. identify missing or conflicting information;
3. ask the engineer for clarification;
4. perform a reviewed takeoff;
5. update a BOQ proposal;
6. recalculate a cost scenario;
7. prepare a report or spreadsheet;
8. preserve the evidence and assumptions used;
9. continue the task later without reconstructing the entire context.

---

# 5. Project Studio

**Status: In Progress**

Project Studio is the engineering workspace for project-specific technical work. It is intended to connect drawing analysis, quantity and cost work, schedule planning, files, and future site information through a shared project context.

The current product direction separates Project Studio into major working areas rather than forcing every activity into Chat.

| Studio area | Primary responsibility |
| --- | --- |
| **Drawing Intelligence** | Technical drawings, sheets, drawing evidence, measurement, takeoff preparation |
| **Cost & Quantity Analysis** | Quantities, BOQ, RAB, AHSP/HSP, cost structure, scenario analysis |
| **Schedule Planning** | S-curve, work sequencing, duration, scenario simulation, future project controls |
| **Project Overview** | Project-level context, key information, warnings, and navigation |

Project Studio is not intended to isolate these modules. The larger goal is the opposite: each module should be able to contribute structured information to the project context that the agent can use elsewhere.

---

# 6. Drawing Intelligence

**Status: Available / In Progress**

Drawing Intelligence is one of the most developed engineering-specific areas in PAAX. Its purpose is to turn technical drawings from passive files into reviewable project evidence and structured engineering information.

## 6.1 Current foundation

The current development line already contains a substantial drawing workspace foundation, including work around:

- PDF drawing upload and project association;
- multi-sheet drawing navigation;
- high-resolution PDF viewing and tiled rendering;
- sheet thumbnails and drawing package navigation;
- vector text and geometric information extraction from supported PDFs;
- table and drawing-notation interpretation pipelines;
- drawing grid and dimensional evidence reconstruction;
- multi-page analysis and consolidation;
- structured drawing transcription for downstream use;
- evidence and review states rather than silently accepting every detection;
- drawing analysis setup and status visibility;
- quantity readiness and takeoff review surfaces;
- measurement and takeoff inspection tools;
- proposal review before downstream handoff;
- project-bound drawing context for other PAAX modules.

## 6.2 Canonical drawing understanding

A central direction is to create a structured interpretation of the drawing package that can become a shared project fact layer instead of forcing every feature to re-read the original drawing independently.

The system is being developed to identify and organize information such as:

- sheet identity and drawing discipline;
- zones, levels, grids, and dimensional relationships;
- structural or architectural element references;
- type tables and schedules;
- material or reinforcement notation where supported;
- drawing assumptions and unresolved ambiguity;
- evidence location on the originating sheet;
- confidence and review status.

The important principle is that uncertainty should remain visible. A drawing result that needs review should be marked as such rather than converted into an authoritative quantity simply because an AI model produced an answer.

## 6.3 Measurement and takeoff direction

PAAX is being developed toward a mixed workflow where deterministic geometry, document extraction, and AI-assisted interpretation can cooperate.

| Capability | Direction |
| --- | --- |
| PDF/vector geometry extraction | **Available** |
| Multi-sheet project drawing workspace | **Available** |
| Drawing evidence and review workflow | **Available / In Progress** |
| Structured drawing transcription | **Available / In Progress** |
| Concrete, formwork, and reinforcement takeoff paths for supported reviewed data | **Available / In Progress** |
| One-click line / area measurement assistance | **In Progress** |
| Automatic element detection | **In Progress / Research** |
| Automatic scale and measurement interpretation across varied drawing standards | **Research** |
| Scanned drawing / image OCR and vision interpretation | **In Progress / provider-dependent** |
| Cross-sheet relationship reasoning | **In Progress** |
| Revision and drawing-change detection | **Planned** |
| Automatic discrepancy detection between related sheets | **Planned / Research** |
| Automated quantity proposal from complete drawing sets | **Planned / Research** |

## 6.4 Future Drawing Intelligence scope

Longer-term research may include:

- automatic recognition of drawing types and disciplines;
- title-block and revision-table understanding;
- floor-plan, section, elevation, and detail relationship mapping;
- structural member detection and classification;
- wall, room, opening, slab, column, beam, foundation, and finishing recognition;
- symbol and annotation detection;
- automatic scale calibration where evidence is sufficient;
- automatic linear, area, count, surface, and volume measurement proposals;
- detection of incomplete dimensions or inconsistent notation;
- revision comparison and quantity-delta analysis;
- linking drawing changes directly to affected BOQ, RAB, and schedule items;
- creating an evidence trail from every quantity back to the originating sheet.

These directions require continued research across real drawing standards and project types. They are not presented as universally solved problems.

---

# 7. Cost, Quantity, RAB and BOQ

**Status: Available / In Progress**

PAAX is being developed to connect engineering quantities with Indonesian cost-estimating workflows while preserving a clear distinction between agent reasoning and deterministic calculation.

## 7.1 Current foundation

Current development includes work around:

- project RAB editing;
- itemized work sections and WBS-style organization;
- AHSP selection and lookup;
- HSP calculation from defined coefficients and price data;
- quantity and volume inputs;
- subtotal, tax, total, and item-weight calculation through deterministic services;
- cost scenario calculation;
- quantity handoff from supported Drawing Intelligence workflows;
- Excel export with calculation structure intended to remain reviewable;
- project context that can later be used by the agent to explain cost composition.

## 7.2 BOQ direction

The BOQ layer is intended to become the bridge between technical quantity evidence and commercial/cost workflows.

Future capabilities may include:

- building BOQ proposals from reviewed drawing takeoff;
- grouping quantities by work package, zone, floor, discipline, or WBS;
- combining repeated quantities across multiple sheets;
- separating gross quantity, deduction, waste allowance, and payable quantity;
- linking each BOQ line to drawing evidence;
- identifying unpriced or unmapped quantity items;
- comparing BOQ revisions;
- tracking quantity growth or reduction after drawing revisions;
- preparing tender or procurement-oriented quantity schedules;
- reconciling field-installed quantities against planned BOQ quantities.

## 7.3 RAB and estimating direction

The longer-term cost workflow is intended to support more than producing a total value.

Potential capability areas include:

- AHSP-assisted item matching;
- labor, material, and equipment cost composition;
- regional price data;
- alternative method and material scenarios;
- value-engineering comparisons;
- cost sensitivity analysis;
- planned versus committed versus actual cost;
- cost-to-complete forecasting;
- procurement package preparation;
- subcontractor scope comparison;
- cash-flow planning linked to the schedule;
- quantity and price variance alerts;
- explanation of major cost drivers;
- traceability from cost item back to quantity and source evidence.

PAAX should not invent final quantities, rates, or costs when source information is missing. The agent may propose assumptions or alternatives, but authoritative numbers should come from reviewed data and deterministic calculation where appropriate.

---

# 8. Schedule Planning and Project Controls

**Status: Available / In Progress**

PAAX already has a foundation for schedule-oriented engineering calculations and scenario work. The larger objective is to connect time planning with quantity, cost, and eventually field execution.

## 8.1 Current foundation

Current work includes:

- schedule data associated with project work items;
- S-curve generation;
- cumulative weight-based project planning;
- duration inputs;
- sequential and parallel planning scenarios;
- deterministic time-cost scenario simulation;
- project schedule context for future agent reasoning.

## 8.2 Planned project-controls capabilities

Future development may include:

- Gantt planning;
- work breakdown structure and work-package planning;
- predecessor and successor relationships;
- critical path analysis;
- float and schedule-risk visibility;
- weekly and multi-week look-ahead planning;
- milestone tracking;
- baseline versus current schedule comparison;
- planned versus actual progress;
- schedule variance and trend detection;
- forecast completion date;
- earned-value-style project indicators where the required data is available;
- cost and schedule integration;
- resource and equipment readiness;
- procurement dates derived from required-on-site dates and lead times;
- schedule impact analysis after drawing or quantity changes;
- scenario comparison before a revised plan is accepted.

The intent is not for the agent to invent dates. It should reason about alternatives, call the appropriate calculation or project-control tools, and present the result with assumptions visible.

---

# 9. Site Agent

**Status: Planned**

Site Agent is intended to become the field-oriented workspace of PAAX. It has not reached the same maturity as the Command Room or Drawing Intelligence, so the capabilities below are presented as product direction rather than finished functionality.

## 9.1 Site workspace

A future project Site Agent workspace may organize:

- today's planned work;
- active work packages;
- site photographs and evidence;
- daily progress input;
- manpower and equipment information;
- material availability;
- pending inspections;
- open technical issues;
- upcoming activities;
- schedule warnings;
- procurement reminders;
- tasks requiring engineer or manager attention.

## 9.2 Material and procurement readiness

When BOQ/RAB and schedule data are connected, PAAX can reason about when a material will be needed instead of only showing a list of quantities.

Planned directions include:

- material requirement dates from scheduled work;
- reminders before procurement deadlines;
- required-on-site dates based on look-ahead schedules;
- lead-time awareness;
- warnings when an upcoming activity has no confirmed material readiness;
- quantity required versus quantity ordered versus quantity delivered;
- expected consumption compared with installed progress;
- potential shortage or over-ordering indicators;
- delivery sequencing for constrained site storage;
- linkage between material packages and related BOQ/RAB items.

Example future workflow:

```text
Structural wall planned in 12 days
    -> calculate required quantity from reviewed project data
    -> check material readiness and procurement status
    -> account for supplier lead time
    -> warn before the latest safe order date
    -> confirm delivery before work package starts
    -> compare actual consumption with installed quantity afterward
```

## 9.3 Work readiness and construction preparation

The Site Agent can eventually evaluate whether an upcoming activity is genuinely ready to start.

Possible readiness checks include:

- approved drawing available;
- latest revision confirmed;
- required material available;
- preceding work complete;
- labor plan available;
- equipment available;
- access or work area available;
- inspection or permit prerequisite complete;
- BOQ/work-package quantity known;
- method statement or supporting technical document available where required.

Instead of issuing a generic reminder, the goal is to provide a reasoned readiness alert explaining what is missing and what should be prepared next.

## 9.4 Daily progress and productivity

Planned field-monitoring capabilities include:

- daily work logs;
- progress photographs;
- actual quantity completed;
- planned quantity for the day;
- daily labor and equipment usage;
- production-rate calculation from verified inputs;
- planned versus actual productivity;
- progress trends over multiple days;
- detection of recurring under-performance;
- estimated effect on upcoming activities;
- suggested recovery scenarios for review.

## 9.5 Project monitoring

As site data becomes available, PAAX may support:

- daily and weekly progress summaries;
- S-curve planned-versus-actual comparison;
- delayed activity warnings;
- quantity variance tracking;
- site issue registers;
- inspection and QA/QC reminders;
- punch-list and completion tracking;
- photographic evidence timeline;
- change-event tracking;
- potential cost and schedule impact notifications;
- upcoming high-risk or high-dependency work packages;
- management summaries generated from verified project data.

The system should remain explicit about evidence quality. A photograph can support a progress assessment, but it should not automatically become the contractual progress percentage without the required human review and project rules.

---

# 10. Engineering Data and Knowledge

**Status: In Progress / Research**

PAAX is intended to connect the agent to structured engineering data rather than relying exclusively on language-model memory.

Data areas include or may include:

| Data area | Purpose |
| --- | --- |
| **AHSP** | Work-item coefficients and estimating references |
| **Regional price data** | Material, labor, and equipment pricing inputs |
| **Project RAB / BOQ** | Project cost and quantity structure |
| **Drawing facts** | Structured information extracted and reviewed from drawings |
| **Schedule data** | Durations, sequencing, milestones, S-curves, future dependencies |
| **Site records** | Progress, photos, quantities, manpower, equipment, issues |
| **Document evidence** | Specifications, reports, correspondence, technical references |
| **Project decisions** | Assumptions, approvals, revisions, and decision history |

The intended principle is straightforward: specialized data should support the agent, but the agent remains the workflow coordinator. A database should not become a rigid workflow that prevents the agent from adapting to the actual project task.

---

# 11. Documents, Reports and Deliverables

## 11.1 Files and document context

**Status: In Progress**

Project files are intended to become evidence that can be used across the workspace rather than being stored as isolated attachments.

The broader direction includes:

- project file organization;
- PDF and spreadsheet ingestion;
- document metadata;
- project association;
- document search and retrieval;
- extracting structured information from supported files;
- linking evidence to agent responses and project decisions;
- maintaining provenance when information is transferred between modules.

## 11.2 Reports

**Status: Planned / In Progress**

Potential report outputs include:

- daily site reports;
- weekly progress summaries;
- quantity reports;
- RAB and cost summaries;
- schedule reports;
- planned-versus-actual progress reports;
- material readiness reports;
- issue and warning summaries;
- engineering review notes;
- project management summaries.

Where possible, numeric content should be generated from the underlying project data and calculation services, while the agent focuses on interpretation, explanation, exceptions, and recommended next actions.

## 11.3 Deliverables

Current and future output paths include:

- Excel workbooks;
- structured tables;
- reviewed quantity schedules;
- RAB/BOQ outputs;
- reports;
- project artifacts created through Works;
- future PDF and project-control deliverables.

---

# 12. How the Modules Can Work Together

The larger value of PAAX is in the connection between modules.

## 12.1 Drawing to RAB

1. Upload a project drawing package.
2. Drawing Intelligence identifies supported text, geometry, tables, grids, and element information.
3. Uncertain results are marked for review.
4. The engineer reviews or corrects the extracted information.
5. Deterministic tools calculate supported quantities.
6. Quantities become BOQ or RAB proposals.
7. AHSP and price data are mapped or selected.
8. PAAX calculates the resulting cost structure.
9. The agent explains major cost drivers and unresolved items.

## 12.2 RAB to Schedule

1. RAB/BOQ work items provide a structured project scope.
2. Durations and sequencing are added or proposed.
3. Schedule tools create an S-curve and scenarios.
4. The agent can explain the difference between alternatives.
5. Approved planning data becomes the basis for project monitoring.

## 12.3 Schedule to Site Agent

1. Upcoming activities are read from the current plan.
2. Required materials and quantities are associated with those activities.
3. Procurement lead times are considered.
4. Site Agent warns when required material or prerequisites are not ready.
5. Daily field progress is collected.
6. Actual progress is compared with the plan.
7. The agent identifies emerging delay or productivity trends.
8. Recovery options can be simulated before the engineer changes the plan.

## 12.4 Drawing revision to project impact

A future revision workflow may allow PAAX to trace a drawing change through the project:

```text
New drawing revision
    -> changed element detected
    -> quantity delta proposed
    -> BOQ / RAB impact calculated
    -> affected schedule activity identified
    -> material requirement recalculated
    -> site team warned if the changed work is approaching
    -> report records the evidence and impact
```

This end-to-end relationship is one of the major long-term research directions of PAAX.

---

# 13. API and Integration Direction

**Status: In Progress / Research**

PAAX is being designed so major engineering capabilities can be exposed as controlled tools rather than being permanently coupled to a single user interface.

The public project direction includes several integration categories.

| Integration area | Intended use |
| --- | --- |
| **Project data** | Projects, project context, metadata, status, structured facts |
| **Documents** | Upload, parse, inspect, retrieve, and reference project evidence |
| **Drawing Intelligence** | Drawing analysis, sheet context, review state, measurement and takeoff data |
| **Quantity / BOQ** | Quantity structures, reviewed takeoff, grouping, revision comparison |
| **RAB / Cost** | AHSP/HSP, cost calculation, scenario comparison, export |
| **Schedule** | S-curves, duration scenarios, future dependencies and critical-path data |
| **Site data** | Progress, photos, readiness, material status, issues, inspections |
| **Agent tools** | Controlled actions available to Chat and Works |
| **Artifacts** | Generated spreadsheets, reports, files, and other project outputs |
| **Events and notifications** | Future warnings, progress events, readiness alerts, and external integrations |

Potential integration directions include:

- internal service APIs between PAAX modules;
- external engineering-data connectors;
- file-system and desktop integrations;
- spreadsheet workflows;
- future accounting, procurement, ERP, project-management, or BIM connectors;
- event-driven notifications;
- controlled tool interfaces that can be used by the PAAX agent.

The final integration architecture is intentionally still evolving. The project is prioritizing a dependable agent and evidence model before committing to every external system.

---

# 14. Development Status

The current development line is **0.6.0** and is not presented as a stable production release.

## 14.1 What already has a working foundation

- PAAX desktop application and desktop runtime;
- Command Room application surface;
- Chat interaction foundation;
- Works execution foundation;
- persistent project-oriented agent sessions;
- controlled tool and approval-oriented interaction patterns;
- project context and file interaction foundations;
- Drawing Intelligence workspace and PDF drawing pipeline;
- multi-sheet drawing navigation and rendering;
- structured drawing analysis paths;
- quantity/takeoff review foundations;
- RAB and deterministic cost-calculation services;
- AHSP/HSP-related estimating data paths;
- Excel RAB export foundation;
- S-curve and schedule-scenario foundations;
- evidence-aware and review-oriented engineering workflows;
- runtime recovery and desktop integration work.

## 14.2 What is actively being expanded

- end-to-end Command Room experience;
- deeper project binding across Chat, Works, files, and engineering modules;
- Drawing Intelligence automation and review quality;
- drawing-to-quantity and quantity-to-RAB handoff;
- AI-assisted engineering interpretation with evidence and abstention;
- Project Studio hierarchy and workflow integration;
- cost and quantity analysis experience;
- schedule planning experience;
- document intelligence and project evidence integration;
- product identity, desktop packaging, reliability, and security boundaries.

## 14.3 What remains future work

- mature Site Agent workflows;
- automated procurement readiness;
- material scheduling and shortage warnings;
- daily field productivity monitoring;
- complete Gantt and critical path project controls;
- deeper BOQ automation from varied drawing sets;
- robust drawing revision impact analysis;
- comprehensive collaboration and role workflows;
- production-grade reporting across all modules;
- broad engineering databases and external data integrations;
- additional specialized civil-engineering workflows that still require research.

---

# 15. Roadmap

The roadmap is intentionally capability-oriented rather than tied to public release promises.

| Horizon | Primary objective | Examples |
| --- | --- | --- |
| **Now** | Make the agent foundation dependable | Command Room, Chat, Works, desktop runtime, sessions, tools, files, recovery, approvals |
| **Current expansion** | Connect agent capability to engineering work | Project Studio, Drawing Intelligence, quantity review, RAB, schedule context, evidence |
| **Next** | Improve end-to-end project workflows | drawing-to-BOQ/RAB, deeper schedule planning, richer documents, project warnings |
| **Later** | Connect planning to field execution | Site Agent, material readiness, procurement reminders, daily progress, productivity monitoring |
| **Research** | Build higher-level engineering intelligence | revision impact, automated measurement, multi-discipline reasoning, project forecasting, additional civil-engineering workflows |

Some future capabilities will change as PAAX is tested against more real engineering projects. The project deliberately leaves room for that research instead of presenting an artificial fixed roadmap.

---

# 16. Design Principles

## 16.1 Agent first, automation second

The immediate priority is a strong agent foundation: context, tools, sessions, files, task execution, recovery, and the Command Room experience. More deterministic engineering databases and specialized automation can be connected after the agent itself is dependable.

## 16.2 Evidence before confidence

An engineering answer should have a basis that can be inspected. PAAX is being developed around provenance, evidence, assumptions, confidence, and reviewable outputs.

## 16.3 Human control

The agent should be able to do meaningful work, but consequential actions should remain visible and controllable. Approval and review are part of the operating model rather than afterthoughts.

## 16.4 Deterministic numbers where appropriate

Language models are useful for interpretation and planning, but authoritative engineering quantities and costs should not be invented in free-form text. Where a deterministic calculation is available, PAAX should use it and preserve its inputs.

## 16.5 Project awareness

The same question can have a different answer in a different project. PAAX is therefore being built around project-bound context rather than one global undifferentiated conversation history.

## 16.6 Desktop-first professional workflow

Engineering work commonly depends on local files, persistent state, native tools, long-running operations, and project-specific folders. PAAX is being developed primarily as a desktop workspace for that reason.

## 16.7 Honest development status

PAAX is still being researched and built. A capability that is incomplete should remain labeled incomplete. A research direction should not be marketed as an available feature simply because it is technically imaginable.

---

# 17. Who PAAX Is For

PAAX is being designed around civil engineering and construction workflows, including potential use by:

- civil engineers;
- structural engineers;
- quantity surveyors;
- estimators and cost engineers;
- construction and site engineers;
- project controls and planning engineers;
- consultants and technical reviewers;
- project managers;
- engineering coordinators;
- contractors and subcontractor teams;
- owners and teams managing complex project information.

PAAX is not intended to replace licensed professional responsibility, formal checking, contract administration, applicable engineering standards, or required human approval.

Its role is to make project information easier to work with and to provide a stronger interface for agent-assisted engineering work.

---

# 18. Public Repository Policy

This repository is the **public project page for PAAX**.

The implementation is currently maintained privately while the architecture, security boundaries, agent behavior, and engineering workflows continue to evolve.

The public repository intentionally does not expose:

- private source implementation;
- credentials or runtime configuration;
- internal development material;
- local runtime state;
- private engineering datasets;
- user or project data.

The public surface is intended to explain the product, document its direction, distinguish current capability from future research, and make the project understandable without publishing the active private implementation.

---

# 19. Project Position

PAAX is not being built as a generic chatbot with a civil-engineering label added on top.

The long-term goal is an engineering workspace where an agent can understand the active project, inspect evidence, use engineering tools, work across drawings and documents, carry longer tasks forward, connect quantities to cost and schedules, and eventually assist with the transition from project planning to site execution.

The target remains difficult and requires substantial further research. Some parts already have working foundations, some are actively being integrated, and some are still only future directions.

That distinction is intentional.

**PAAX is being built toward one central idea: an engineering agent should not merely answer questions. It should understand the project, work with evidence, use tools, execute controlled tasks, and remain accountable to the engineer directing it.**
