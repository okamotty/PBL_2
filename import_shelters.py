import json
import os

from dotenv import load_dotenv
from supabase import create_client

# .envファイルから接続情報を読み込む
load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

if not url or not key:
    raise ValueError(".envにSUPABASE_URLとSUPABASE_KEYを設定してください")

supabase = create_client(url, key)

# GeoJSONファイルを読み込む
with open("static/shelters.geojson", "r", encoding="utf-8") as f:
    geojson = json.load(f)

shelters = []
statuses = []

for feature in geojson["features"]:
    props = feature["properties"]
    coordinates = feature["geometry"]["coordinates"]

    common_id = props.get("共通ID")
    name = props.get("施設・場所名") or "名称不明"
    address = props.get("住所") or ""

    # GeoJSONの座標は [経度, 緯度] の順番
    longitude = coordinates[0]
    latitude = coordinates[1]

    shelters.append({
        "common_id": common_id,
        "shelter_name": name,
        "address": address,
        "latitude": latitude,
        "longitude": longitude
    })

    statuses.append({
        "common_id": common_id,
        "current_people": 0,
        "capacity": 0,
        "supplies_water": 0,
        "supplies_food": 0,
        "supplies_blanket": 0
    })

# Supabaseに500件ずつ登録する
batch_size = 500

for i in range(0, len(shelters), batch_size):
    batch = shelters[i:i + batch_size]
    supabase.table("shelters").upsert(batch).execute()
    print(f"shelters: {min(i + batch_size, len(shelters))}/{len(shelters)}件")

for i in range(0, len(statuses), batch_size):
    batch = statuses[i:i + batch_size]

    # 既に存在するステータスは上書きしない
    supabase.table("shelter_status").upsert(
        batch,
        on_conflict="common_id",
        ignore_duplicates=True
    ).execute()

    print(f"shelter_status: {min(i + batch_size, len(statuses))}/{len(statuses)}件")

print("避難所データの登録が完了しました！")