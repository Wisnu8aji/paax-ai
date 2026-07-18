import re
from typing import Optional, Dict, Any

def parse_dimension_value(value: str) -> Optional[float]:
    if not value:
        return None
    match = re.search(r'([0-9]+(?:[.,][0-9]+)?)', str(value))
    if match:
        return float(match.group(1).replace(',', '.'))
    return None

def compute_volume(dimensions: Any) -> Optional[float]:
    """
    Computes volume (quantity) from a dictionary of dimensions or a text assumption.
    If input is a dict (from stored_measurement_facts):
       Look for p, l, t / panjang, lebar, tinggi, area, volume.
    If input is a string (from quantity_assumptions text):
       Try to parse "P x L x T" or a single number.
    Returns float if successful, None if missing required dimensions.
    """
    if isinstance(dimensions, str):
        nums = [float(n.replace(',', '.')) for n in re.findall(r'[0-9]+(?:[.,][0-9]+)?', dimensions)]
        if not nums:
            return None
        if 'x' in dimensions.lower() or '*' in dimensions:
            vol = 1.0
            for n in nums:
                vol *= n
            return vol
        if len(nums) == 1:
            return nums[0]
        return None

    if isinstance(dimensions, dict):
        def get_val(*keys) -> Optional[float]:
            for k in keys:
                if k in dimensions and dimensions[k] is not None:
                    val = parse_dimension_value(str(dimensions[k]))
                    if val is not None:
                        return val
            return None

        vol = get_val('volume', 'qty', 'jumlah', 'kuantitas')
        if vol is not None:
            return vol

        area = get_val('luas', 'area')
        height = get_val('tinggi', 'height', 'tebal', 'thickness', 'kedalaman', 'depth', 't')
        
        if area is not None:
            if height is not None:
                return area * height
            return area

        length = get_val('panjang', 'length', 'p')
        width = get_val('lebar', 'width', 'l')
        
        if length is not None and width is not None and height is not None:
            return length * width * height
        elif length is not None and width is not None:
            return length * width
        elif length is not None:
            return length
            
    return None
