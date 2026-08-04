"""Revision R3 — naming dictionary completeness (M5).

Covers the R3 package of the APOLLO revision directive §3.3: the
`_NAMING_DICTIONARY` is completed for the roof-steel family (gording,
kuda_kuda, pipe, trekstang), fixture/MEP categories (door_window_assembly,
lighting_fixture, electrical_fixture, fire_safety_fixture, hvac_fixture,
plumbing_fixture), and the roof-slab variant, all per Master Plan §4.2
canonical naming.  Raw labels remain the explicit fallback when a required
attribute (the code) is missing.

All tests are self-contained (no PDF, no DEM JSON-1 files, no network).
"""
from __future__ import annotations

from app.drawing_intelligence.taxonomy import _NAMING_DICTIONARY, _REGISTRY, name_formatter


def test_name_formatter_fixture_mep_categories():
    assert name_formatter(category="door_window_assembly", code="PJ1") == "Kombinasi Pintu-Jendela PJ1"
    assert name_formatter(category="lighting_fixture", code="DL1") == "Armatur Lampu DL1"
    assert name_formatter(category="lighting_fixture", code="TL1") == "Armatur Lampu TL1"
    assert name_formatter(category="electrical_fixture", code="STK-1") == "Perlengkapan Elektrikal STK-1"
    assert name_formatter(category="fire_safety_fixture", code="APAR1") == "Perlengkapan Proteksi Kebakaran APAR1"
    assert name_formatter(category="hvac_fixture", code="AC1") == "Peralatan Tata Udara AC1"
    assert name_formatter(category="plumbing_fixture", code="WC1") == "Perlengkapan Plumbing WC1"


def test_name_formatter_roof_steel_family():
    assert name_formatter(category="gording", code="GORDING") == "Gording GORDING"
    assert name_formatter(category="kuda_kuda", code="1/2KD") == "Kuda-Kuda 1/2KD"
    assert name_formatter(category="pipe", code="PIPA") == "Pipa PIPA"
    assert name_formatter(category="trekstang", code="TS") == "Trekstang TS"
    assert name_formatter(category="steel_profile", code="WF") == "Profil Baja WF"


def test_name_formatter_roof_slab_variant():
    assert name_formatter(category="slab", level="roof", code="S1") == "Pelat Beton Bertulang Atap"
    assert name_formatter(category="slab", level="roof") == "Pelat Beton Bertulang Atap"
    # Numbered floors keep the §4.2 format.
    assert name_formatter(category="slab", level="L1") == "Pelat Beton Bertulang Lt.1"


def test_name_formatter_requires_code_for_new_categories():
    # Raw label fallback is explicit: no code → no canonical name invented.
    assert name_formatter(category="gording") is None
    assert name_formatter(category="kuda_kuda") is None
    assert name_formatter(category="pipe") is None
    assert name_formatter(category="trekstang") is None
    assert name_formatter(category="door_window_assembly") is None
    assert name_formatter(category="lighting_fixture") is None
    assert name_formatter(category="electrical_fixture") is None
    assert name_formatter(category="fire_safety_fixture") is None
    assert name_formatter(category="hvac_fixture") is None
    assert name_formatter(category="plumbing_fixture") is None
    # Existing behaviour unchanged.
    assert name_formatter(category="unknown") is None
    assert name_formatter(category="mep_fixture") is None


def test_naming_dictionary_covers_all_registry_categories():
    # Every concrete taxonomy category must have a canonical naming template
    # (the directive's M5 target is 100% canonical-name formattability).
    for category in _REGISTRY:
        assert category in _NAMING_DICTIONARY, category
    assert "unknown" not in _NAMING_DICTIONARY


def test_naming_dictionary_templates_use_only_supported_fields():
    # Templates must reference only fields name_formatter knows how to fill.
    supported = {"code", "lantai", "subtype", "jenis"}
    for category, (template, _required) in _NAMING_DICTIONARY.items():
        placeholders = {
            part.split("}")[0].strip()
            for part in template.split("{")[1:]
        }
        assert placeholders <= supported, (category, placeholders)


def test_name_formatter_formattable_for_every_registry_category():
    # M5 target is 100% canonical-name formattability: every concrete
    # taxonomy category must produce a canonical name when the attributes
    # required by its dictionary template are present.
    plausible = {
        "beam": {"code": "B2"},
        "ceiling_type": {},
        "column": {"code": "K1"},
        "door": {"code": "P1"},
        "door_window_assembly": {"code": "PJ1"},
        "electrical_fixture": {"code": "STK-1"},
        "fire_safety_fixture": {"code": "APAR1"},
        "foundation": {"code": "PC1"},
        "gording": {"code": "GORDING"},
        "hvac_fixture": {"code": "AC1"},
        "kuda_kuda": {"code": "1/2KD"},
        "lighting_fixture": {"code": "DL1"},
        "pipe": {"code": "PIPA"},
        "plumbing_fixture": {"code": "WC1"},
        "slab": {"level": "L1"},
        "sloof": {"code": "S1"},
        "steel_profile": {"code": "WF1"},
        "trekstang": {"code": "TS"},
        "wall": {},
        "water_tank": {"code": "BAK KONTROL"},
        "window": {"code": "J1"},
    }
    for category in _REGISTRY:
        formatted = name_formatter(category=category, **plausible[category])
        assert formatted is not None, category
        assert len(formatted) > 0, category
    # Every produced name starts with the canonical prefix of the category.
    prefixes = {
        "beam": "Balok Beton Bertulang",
        "ceiling_type": "Plafon",
        "column": "Kolom Beton Bertulang",
        "door": "Pintu",
        "door_window_assembly": "Kombinasi Pintu-Jendela",
        "electrical_fixture": "Perlengkapan Elektrikal",
        "fire_safety_fixture": "Perlengkapan Proteksi Kebakaran",
        "foundation": "Pondasi",
        "gording": "Gording",
        "hvac_fixture": "Peralatan Tata Udara",
        "kuda_kuda": "Kuda-Kuda",
        "lighting_fixture": "Armatur Lampu",
        "pipe": "Pipa",
        "plumbing_fixture": "Perlengkapan Plumbing",
        "slab": "Pelat Beton Bertulang",
        "sloof": "Sloof Beton Bertulang",
        "steel_profile": "Profil Baja",
        "trekstang": "Trekstang",
        "wall": "Dinding",
        "water_tank": "Bak Kontrol",
        "window": "Jendela",
    }
    for category in _REGISTRY:
        formatted = name_formatter(category=category, **plausible[category])
        assert formatted.startswith(prefixes[category]), category


def test_name_formatter_never_invents_missing_required_attribute_for_any_category():
    # Raw-label fallback contract: for every category whose dictionary entry
    # requires attributes, omitting them must yield None — name_formatter
    # never fabricates a code/level/subtype.
    for category, (template, required) in _NAMING_DICTIONARY.items():
        if not required:
            continue  # no required attribute: formatting is always possible
        with_missing: dict = {}
        formatted = name_formatter(category=category, **with_missing)
        assert formatted is None, (category, template)
    # Spot checks: even a partial attribute set must not be invented into a
    # plausible-but-fake name.
    assert name_formatter(category="door_window_assembly") is None
    assert name_formatter(category="slab", code="X1") is None  # X1 is not a lantai
    assert name_formatter(category="foundation", code="ZZ") is None  # subtype unresolvable
