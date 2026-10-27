from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

# GeoJSONファイルを配信するルート（必要に応じてパスを調整してください）
@app.route('/shelters.geojson')
def get_geojson():
    # shelters.geojson が置かれているディレクトリを指定（例: templates内、またはルート直下）
    return send_from_directory('templates', 'shelters.geojson')

if __name__ == '__main__':
    app.run(debug=True, port=5000)