from pathlib import Path

from streamlit.testing.v1 import AppTest

APP_PATH = Path(__file__).parents[1] / "app.py"


def test_app_initializes_chat_without_calling_gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-api-key")

    app = AppTest.from_file(str(APP_PATH))
    app.run()

    assert not app.exception
    assert app.title[0].value == "PAAX AI v0.2"
    assert app.caption[0].value == "General Chat powered by the Gemini API."
    assert app.session_state["messages"] == [
        {
            "role": "assistant",
            "content": (
                "Halo, saya PAAX AI v0.2. Tulis pesan apa saja, "
                "saya akan bantu jawab."
            ),
        }
    ]


def test_rab_lite_renders_sample_without_calling_gemini(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    app = AppTest.from_file(str(APP_PATH))
    app.run()
    app.selectbox[0].select("RAB Lite")
    app.run()

    assert not app.exception
    assert app.title[0].value == "RAB Lite — AHSP Index Cost Assistant"
    assert any(metric.label == "Total estimated cost" for metric in app.metric)
