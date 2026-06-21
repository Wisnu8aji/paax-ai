def validate_units(items: list) -> list:
    errors = []
    allowed = ['m2', 'm3', 'm', 'kg', 'ls', 'bh', 'titik']
    for item in items:
        if item.get('unit') and item['unit'] not in allowed:
            errors.append(f"Invalid unit {item['unit']} for item {item.get('name')}")
    return errors
