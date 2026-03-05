"""
TRAFCON360 - Unified License Plate OCR Utilities
Combines strict-format and permissive OCR from both detection pipelines.
"""

import string
import torch
import easyocr

# ── GPU-aware EasyOCR initialisation ─────────────────────────────────────
_use_gpu = torch.cuda.is_available()
if _use_gpu:
    print(f'[util] CUDA detected — EasyOCR will use GPU ({torch.cuda.get_device_name(0)})')
else:
    print('[util] No CUDA device found — EasyOCR will use CPU')

reader = easyocr.Reader(['en'], gpu=_use_gpu)

# ── Character mapping dictionaries ───────────────────────────────────────
dict_char_to_int = {'O': '0', 'I': '1', 'J': '3', 'A': '4', 'G': '6', 'S': '5'}
dict_int_to_char = {'0': 'O', '1': 'I', '3': 'J', '4': 'A', '6': 'G', '5': 'S'}


# ── CSV writer ───────────────────────────────────────────────────────────
def write_csv(results, output_path):
    """Write detection results to a CSV file."""
    with open(output_path, 'w') as f:
        f.write('{},{},{},{},{},{},{}\n'.format(
            'frame_nmr', 'car_id', 'car_bbox',
            'license_plate_bbox', 'license_plate_bbox_score',
            'license_number', 'license_number_score'))

        for frame_nmr in results.keys():
            for car_id in results[frame_nmr].keys():
                entry = results[frame_nmr][car_id]
                if 'car' in entry and 'license_plate' in entry and 'text' in entry['license_plate']:
                    f.write('{},{},{},{},{},{},{}\n'.format(
                        frame_nmr,
                        car_id,
                        '[{} {} {} {}]'.format(*entry['car']['bbox']),
                        '[{} {} {} {}]'.format(*entry['license_plate']['bbox']),
                        entry['license_plate']['bbox_score'],
                        entry['license_plate']['text'],
                        entry['license_plate']['text_score']))


# ── Format validation (strict 7-char format: AA00AAA) ───────────────────
def license_complies_format(text):
    """Check if license plate text complies with the 7-char format (e.g. AA00AAA)."""
    if len(text) != 7:
        return False

    checks = [
        text[0] in string.ascii_uppercase or text[0] in dict_int_to_char,
        text[1] in string.ascii_uppercase or text[1] in dict_int_to_char,
        text[2] in '0123456789' or text[2] in dict_char_to_int,
        text[3] in '0123456789' or text[3] in dict_char_to_int,
        text[4] in string.ascii_uppercase or text[4] in dict_int_to_char,
        text[5] in string.ascii_uppercase or text[5] in dict_int_to_char,
        text[6] in string.ascii_uppercase or text[6] in dict_int_to_char,
    ]
    return all(checks)


def format_license(text):
    """Format a 7-char license plate using the char↔int mapping."""
    mapping = {
        0: dict_int_to_char, 1: dict_int_to_char,
        2: dict_char_to_int, 3: dict_char_to_int,
        4: dict_int_to_char, 5: dict_int_to_char, 6: dict_int_to_char,
    }
    return ''.join(
        mapping[j].get(text[j], text[j]) for j in range(7)
    )


# ── OCR: strict format reader ───────────────────────────────────────────
def read_license_plate(license_plate_crop):
    """
    Read license plate text from a cropped image (strict 7-char format).

    Returns:
        tuple: (formatted_text, score) or (None, None)
    """
    detections = reader.readtext(license_plate_crop)
    for detection in detections:
        bbox, text, score = detection
        text = text.upper().replace(' ', '')
        if license_complies_format(text):
            return format_license(text), score
    return None, None


# ── OCR: permissive reader (any alphanumeric 4-10 chars) ────────────────
def read_license_plate_any(license_plate_crop):
    """
    Permissive license plate reader: accepts any alphanumeric text between
    4-10 characters without enforcing a country-specific format.

    Returns:
        tuple: (text, score) or (None, None)
    """
    detections = reader.readtext(license_plate_crop)
    best_text, best_score = None, 0.0
    for detection in detections:
        bbox, text, score = detection
        text = text.upper().replace(' ', '')
        clean = ''.join(c for c in text if c.isalnum())
        if 4 <= len(clean) <= 10 and score > best_score:
            best_text, best_score = clean, score
    return (best_text, best_score) if best_text else (None, None)


# ── OCR: combined reader (try strict first, fallback to permissive) ─────
def read_license_plate_combined(license_plate_crop):
    """
    Combined reader: tries strict 7-char format first, falls back to
    permissive alphanumeric detection. Best for mixed plate formats.

    Returns:
        tuple: (text, score) or (None, None)
    """
    detections = reader.readtext(license_plate_crop)

    # Pass 1: look for strict 7-char format
    for detection in detections:
        bbox, text, score = detection
        text = text.upper().replace(' ', '')
        if license_complies_format(text):
            return format_license(text), score

    # Pass 2: accept any alphanumeric 4-10 chars
    best_text, best_score = None, 0.0
    for detection in detections:
        bbox, text, score = detection
        text = text.upper().replace(' ', '')
        clean = ''.join(c for c in text if c.isalnum())
        if 4 <= len(clean) <= 10 and score > best_score:
            best_text, best_score = clean, score

    return (best_text, best_score) if best_text else (None, None)


# ── Vehicle–plate matching ───────────────────────────────────────────────
def get_car(license_plate, vehicle_track_ids):
    """
    Match a license plate bounding box to the enclosing vehicle.

    Args:
        license_plate: (x1, y1, x2, y2, score, class_id)
        vehicle_track_ids: array of [x1, y1, x2, y2, track_id]

    Returns:
        tuple: (xcar1, ycar1, xcar2, ycar2, car_id) or (-1,-1,-1,-1,-1)
    """
    x1, y1, x2, y2, score, class_id = license_plate

    for j in range(len(vehicle_track_ids)):
        xcar1, ycar1, xcar2, ycar2, car_id = vehicle_track_ids[j]
        if x1 > xcar1 and y1 > ycar1 and x2 < xcar2 and y2 < ycar2:
            return vehicle_track_ids[j]

    return -1, -1, -1, -1, -1
