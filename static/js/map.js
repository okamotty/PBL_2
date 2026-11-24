// ========================================
// 地図の初期設定
// ========================================

// 名古屋市付近を中心に地図を初期化
const map = L.map('map').setView([35.1815, 136.9064], 13);

// 国土地理院の地図タイルを表示
L.tileLayer(
    'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    {
        attribution:
            '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>',

        // 拡大・縮小中はタイルの更新を抑える
        updateWhenZooming: false,

        // 地図の移動が落ち着いてからタイルを更新する
        updateWhenIdle: true,

        // 現在の表示範囲の周辺タイルも保持する
        keepBuffer: 2
    }
).addTo(map);


// ========================================
// HTML表示用の文字列変換
// ========================================

// データにHTMLタグなどが含まれていても、
// HTMLとして実行されないようにする
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (char) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char];
    });
}


// ========================================
// 避難所データの取得
// ========================================

let shelterGeoJSON=null;
const shelterCircles=L.layerGroup().addTo(map);

async function loadShelters() {
    const loading = document.getElementById('loading');

    try {
        // Supabaseから避難所情報と現在の状況を取得
        const [sheltersResponse, statusResponse] = await Promise.all([
            fetch('/api/shelters'),
            fetch('/api/status')
        ]);

        if (!sheltersResponse.ok || !statusResponse.ok) {
            throw new Error('APIからデータを取得できませんでした。');
        }

        const shelters = await sheltersResponse.json();
        console.log('APIから取得した避難所データ:', shelters);
        console.log('最初の避難所:', shelters[0]);
        const statusData = await statusResponse.json();

        // Leafletで利用できるGeoJSON形式に変換
        shelterGeoJSON = {
            type: 'FeatureCollection',

            features: shelters
                .filter(shelter =>
                    shelter.latitude != null &&
                    shelter.longitude != null
                )
                .map(shelter => ({
                    type: 'Feature',

                    geometry: {
                        type: 'Point',
                        coordinates: [
                            shelter.longitude,
                            shelter.latitude
                        ]
                    },

                    properties: {
                        common_id: shelter.common_id,
                        name: shelter.shelter_name,
                        address: shelter.address
                    }
                }))
        };

        // GeoJSONの変換結果を確認
        console.log('GeoJSON全体:', shelterGeoJSON);
        console.log('最初のFeature:', shelterGeoJSON.features[0]);
        console.log('最初の避難所のcoordinates:',shelterGeoJSON.features[0]?.geometry?.coordinates);

        // 地図上に避難所を表示
        //displayShelters(geojson, statusData);
        displayShelters(shelterGeoJSON, statusData);

        loading.classList.add('hidden');

        console.log('避難所データの読み込みが完了しました。');

    } catch (error) {
        console.error('データの読み込みに失敗しました:', error);

        loading.textContent =
            'データの読み込みに失敗しました。サーバーを確認してください。';
    }
}

// 混雑状況を判定する
function getCrowdingInfo(status) {
    const people = Number(status.current_people) || 0;
    const capacity = Number(status.capacity) || 0;

    // 収容人数が未設定の場合
    if (capacity <= 0) {
        return {
            className: 'unknown',
            label: '収容人数未設定',
            rate: null
        };
    }

    const rate = Math.round((people / capacity) * 100);

    if (rate >= 100) {
        return {
            className: 'full',
            label: '満員',
            rate: rate
        };
    } else if (rate >= 50) {
        return {
            className: 'crowded',
            label: 'やや混雑',
            rate: rate
        };
    } else {
        return {
            className: 'available',
            label: '空きあり',
            rate: rate
        };
    }
}
// ========================================
// 混雑状況に応じたマーカーを作成する
// ========================================

function createShelterIcon(status) {
    const crowding = getCrowdingInfo(status);

    return L.divIcon({
        className: 'shelter-div-icon',
        html: `
            <div class="shelter-marker ${crowding.className}">
            </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });
}

// ========================================
// 避難所マーカーの表示
// ========================================


function displayShelters(geojson, statusData) {
    const shelterLayer = L.geoJSON(geojson, {
        pointToLayer: function (feature, latlng) {
            const commonId = feature.properties.common_id;

            const status = statusData[commonId] || {
                current_people: 0,
                capacity: 0
            };

            return L.marker(latlng, {
                icon: createShelterIcon(status)
            });
        },

        onEachFeature: function (feature, layer) {
            const props = feature.properties;
            const commonId = props.common_id;
            const name = props.name || '名称不明';
            const address = props.address || '不明';

            const status = statusData[commonId] || {
                current_people: 0,
                capacity: 0,
                supplies_water: 0,
                supplies_food: 0,
                supplies_blanket: 0
            };

            const crowding = getCrowdingInfo(status);

            const occupancyText = crowding.rate === null
                ? '未設定'
                : `${crowding.rate}%`;

            const popupContent = `
                <div class="shelter-popup">

                    <h3>${escapeHTML(name)}</h3>

                    <p>住所：${escapeHTML(address)}</p>

                    <hr>

                    <p>
                        混雑状況：
                        <strong>${crowding.label}</strong>
                    </p>

                    <p>
                        収容率：
                        ${occupancyText}
                    </p>

                    <hr>

                    <h4>避難状況</h4>

                    <p>
                        避難人数：
                        ${Number(status.current_people) || 0}人
                    </p>

                    <p>
                        収容人数：
                        ${Number(status.capacity) || 0}人
                    </p>

                    <hr>

                    <h4>物資の在庫状況</h4>

                    <p>
                        水：
                        ${Number(status.supplies_water) || 0}L
                    </p>

                    <p>
                        非常食：
                        ${Number(status.supplies_food) || 0}食
                    </p>

                    <p>
                        毛布：
                        ${Number(status.supplies_blanket) || 0}枚
                    </p>

                </div>
            `;

            layer.bindPopup(popupContent);
        }
    });

    shelterLayer.addTo(map);
}


// ========================================
// 現在地取得機能
// ========================================

function addLocateControl() {

    if (!('geolocation' in navigator)) {
        console.log('このブラウザは位置情報取得に対応していません。');
        return;
    }

    // 現在地ボタンを作成
    const LocateControl = L.Control.extend({

        options: {
            position: 'topleft'
        },

        onAdd: function () {

            const container = L.DomUtil.create(
                'div',
                'leaflet-bar leaflet-control'
            );

            const button = L.DomUtil.create(
                'a',
                '',
                container
            );

            button.innerHTML = '📍';
            button.href = '#';
            button.title = '現在地を表示';

            button.style.fontSize = '18px';
            button.style.textAlign = 'center';
            button.style.textDecoration = 'none';
            button.style.lineHeight = '30px';
            button.style.width = '30px';
            button.style.height = '30px';
            button.style.display = 'block';
            button.style.backgroundColor = 'white';

            // ボタンのクリックイベント
            L.DomEvent.on(button, 'click', function (event) {

                L.DomEvent.preventDefault(event);

                map.locate({
                    setView: true,
                    maxZoom: 16
                });
            });

            return container;
        }
    });

    map.addControl(new LocateControl());

    const shelterLatlng=[];

    // 現在地の取得に成功した場合
    map.on('locationfound', function (event) {

        if(shelterGeoJSON===null){
            console.log('避難所データがまだ読み込まれていません。');
            return;
        }

        shelterCircles.clearLayers();

        const radius = event.accuracy / 2;

        L.marker(event.latlng)
            .addTo(map)
            .bindPopup(
                `現在地から約${Math.round(radius)}m以内にいます`
            )
            .openPopup();

        L.circle(event.latlng, radius).addTo(map);

        //const shelterLatlng=L.latLng(shelter.longitude,shelter.latitude);
        shelterGeoJSON.features.forEach(function(feature){
            const coordinates=feature.geometry.coordinates;
            const shelterLatlng=L.latLng(
                coordinates[1],
                coordinates[0]
            );

            return shelterLatlng
        })

        const distance=event.latlng.distanceTo(shelterLatlng);
        console.log('避難所:', shelterLatlng);
        console.log('距離:', distance, 'm');

        console.log(
            featuer.properties.name,
            '距離:',
            distance,
            'm'
        );

        /*shelterLatlng.forEach(function(shelter){
            const distanceTargetShelter=event.latlng.distanceTo(shelter);
            if(distanceTargetShelter<=1000){
                L.circle(shelter,{
                    color:'red',
                    fillColor:'#f00',
                    fillOpacity:0.2,
                    radius:1000
                }).addTo(map);
                console.log('in');
            };
        });*/
        
        if(distance<=1000){
            L.circle(shelterLatlng,{
                color:'red',
                fillColor:'#f00',
                fillOpacity:0.2,
                radius:1000
            }).addTo(shelterCircles);
        };
    });


    // 現在地の取得に失敗した場合
    map.on('locationerror', function () {

        alert(
            '現在地を取得できませんでした。' +
            'ブラウザの位置情報の権限やGPS設定をご確認ください。'
        );
    });
}


// ========================================
// 混雑状況の凡例の追加
// ========================================

function addCrowdingLegend() {

    const legend = L.control({
        position: 'bottomright'
    });

    legend.onAdd = function () {

        const div = L.DomUtil.create(
            'div',
            'crowding-legend'
        );

        div.innerHTML = `
            <div class="legend-title">
                混雑状況
            </div>

            <div class="legend-item">
                <span class="legend-color legend-available"></span>
                空きあり
            </div>

            <div class="legend-item">
                <span class="legend-color legend-crowded"></span>
                やや混雑
            </div>

            <div class="legend-item">
                <span class="legend-color legend-full"></span>
                満員
            </div>

            <div class="legend-item">
                <span class="legend-color legend-unknown"></span>
                未設定
            </div>
        `;

        L.DomEvent.disableClickPropagation(div);

        return div;
    };

    legend.addTo(map);
}


// ========================================
// 初期処理
// ========================================

// 現在地ボタンを追加
addLocateControl();

// 混雑状況の凡例を追加
addCrowdingLegend();

// 避難所データを読み込む
loadShelters();