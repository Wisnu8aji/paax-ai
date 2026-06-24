def validate_price_range(items: list) -> list:
    warnings = []
    for item in items:
        if item.get('unit_price', 0) > 100000000:
            warnings.append(f"Harga {item.get('name')} terlalu tinggi (mungkin salah ketik)")
    return warnings
