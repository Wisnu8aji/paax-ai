from pathlib import Path

from streamlit.testing.v1 import AppTest

APP_PATH = Path(__file__).parents[1] / "app.py"


def test_app_initializes_chat_without_calling_gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-api-key")

    app = AppTest.from_file(str(APP_PATH))
    app.run()

    assert not app.exception
    assert app.title[0].value == "PAAX AI v0.1"
    assert app.caption[0].value == (
        "A simple LLM-powered chatbot using Gemini API."
    )
    assert app.session_state["messages"] == [
        {
            "role": "assistant",
            "content": (
                "Halo, saya PAAX AI v0.1. Tulis pesan apa saja, "
                "saya akan bantu jawab."
            ),
        }
    ]
