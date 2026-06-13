"""Streamlit entry point for PAAX AI v0.2."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

from paax.config import (
    DEFAULT_MODEL,
    SUPPORTED_MODELS,
    MissingApiKeyError,
    get_api_key,
)
from paax.gemini import (
    EmptyGeminiResponseError,
    GeminiServiceError,
    generate_response,
)
from paax.prompts import (
    RAB_EXPLANATION_INSTRUCTION,
    SYSTEM_INSTRUCTION,
)
from paax.rab import (
    calculate_rab,
    create_project_template_excel,
    export_rab_to_excel,
    get_sample_project_items,
    load_ahsp_index,
    load_hsp_library,
    load_project_items,
)

APP_MODES = ("General Chat", "RAB Lite")
AHSP_MANIFEST_PATH = (
    Path(__file__).resolve().parent / "data" / "ahsp" / "ahsp_manifest.json"
)
GREETING = (
    "Halo, saya PAAX AI v0.2. Tulis pesan apa saja, "
    "saya akan bantu jawab."
)


def load_api_key() -> str:
    """Load the API key while allowing environment-only configuration."""
    try:
        return get_api_key(streamlit_secrets=st.secrets)
    except StreamlitSecretNotFoundError:
        return get_api_key(streamlit_secrets={})


def load_optional_api_key() -> str | None:
    """Return the Gemini key when configured without blocking RAB features."""
    try:
        return load_api_key()
    except MissingApiKeyError:
        return None


def initialize_chat() -> None:
    """Initialize the active session with the assistant greeting."""
    if "messages" not in st.session_state:
        st.session_state.messages = [
            {"role": "assistant", "content": GREETING}
        ]


def reset_chat() -> None:
    """Reset the active conversation while preserving other settings."""
    st.session_state.messages = [
        {"role": "assistant", "content": GREETING}
    ]


@st.cache_data
def get_rab_reference_data() -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Load bundled RAB reference files once per application process."""
    ahsp_index = load_ahsp_index()
    hsp_library = load_hsp_library()
    with AHSP_MANIFEST_PATH.open(encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)
    return ahsp_index, hsp_library, manifest


@st.cache_data
def get_project_template() -> bytes:
    """Cache the generated blank project template."""
    return create_project_template_excel()


def format_idr(value: float) -> str:
    """Format an IDR value using Indonesian thousands separators."""
    return f"Rp {value:,.0f}".replace(",", ".")


def render_general_chat(selected_model: str) -> None:
    """Render the original PAAX AI chat workflow."""
    st.title("PAAX AI v0.2")
    st.caption("General Chat powered by the Gemini API.")

    api_key = load_optional_api_key()
    if api_key is None:
        st.error(
            "Gemini API key is not configured. Set GEMINI_API_KEY in "
            "Streamlit secrets or an environment variable."
        )

    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    prompt = st.chat_input(
        "Type your message...",
        disabled=api_key is None,
    )
    if not prompt or api_key is None:
        return

    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    try:
        with st.spinner("PAAX AI is thinking..."):
            assistant_response = generate_response(
                api_key=api_key,
                model_name=selected_model,
                messages=st.session_state.messages,
                system_instruction=SYSTEM_INSTRUCTION,
            )
    except EmptyGeminiResponseError:
        st.error("Gemini returned an empty response. Please try again.")
    except GeminiServiceError:
        st.error("PAAX AI could not contact Gemini. Please try again later.")
    else:
        st.session_state.messages.append(
            {"role": "assistant", "content": assistant_response}
        )
        with st.chat_message("assistant"):
            st.markdown(assistant_response)


def render_rab_explanation(
    summary: dict,
    warnings: list[dict],
    selected_model: str,
) -> None:
    """Optionally ask Gemini to explain only assumptions and warning risks."""
    api_key = load_optional_api_key()
    payload = json.dumps(
        {"summary": summary, "warnings": warnings},
        ensure_ascii=True,
    )
    if st.button(
        "Explain this estimate",
        disabled=api_key is None,
        help=(
            "Gemini receives only the Python summary and warnings. "
            "It does not calculate costs."
        ),
    ):
        try:
            with st.spinner("Explaining assumptions and risks..."):
                explanation = generate_response(
                    api_key=api_key,
                    model_name=selected_model,
                    messages=[
                        {
                            "role": "user",
                            "content": (
                                "Explain the assumptions, limitations, and "
                                f"warning risks in this estimate:\n{payload}"
                            ),
                        }
                    ],
                    system_instruction=RAB_EXPLANATION_INSTRUCTION,
                    temperature=0.2,
                    max_output_tokens=800,
                )
        except EmptyGeminiResponseError:
            st.error("Gemini returned an empty explanation.")
        except GeminiServiceError:
            st.error("PAAX AI could not contact Gemini for an explanation.")
        else:
            st.session_state["rab_explanation"] = {
                "payload": payload,
                "text": explanation,
            }

    if api_key is None:
        st.caption(
            "Configure GEMINI_API_KEY to enable explanation. "
            "RAB calculation and downloads remain available."
        )
    explanation_state = st.session_state.get("rab_explanation", {})
    if explanation_state.get("payload") == payload:
        st.info(explanation_state["text"])


def render_rab_lite(selected_model: str) -> None:
    """Render the deterministic AHSP index and RAB workflow."""
    st.title("RAB Lite — AHSP Index Cost Assistant")
    st.caption(
        "PAAX AI v0.2 uses synthetic demo references. "
        "It is not a final professional RAB."
    )

    try:
        ahsp_index, hsp_library, manifest = get_rab_reference_data()
    except (OSError, ValueError, pd.errors.ParserError) as exc:
        st.error(f"RAB reference data could not be loaded: {exc}")
        return

    status_columns = st.columns(3)
    status_columns[0].metric("AHSP index rows", len(ahsp_index))
    status_columns[1].metric("Demo HSP prices", len(hsp_library))
    status_columns[2].metric("Reference status", manifest["status"])
    st.warning(manifest["disclaimer"])

    with st.expander("AHSP index preview"):
        st.dataframe(ahsp_index, use_container_width=True, hide_index=True)
    with st.expander("HSP library preview"):
        st.dataframe(hsp_library, use_container_width=True, hide_index=True)

    st.subheader("Project Items")
    st.download_button(
        "Download input template (Excel)",
        data=get_project_template(),
        file_name="paax_project_items_template.xlsx",
        mime=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
    )
    source = st.radio(
        "Project item source",
        ("Use sample project items", "Upload Excel/CSV"),
        horizontal=True,
    )

    if source == "Use sample project items":
        project_items = get_sample_project_items()
    else:
        upload = st.file_uploader(
            "Upload project items",
            type=["xlsx", "xlsm", "csv"],
        )
        if upload is None:
            st.info("Upload a project item file to calculate the RAB.")
            return
        try:
            project_items = load_project_items(upload)
        except (
            OSError,
            ValueError,
            ImportError,
            pd.errors.ParserError,
        ) as exc:
            st.error(f"Project items could not be loaded: {exc}")
            return

    st.dataframe(project_items, use_container_width=True, hide_index=True)
    result, summary, warnings, ahsp_used = calculate_rab(
        project_items,
        ahsp_index,
        hsp_library,
    )

    st.subheader("Calculated RAB")
    result_display = result.copy()
    result_display["unit_price"] = result_display["unit_price"].map(
        lambda value: format_idr(value) if pd.notna(value) else ""
    )
    result_display["subtotal"] = result_display["subtotal"].map(
        lambda value: format_idr(value) if pd.notna(value) else ""
    )
    st.dataframe(result_display, use_container_width=True, hide_index=True)

    summary_columns = st.columns(3)
    summary_columns[0].metric(
        "Total estimated cost",
        format_idr(summary["total_estimated_cost"]),
    )
    summary_columns[1].metric(
        "Calculated items",
        f"{summary['calculated_item_count']} / {summary['item_count']}",
    )
    summary_columns[2].metric("Warnings", summary["warning_count"])

    st.subheader("Warnings and Audit")
    if warnings:
        st.dataframe(
            pd.DataFrame(warnings),
            use_container_width=True,
            hide_index=True,
        )
    else:
        st.success("No validation warnings were found.")

    excel_bytes = export_rab_to_excel(
        result,
        summary,
        warnings,
        ahsp_used,
    )
    download_columns = st.columns(2)
    download_columns[0].download_button(
        "Download RAB (Excel)",
        data=excel_bytes,
        file_name="paax_rab_lite.xlsx",
        mime=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        use_container_width=True,
    )
    download_columns[1].download_button(
        "Download RAB (CSV)",
        data=result.to_csv(index=False).encode("utf-8-sig"),
        file_name="paax_rab_lite.csv",
        mime="text/csv",
        use_container_width=True,
    )

    render_rab_explanation(summary, warnings, selected_model)


def main() -> None:
    """Render and run the PAAX AI Streamlit application."""
    st.set_page_config(page_title="PAAX AI v0.2", page_icon="🏗️")
    initialize_chat()

    with st.sidebar:
        st.header("PAAX AI v0.2")
        selected_mode = st.selectbox("App mode", options=APP_MODES)
        selected_model = st.selectbox(
            "Gemini model",
            options=SUPPORTED_MODELS,
            index=SUPPORTED_MODELS.index(DEFAULT_MODEL),
        )

        if selected_mode == "General Chat":
            if st.button("Reset chat", use_container_width=True):
                reset_chat()
                st.rerun()

        st.divider()
        st.write(
            "General Chat provides bilingual assistance. RAB Lite provides "
            "a deterministic demo AHSP index and Excel cost workflow."
        )
        st.warning(
            "Do not enter sensitive data. Demo AHSP/HSP records require "
            "professional verification."
        )

    if selected_mode == "General Chat":
        render_general_chat(selected_model)
    else:
        render_rab_lite(selected_model)


if __name__ == "__main__":
    main()
