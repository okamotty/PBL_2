from flask import Flask, render_template, request, jsonify
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# .envファイルの読み込み
load_dotenv()

app = Flask(__name__)

# Supabaseクライアントの初期化
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

@app.route('/')
def index():
    return render_template('index.html')


# 避難所管理画面
@app.route('/manage')
def manage():
    return render_template('manage.html')

# Supabaseから避難所の基本情報を取得するAPI
@app.route('/api/shelters', methods=['GET'])
def get_shelters():

    all_shelters = []
    batch_size = 500
    start = 0

    while True:
        response = (
            supabase.table('shelters')
            .select('*')
            .range(start, start + batch_size - 1)
            .execute()
        )

        all_shelters.extend(response.data)

        # 取得件数が500件未満なら終了
        if len(response.data) < batch_size:
            break

        start += batch_size

    return jsonify(all_shelters)

# 各避難所のリアルタイムステータスを取得するAPI
@app.route('/api/status', methods=['GET'])
def get_status():
    all_status = []
    batch_size = 500
    start = 0

    while True:
        response = (
            supabase.table('shelter_status')
            .select('*')
            .range(start, start + batch_size - 1)
            .execute()
        )

        all_status.extend(response.data)

        if len(response.data) < batch_size:
            break

        start += batch_size

    status_map = {
        item['common_id']: item
        for item in all_status
    }

    return jsonify(status_map)

# 避難所の人数や物資を更新するAPI
@app.route('/api/status/update', methods=['POST'])
def update_status():
    data = request.get_json()

    if not data or not data.get('common_id'):
        return jsonify({
            "success": False,
            "message": "避難所IDが指定されていません。"
        }), 400

    # 送信された項目だけを更新する
    allowed_fields = [
        "current_people",
        "capacity",
        "supplies_water",
        "supplies_food",
        "supplies_blanket"
    ]

    update_data = {
        field: data[field]
        for field in allowed_fields
        if field in data
    }

    try:
        response = supabase.table('shelter_status').upsert(
            {
                "common_id": data['common_id'],
                **update_data
            },
            on_conflict="common_id"
        ).execute()

        return jsonify({
            "success": True,
            "data": response.data
        })

    except Exception as error:
        print("更新エラー:", error)

        return jsonify({
            "success": False,
            "message": "データの更新に失敗しました。"
        }), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)