# PAAX AI v0.1

PAAX AI is a bilingual, LLM-powered chatbot built with Python, Streamlit, and
the Gemini API. It is a beginner-friendly portfolio project demonstrating a
complete AI application workflow, from API integration and session state to
secure configuration and cloud deployment.

## Live Demo

Try the deployed application:

**[Open PAAX AI](https://paax-ai.streamlit.app/)**

> The hosted demo depends on Gemini API availability and may be affected by
> free-tier usage limits.

## Features

- Real LLM-powered chatbot
- Gemini API backend
- Streamlit web interface
- Indonesian-English conversation support
- Session-based chat history
- Model selector
- Secure API key handling
- Chat reset and API error handling

## Tech Stack

- Python
- Streamlit
- Gemini API
- Google GenAI SDK
- Pytest
- Streamlit Community Cloud

## How to Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/your-username/paax-ai.git
cd paax-ai
```

Replace `your-username` with the GitHub account that hosts your fork or copy
of this repository.

### 2. Create and activate a virtual environment

```bash
python -m venv .venv
```

On Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

On macOS or Linux:

```bash
source .venv/bin/activate
```

### 3. Install dependencies

```bash
python -m pip install -r requirements.txt
```

### 4. Configure the environment

Follow the instructions in [Environment Setup](#environment-setup) to add a
Gemini API key locally.

### 5. Start the application

```bash
streamlit run app.py
```

Streamlit will display the local URL in the terminal, usually
`http://localhost:8501`.

## Environment Setup

PAAX AI reads the Gemini API key from Streamlit secrets or the
`GEMINI_API_KEY` environment variable. For local Streamlit development, copy
the provided example file:

```powershell
Copy-Item .streamlit\secrets.toml.example .streamlit\secrets.toml
```

On macOS or Linux:

```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
```

Then update `.streamlit/secrets.toml` with your own Gemini API key:

```toml
GEMINI_API_KEY = "your_gemini_api_key_here"
```

The local `.streamlit/secrets.toml` file is excluded by `.gitignore`. Never
commit this file, paste a real API key into the README, or expose a key in
screenshots and logs. For deployment, add `GEMINI_API_KEY` through the
Streamlit Community Cloud secrets settings.

## Testing

Run the test suite from the project root:

```bash
python -m pytest
```

## Limitations

- No real-time web browsing
- No database-backed persistent memory yet
- No file upload or retrieval-augmented generation (RAG) yet
- Real-time data, such as currency exchange rates, requires future tool or API
  integration
- Session chat history is cleared when the Streamlit session ends
- Generated responses may be inaccurate and should not be treated as
  professional advice

## Roadmap

- **v0.2:** Live tool integration, such as exchange rate lookup
- **v0.3:** Persistent memory
- **v0.4:** Document upload and RAG
- **v0.5:** Persona selector

## Safety and Privacy

- Do not enter confidential, sensitive, or personal information into the demo.
- API providers and free tiers may enforce rate and usage limits.
- AI-generated content should be reviewed before it is used for important
  decisions.

## Portfolio Purpose

This project demonstrates foundational skills in:

- LLM API integration
- AI chatbot development
- Prompt and system instruction design
- Python application structure
- Streamlit deployment
- Session-state management
- Secure secret handling
- Automated testing

## Version

Current version: `0.1`
