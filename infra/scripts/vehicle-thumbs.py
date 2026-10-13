#!/usr/bin/env python3
"""카드용 작은 차량 이미지 만들기 (#53): assets/vehicles/**/X.webp → X.w480.webp (가로 480px, 품질 78)
이미 있는 작은 이미지는 건너뜀. 원본을 바꿨으면 해당 .w480.webp 를 지우고 다시 실행.
사용: python3 infra/scripts/vehicle-thumbs.py   (Pillow 필요: pip install pillow)"""
import glob, os
from multiprocessing import Pool
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")

def go(f):
    out = f[:-5] + ".w480.webp"
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return 0
    im = Image.open(f); w, h = im.size
    if w > 480:
        im = im.resize((480, round(h * 480 / w)), Image.LANCZOS)
    im.save(out + ".tmp", "WEBP", quality=78, method=4); os.replace(out + ".tmp", out)
    return 1

if __name__ == "__main__":
    fs = [f for f in glob.glob(os.path.join(ROOT, "assets/vehicles/**/*.webp"), recursive=True) if ".w480." not in f]
    with Pool() as p:
        print(f"새로 만든 작은 이미지 {sum(p.map(go, fs))}개 / 원본 {len(fs)}개")
