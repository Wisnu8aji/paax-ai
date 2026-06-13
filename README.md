# PAAX AI v0.1

PAAX AI v0.1 is a simple LLM-powered chatbot built as a beginner-friendly AI application portfolio project.

This is not a rule-based chatbot and not a fixed-template bot. PAAX AI sends user messages to a large language model through an API and returns generated responses.

## Project Goal

The goal of PAAX AI v0.1 is to build a basic but real AI chatbot that can:

- Chat naturally with users
- Respond in Indonesian or English
- Maintain conversation context during the active session
- Use Gemini API as the LLM backend
- Run locally with Streamlit
- Be deployed online as a portfolio project
- Handle API keys securely without exposing secrets in GitHub

## Version

Current version: `0.1`

## Tech Stack

- Python
- Streamlit
- Gemini API
- Google GenAI SDK
- GitHub
- Codex-assisted development

## Core Features for v0.1

1. Streamlit chat interface
2. Gemini API integration
3. Session-based chat history
4. Bilingual Indonesian-English behavior
5. Reset chat button
6. Model selector
7. Secure API key handling
8. Error handling for missing API key and failed API calls
9. Professional README and setup instructions

## Out of Scope for v0.1

The following features are intentionally not included in v0.1:

- User login system
- Permanent database memory
- File upload
- RAG / document-based Q&A
- Voice input/output
- Payment system
- Fine-tuning a custom model
- Mobile app version

These may be considered for future versions.

## Safety and Privacy Notes

- Do not commit API keys to GitHub.
- Do not input confidential personal data into the demo app.
- Free API tiers may have rate limits.
- Model responses may be inaccurate and should not be treated as final professional advice.

## Portfolio Purpose

This project is designed to demonstrate foundational skills in:

- LLM API integration
- AI chatbot development
- Prompt/system instruction design
- Python application structure
- Streamlit deployment
- Secure environment variable handling
- GitHub-based project documentation

## Planned Roadmap

### v0.1
Basic LLM-powered chatbot.

### v0.2
Add better streaming responses and improved chat UX.

### v0.3
Add persistent chat history with SQLite.

### v0.4
Add document upload and simple RAG.

### v0.5
Add multiple chatbot personas.