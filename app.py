from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    session,
    redirect,
    url_for,
    flash,
    g
)
import os

from supabase import create_client, Client
from dotenv import load_dotenv
from functools import wraps
from flask import g, redirect, url_for, jsonify

# .envファイルの読み込み
load_dotenv()

# Flaskアプリケーションの初期化
app = Flask(__name__)

# セッションの暗号化キーを環境変数から取得
app.secret_key = os.environ.get("FLASK_SECRET_KEY")

# 秘密鍵の読み込み状態を確認
print("秘密鍵の読み込み:", bool(app.secret_key))

# 秘密鍵が読み込めているか確認
if not app.secret_key:
    raise RuntimeError(
        "FLASK_SECRET_KEYが設定されていません。.envを確認してください。"
    )

# セッションのセキュリティ設定
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# SupabaseのURLとキーを環境変数から取得
url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")
anon_key = os.environ.get("SUPABASE_ANON_KEY")

# 既存のデータベース操作用クライアント
supabase: Client = create_client(url, key)

# ログイン・ユーザー登録用クライアント
auth_supabase: Client = create_client(url, anon_key)

def get_current_user():
    if "access_token" not in session:
        return None

    try:
        # Supabaseにアクセストークンを確認してもらう
        response = auth_supabase.auth.get_user(
            session["access_token"]
        )

        user = response.user

        if not user:
            return None

        # ユーザーの権限を取得
        profile = (
            supabase.table("user_profiles")
            .select("user_id, role, designated_shelter_id")
            .eq("user_id", user.id)
            .single()
            .execute()
        )

        return {
            "user_id": user.id,
            "email": user.email,
            "role": profile.data["role"],
            "designated_shelter_id": profile.data[
                "designated_shelter_id"
            ]
        }

    except Exception as error:
        print("認証確認エラー:", error)
        session.clear()
        return None

def login_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        current_user = get_current_user()

        if current_user is None:
            return redirect(url_for("login"))

        g.current_user = current_user
        return function(*args, **kwargs)

    return wrapper


def admin_required(function):
    @wraps(function)
    def wrapper(*args, **kwargs):
        current_user = get_current_user()

        if current_user is None:
            return jsonify({
                "success": False,
                "message": "ログインが必要です。"
            }), 401

        if current_user["role"] != "admin":
            return jsonify({
                "success": False,
                "message": "管理者権限が必要です。"
            }), 403

        g.current_user = current_user
        return function(*args, **kwargs)

    return wrapper

@app.route('/')
@login_required
def index():
    # 管理者は管理画面へ移動
    if g.current_user["role"] == "admin":
        return redirect(url_for("manage"))

    # 避難者は地図画面へ移動
    return render_template(
        "index.html",
        user_role=g.current_user["role"]
    )

@app.route("/login", methods=["GET", "POST"])
def login():

    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")

        try:
            response = auth_supabase.auth.sign_in_with_password({
                "email": email,
                "password": password
            })

            session.clear()
            session["access_token"] = response.session.access_token

            return redirect(url_for("index"))

        except Exception as error:
            print("ログインエラー:", error)
            flash("メールアドレスまたはパスワードが正しくありません。")

    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():

    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")

        try:
            response = auth_supabase.auth.sign_up({
                "email": email,
                "password": password
            })

            # メール確認が無効なら登録直後にログイン可能
            if response.session:
                session.clear()
                session["access_token"] = (
                    response.session.access_token
                )

                return redirect(url_for("index"))

            flash(
                "登録しました。メール確認が必要な場合は、"
                "メールを確認してからログインしてください。"
            )
            return redirect(url_for("login"))

        except Exception as error:
            print("登録エラー:", error)
            flash("アカウントを作成できませんでした。")

    return render_template("register.html")


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

# 避難所管理画面
@app.route('/manage')
@login_required
def manage():

    # 避難者は管理画面を利用できない
    if g.current_user["role"] != "admin":
        return redirect(url_for("index"))

    return render_template("manage.html")

# Supabaseから避難所の基本情報を取得するAPI
@app.route('/api/shelters', methods=['GET'])
@login_required
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
@login_required
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

    status_map = {}

    for item in all_status:
        common_id = item["common_id"]

        people = int(item.get("current_people") or 0)
        capacity = int(item.get("capacity") or 0)

        # 管理者にはすべての情報を返す
        if g.current_user["role"] == "admin":
            status_map[common_id] = item
            continue

        # 避難者には混雑状況だけを返す
        if capacity <= 0:
            crowding_class = "unknown"
        else:
            rate = people / capacity * 100

            if rate >= 100:
                crowding_class = "full"
            elif rate >= 50:
                crowding_class = "crowded"
            else:
                crowding_class = "available"

        status_map[common_id] = {
            "crowding_class": crowding_class
        }

    return jsonify(status_map)

# 避難所の人数や物資を更新するAPI
@app.route('/api/status/update', methods=['POST'])
@admin_required
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