# PAAX

### A desktop agent workspace for civil engineering and construction

PAAX — **Project Analytics and eXecution** — is an independent project exploring how an AI agent can become a useful working layer for civil engineering and construction rather than remaining only a general-purpose chat interface.

The project is being built around a simple idea: engineering work is not one prompt, one file, or one calculation. Real project work is spread across drawings, spreadsheets, reports, specifications, quantities, schedules, site information, correspondence, and professional judgement. An engineering agent therefore needs more than a text box. It needs a workspace, project context, tools, memory of the task, evidence, and clear boundaries around what it is allowed to do.

PAAX is being developed to become that workspace.

---

## What PAAX is trying to solve

Civil engineering teams often spend significant time moving information between disconnected tools and reconstructing context before the real engineering work can even begin.

A question about a project may depend on several documents. A quantity may need to be checked against a drawing. A report may need information from site records and spreadsheets. A project decision may depend on evidence that was discussed days earlier. Conventional AI chat can help with individual questions, but it usually does not own the surrounding workflow.

PAAX is intended to bring those activities into one project-oriented desktop environment where an agent can:

- understand which project it is working on;
- work with the relevant project information rather than generic context;
- inspect and use supported files and tools;
- keep longer tasks coherent across multiple steps;
- preserve evidence and assumptions;
- make its work reviewable by the engineer;
- move from analysis into controlled execution when appropriate.

The objective is not to make engineering decisions invisible behind automation. The objective is to make an agent genuinely useful while keeping the human engineer in command.

---

## The Command Room

The central product concept in PAAX is the **Command Room**.

Instead of treating AI as a separate assistant that sits outside the project, the Command Room is intended to become the working surface where the engineer can discuss, inspect, direct, and review agent activity in the context of the active project.

It currently revolves around two complementary modes.

### Chat — reason with the project

Chat is the conversational surface for analysis, planning, review, questions, assumptions, evidence, and direction.

The goal is for a conversation to be attached to real project context rather than behaving like an isolated prompt history. When the user asks about a document, a task, a previous decision, or an engineering issue, PAAX should be able to understand where that question belongs and what supporting context matters.

### Works — carry the work forward

Works is the execution-oriented side of the Command Room.

It is being developed for tasks that should continue beyond an answer: working with project files, carrying out multi-step operations, using supported tools, producing outputs, and maintaining progress across a longer job.

The intended relationship is straightforward:

> **Chat is where the engineer and PAAX reason together. Works is where PAAX carries approved work forward.**

---

## PAAX is not intended to be a generic chatbot

The long-term value of PAAX is not in producing more text. It is in connecting an agent to the structure of engineering work.

That means the project is being designed around several principles.

### Evidence before confidence

Engineering answers should have a basis that can be inspected. PAAX is being developed around evidence, provenance, assumptions, and traceable outputs instead of treating fluent language as sufficient proof.

### Human control

An agent may be capable of substantial work, but the user should remain able to understand what is happening and control consequential actions. Review and approval are product concerns, not afterthoughts.

### Project awareness

The same file or question can mean different things in different projects. PAAX is therefore being built around project-bound context and state rather than a single undifferentiated conversation history.

### Agent capability before excessive automation

The immediate priority is a strong agent foundation: context, tools, sessions, files, task execution, recovery, and the Command Room experience. More deterministic engineering databases and specialized automation can be connected later, after the agent itself is dependable.

### Desktop-first working environment

Professional engineering work frequently involves local documents, persistent project state, native applications, and long-running operations. PAAX is therefore being developed primarily as a desktop workspace rather than a disposable browser conversation.

### Honest product boundaries

PAAX is still being researched and developed. Some future engineering directions are known only at a high level and will change as they are tested against real workflows. The project does not present unfinished research as finished product capability.

---

## Who PAAX is for

PAAX is being designed around the needs of people working with civil engineering and construction projects, including:

- civil and structural engineers;
- quantity surveyors and cost engineers;
- construction and site engineers;
- project controls and planning teams;
- consultants and technical reviewers;
- project managers and engineering coordinators;
- owners and teams managing complex project information.

It is not intended to replace professional judgement, engineering responsibility, formal review, or applicable standards. Its role is to make project information easier to work with and to give engineers a more capable interface for agent-assisted work.

---

## What is being built now

The current development effort is intentionally concentrated on the foundation:

- a dedicated PAAX desktop application;
- a coherent Command Room experience;
- reliable Chat and Works workflows;
- project-aware agent context;
- controlled tool use and task execution;
- persistent sessions and continuity;
- document and file interaction;
- evidence-aware workflows;
- runtime recovery and reliability;
- clear boundaries between user actions, agent actions, and project state;
- a consistent PAAX product identity.

The current development line is **0.6.0**. It is an active development line, not a stable production release.

---

## Where PAAX may go next

After the core agent foundation is mature, PAAX can expand further into civil-engineering-specific workflows.

Areas under research or future development may include quantity and cost workflows, RAB support, drawing and document intelligence, engineering reference databases, project controls, structured reporting, field information, and other project-specific capabilities.

These are directions rather than promises. Several of them require substantially more research, engineering validation, and exposure to real project data before the final product design should be fixed.

There are also parts of the broader PAAX vision that are intentionally not fully described publicly yet because they are still being investigated.

---

## Public repository policy

This repository is the **public project page for PAAX**.

The implementation is currently maintained privately while the product architecture and engineering workflows continue to evolve. Source code, internal infrastructure, private development material, runtime state, credentials, and project data are not published here.

This separation is intentional: the public repository explains what PAAX is, why it exists, what is currently being developed, and where the project is heading without turning a work-in-progress internal codebase into the public product surface.

---

## Current status

PAAX is actively being built and tested. The agent foundation, Command Room, desktop runtime, and supporting project context are the present focus.

There is still significant work ahead. The project aims at a difficult target: an agent that can participate meaningfully in engineering workflows while remaining evidence-aware, controllable, and accountable to the engineer using it.

That target requires more than adding AI features to existing software. It requires rethinking how an agent fits into the everyday structure of engineering work.

---

### The direction

**PAAX is being built toward an engineering workspace where the agent does not merely answer questions. It understands the project, works with evidence, uses tools, carries tasks forward, and remains under the control of the engineer responsible for the result.**
