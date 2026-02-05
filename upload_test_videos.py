#!/usr/bin/env python
"""
Helper script to upload test videos to the backend via the API
"""
import requests
import os
from pathlib import Path

API_BASE_URL = "http://localhost:8000"
ACCIDENT_VIDEOS_DIR = r"C:\Trafcon\Accident_detection_2\accident-detection-system\accident_videos"

def upload_video(lane_id: int, video_path: str) -> bool:
    """Upload a video to a specific lane"""
    url = f"{API_BASE_URL}/upload/{lane_id}"
    
    with open(video_path, 'rb') as f:
        files = {'file': f}
        try:
            response = requests.post(url, files=files)
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Lane {lane_id}: {result['message'] if 'message' in result else result}")
                return True
            else:
                print(f"❌ Lane {lane_id}: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Lane {lane_id}: {e}")
            return False

def main():
    """Upload test videos to all 4 lanes"""
    videos = [
        ("accident1.mp4", 1),
        ("accident2.mp4", 2),
        ("accident3.mp4", 3),
        ("accident4.mp4", 4),
    ]
    
    print("🚀 Starting test video uploads...\n")
    
    success_count = 0
    for video_name, lane_id in videos:
        video_path = os.path.join(ACCIDENT_VIDEOS_DIR, video_name)
        
        if not os.path.exists(video_path):
            print(f"⚠️  Lane {lane_id}: Video not found at {video_path}")
            continue
        
        print(f"📹 Uploading {video_name} to Lane {lane_id}...")
        if upload_video(lane_id, video_path):
            success_count += 1
        print()
    
    print(f"\n{'='*50}")
    print(f"✅ Upload Summary: {success_count}/{len(videos)} videos uploaded")
    
    # Check status
    try:
        response = requests.get(f"{API_BASE_URL}/status")
        if response.status_code == 200:
            status = response.json()
            print(f"System Status: {status}")
    except Exception as e:
        print(f"Could not check status: {e}")

if __name__ == "__main__":
    main()
