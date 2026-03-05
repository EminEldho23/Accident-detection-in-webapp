"""
Visualize detection results: overlay bounding boxes and plate text on video.

Usage:
    python visualize.py --video ./sample.mp4 --csv ./output/results_interpolated.csv --output ./output/out.mp4
"""

import ast
import argparse
import cv2
import numpy as np
import pandas as pd


def draw_border(img, top_left, bottom_right, color=(0, 255, 0), thickness=10,
                line_length_x=200, line_length_y=200):
    x1, y1 = top_left
    x2, y2 = bottom_right

    cv2.line(img, (x1, y1), (x1, y1 + line_length_y), color, thickness)
    cv2.line(img, (x1, y1), (x1 + line_length_x, y1), color, thickness)

    cv2.line(img, (x1, y2), (x1, y2 - line_length_y), color, thickness)
    cv2.line(img, (x1, y2), (x1 + line_length_x, y2), color, thickness)

    cv2.line(img, (x2, y1), (x2 - line_length_x, y1), color, thickness)
    cv2.line(img, (x2, y1), (x2, y1 + line_length_y), color, thickness)

    cv2.line(img, (x2, y2), (x2, y2 - line_length_y), color, thickness)
    cv2.line(img, (x2, y2), (x2 - line_length_x, y2), color, thickness)

    return img


def _parse_bbox(s):
    """Parse a bbox string like '[x1 y1 x2 y2]' into four floats."""
    return ast.literal_eval(
        s.replace('[ ', '[').replace('   ', ' ').replace('  ', ' ').replace(' ', ',')
    )


def main():
    parser = argparse.ArgumentParser(description='Visualize plate detections on video')
    parser.add_argument('--video', '-v', required=True, help='Path to input video')
    parser.add_argument('--csv', '-c', default='./output/results_interpolated.csv',
                        help='Path to interpolated CSV')
    parser.add_argument('--output', '-o', default='./output/out.mp4',
                        help='Path to output video')
    args = parser.parse_args()

    results = pd.read_csv(args.csv)
    cap = cv2.VideoCapture(args.video)

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    out = cv2.VideoWriter(args.output, fourcc, fps, (width, height))

    # Pre-compute best plate crop for each car
    license_plate = {}
    for car_id in np.unique(results['car_id']):
        max_ = np.amax(results[results['car_id'] == car_id]['license_number_score'])
        best = results[(results['car_id'] == car_id) & (results['license_number_score'] == max_)]
        license_plate[car_id] = {
            'license_crop': None,
            'license_plate_number': best['license_number'].iloc[0],
        }
        cap.set(cv2.CAP_PROP_POS_FRAMES, best['frame_nmr'].iloc[0])
        ret, frame = cap.read()
        if not ret:
            continue

        x1, y1, x2, y2 = _parse_bbox(best['license_plate_bbox'].iloc[0])
        crop = frame[int(y1):int(y2), int(x1):int(x2), :]
        if crop.size > 0:
            crop = cv2.resize(crop, (int((x2 - x1) * 400 / max(y2 - y1, 1)), 400))
        license_plate[car_id]['license_crop'] = crop

    # Render video
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    frame_nmr = -1
    ret = True
    while ret:
        ret, frame = cap.read()
        frame_nmr += 1
        if not ret:
            break

        df_ = results[results['frame_nmr'] == frame_nmr]
        for row_indx in range(len(df_)):
            row = df_.iloc[row_indx]

            # Draw vehicle border
            car_x1, car_y1, car_x2, car_y2 = _parse_bbox(row['car_bbox'])
            draw_border(frame, (int(car_x1), int(car_y1)), (int(car_x2), int(car_y2)),
                        (0, 255, 0), 25, line_length_x=200, line_length_y=200)

            # Draw plate rectangle
            x1, y1, x2, y2 = _parse_bbox(row['license_plate_bbox'])
            cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), (0, 0, 255), 12)

            # Overlay plate crop + text
            crop = license_plate.get(row['car_id'], {}).get('license_crop')
            plate_num = license_plate.get(row['car_id'], {}).get('license_plate_number', '')
            if crop is not None and crop.size > 0:
                H, W, _ = crop.shape
                try:
                    frame[int(car_y1) - H - 100:int(car_y1) - 100,
                          int((car_x2 + car_x1 - W) / 2):int((car_x2 + car_x1 + W) / 2), :] = crop

                    frame[int(car_y1) - H - 400:int(car_y1) - H - 100,
                          int((car_x2 + car_x1 - W) / 2):int((car_x2 + car_x1 + W) / 2), :] = (255, 255, 255)

                    (tw, th), _ = cv2.getTextSize(str(plate_num), cv2.FONT_HERSHEY_SIMPLEX, 4.3, 17)
                    cv2.putText(frame, str(plate_num),
                                (int((car_x2 + car_x1 - tw) / 2), int(car_y1 - H - 250 + th / 2)),
                                cv2.FONT_HERSHEY_SIMPLEX, 4.3, (0, 0, 0), 17)
                except Exception:
                    pass

        out.write(frame)

    out.release()
    cap.release()
    print(f'Visualization saved to {args.output}')


if __name__ == '__main__':
    main()
