"""Crops card art, HUD portraits and the logo out of the roster sheet into public/art/.

Run from app/: python -I scripts/export-art.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT.parent / "assets" / "initial-roster-sheet.webp"
OUT = ROOT / "public" / "art"

IDS = ["daumen", "chairman", "cate", "doge", "pepe", "orangie", "buddha", "decu"]
CARDS = [(103, 175, 413, 566), (422, 175, 728, 566), (738, 175, 1034, 566), (1043, 175, 1361, 566),
         (43, 578, 394, 1026), (383, 578, 726, 1026), (735, 578, 1081, 1026), (1075, 578, 1421, 1026)]
HEADS = [(160, 180, 305, 325), (555, 185, 690, 320), (840, 215, 965, 340), (1150, 185, 1275, 310),
         (175, 590, 300, 715), (480, 620, 620, 760), (800, 585, 945, 730), (1225, 640, 1355, 770)]

OUT.mkdir(parents=True, exist_ok=True)
sheet = Image.open(SHEET).convert("RGB")
for fid, card, head in zip(IDS, CARDS, HEADS):
    sheet.crop(card).resize((240, 300), Image.LANCZOS).save(OUT / f"card-{fid}.png")
    sheet.crop(head).resize((96, 96), Image.LANCZOS).save(OUT / f"head-{fid}.png")
sheet.crop((360, 4, 1080, 126)).save(OUT / "logo.png")
print("exported", len(IDS), "fighters")
