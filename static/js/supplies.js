
// 物資の種類と、1人1日あたりの消費量・目標日数の初期値
const SUPPLY_ITEMS = [
    {
        key: 'water',
        field: 'supplies_water',
        label: '水',
        icon: '💧',
        unit: 'L',
        unitLong: 'リットル',
        perDay: 2,
        defaultDays: 7
    },
    {
        key: 'food',
        field: 'supplies_food',
        label: '食料',
        icon: '🍱',
        unit: '食',
        unitLong: '食',
        perDay: 3,
        defaultDays: 7
    },
    {
        key: 'blanket',
        field: 'supplies_blanket',
        label: '毛布',
        icon: '🛏',
        unit: '枚',
        unitLong: '枚',
        perDay: 1,
        defaultDays: 3
    }
];

// 残日数がこの日数未満なら赤色（危険）にする
const DANGER_DAYS = 2;

// 避難所情報
let shelterList = [];
let statusData = {};

// 選択中の避難所ID
let selectedId = null;

// 物資ごとの目標日数（画面上の計算用。保存はしない）
const targetDays = {};
SUPPLY_ITEMS.forEach(item => {
    targetDays[item.key] = item.defaultDays;
});

function formatNumber(value) {
    return Number(value).toLocaleString();
}

function getStatus(commonId) {
    return statusData[commonId] || {};
}

function findShelter(commonId) {
    return shelterList.find(
        shelter => String(shelter.common_id) === String(commonId)
    );
}

// 在庫と避難者数から、残日数・不足量などを計算
function calcSupply(item, stock, people, days) {
    const dailyNeed = people * item.perDay;
    const required = dailyNeed * days;
    const shortage = Math.max(0, required - stock);

    // 避難者がいなければ残日数は計算しない
    if (dailyNeed === 0) {
        return { required, shortage, remainingDays: null, level: 'none' };
    }

    const remainingDays = Math.floor(stock / dailyNeed);
    let level = 'ok';

    if (remainingDays < days) {
        level = remainingDays < DANGER_DAYS ? 'danger' : 'warn';
    }

    return { required, shortage, remainingDays, level };
}

// 避難所の選択肢に表示する文字列
function getStatsText(status, style) {
    const people = Number(status.current_people) || 0;
    const capacity = Number(status.capacity) || 0;
    const rate = getUsageRate(status);
    const rateText = rate === null ? '—' : `${rate}%`;

    if (style === 'sp') {
        return `現在: ${formatNumber(people)}人 ／ 定員: ` +
            `${capacity > 0 ? formatNumber(capacity) + '人' : '未設定'}` +
            `　利用率: ${rateText}`;
    }

    return `${formatNumber(people)}人 / ` +
        `${capacity > 0 ? formatNumber(capacity) + '人' : '定員未設定'}` +
        `　利用率 ${rateText}`;
}

// データを読み込む
async function loadData() {
    const loading = document.getElementById('loading');

    try {
        const [sheltersResponse, statusResponse] = await Promise.all([
            fetch('/api/shelters'),
            fetch('/api/status')
        ]);

        if (!sheltersResponse.ok || !statusResponse.ok) {
            throw new Error('データを取得できませんでした。');
        }

        shelterList = await sheltersResponse.json();
        statusData = await statusResponse.json();

        if (shelterList.length === 0) {
            loading.textContent = '登録されている避難所がありません。';
            return;
        }

        // URLの ?id= で指定された避難所を最初に選ぶ
        const params = new URLSearchParams(location.search);
        const requestedId = params.get('id');
        const firstShelter =
            (requestedId && findShelter(requestedId)) || shelterList[0];

        buildShelterOptions();
        buildSupplyRows();

        loading.classList.add('hidden');
        document.getElementById('supply-table').classList.remove('hidden');
        document.getElementById('shelter-select').disabled = false;
        document.getElementById('save-button').disabled = false;

        selectShelter(firstShelter.common_id);
        updateSummary();

    } catch (error) {
        console.error('読み込みエラー:', error);
        loading.textContent =
            'データを取得できませんでした。サーバーを確認してください。';
    }
}

// 避難所の選択肢を作る
function buildShelterOptions() {
    const select = document.getElementById('shelter-select');

    select.innerHTML = shelterList.map(shelter => {
        const status = getStatus(shelter.common_id);
        const name = shelter.shelter_name || '名称不明';

        return `<option value="${escapeHTML(shelter.common_id)}">` +
            `${escapeHTML(name)}　${escapeHTML(getStatsText(status, 'pc'))}` +
            `</option>`;
    }).join('');
}

// 選択肢の表示を1件だけ更新する
function refreshShelterOption(commonId) {
    const select = document.getElementById('shelter-select');
    const shelter = findShelter(commonId);
    const option = Array.from(select.options).find(
        item => item.value === String(commonId)
    );

    if (!shelter || !option) return;

    option.textContent =
        `${shelter.shelter_name || '名称不明'}　` +
        getStatsText(getStatus(commonId), 'pc');
}

// 物資の行を作る（入力欄は1度だけ作り、値は後から入れる）
function buildSupplyRows() {
    const container = document.getElementById('supply-rows');

    container.innerHTML = SUPPLY_ITEMS.map(item => `
        <div class="supply-row" data-key="${item.key}">
            <div class="s-head">
                <p class="s-name">${item.icon} ${item.label}</p>
                <span class="s-remain remain-badge"></span>
            </div>

            <label class="s-label s-stock-label sp-only"
                   for="stock-${item.key}">現在の在庫</label>
            <div class="s-stock">
                <input type="number"
                       class="stock-input"
                       id="stock-${item.key}"
                       inputmode="numeric"
                       min="0"
                       step="1"
                       aria-label="${item.label}の現在の在庫（${item.unit}）">
                <span class="s-unit">
                    <span class="pc-only">${item.unit}</span>
                    <span class="sp-only">
                        ${item.unitLong}
                        <small>${item.perDay}${item.unit}/人・日</small>
                    </span>
                </span>
            </div>

            <p class="s-perday pc-only">${item.perDay}${item.unit}</p>

            <label class="s-label s-target-label sp-only"
                   for="target-${item.key}">目標日数</label>
            <div class="s-target">
                <input type="number"
                       class="target-input"
                       id="target-${item.key}"
                       inputmode="numeric"
                       min="1"
                       max="99"
                       step="1"
                       value="${targetDays[item.key]}"
                       aria-label="${item.label}の必要日数">
                <span>日分</span>
            </div>

            <p class="s-need"></p>

            <div class="s-state pc-only">
                <span class="state-chip"></span>
            </div>
        </div>
    `).join('');

    SUPPLY_ITEMS.forEach(item => {
        document.getElementById(`stock-${item.key}`)
            .addEventListener('input', () => updateRow(item));

        const targetInput = document.getElementById(`target-${item.key}`);

        targetInput.addEventListener('input', () => {
            const days = parseNonNegativeInt(targetInput.value);

            if (days !== null && days >= 1) {
                targetDays[item.key] = days;
            }

            updateRow(item);
        });

        // 目標日数が決まったら上部の集計も計算し直す
        targetInput.addEventListener('change', updateSummary);
    });
}

// 避難所を選んで入力欄に値を入れる
function selectShelter(commonId) {
    const shelter = findShelter(commonId);

    if (!shelter) return;

    selectedId = shelter.common_id;

    const status = getStatus(selectedId);
    const name = shelter.shelter_name || '名称不明';

    document.getElementById('shelter-select').value = String(selectedId);
    document.getElementById('picker-name').textContent = name;
    document.getElementById('picker-stats-pc').textContent =
        getStatsText(status, 'pc');
    document.getElementById('picker-stats-sp').textContent =
        getStatsText(status, 'sp');
    document.getElementById('header-shelter-name').textContent = name;

    SUPPLY_ITEMS.forEach(item => {
        document.getElementById(`stock-${item.key}`).value =
            Number(status[item.field]) || 0;
        updateRow(item);
    });

    setMessage('');

    // 再読み込みしても同じ避難所を表示できるようにURLを更新
    const url = new URL(location.href);
    url.searchParams.set('id', selectedId);
    history.replaceState(null, '', url);
}

// 1行分の計算結果を表示する
function updateRow(item) {
    const row = document.querySelector(`.supply-row[data-key="${item.key}"]`);
    const stockInput = document.getElementById(`stock-${item.key}`);
    const targetInput = document.getElementById(`target-${item.key}`);

    const stock = parseNonNegativeInt(stockInput.value);
    const days = parseNonNegativeInt(targetInput.value);

    stockInput.setAttribute('aria-invalid', String(stock === null));
    targetInput.setAttribute(
        'aria-invalid',
        String(days === null || days < 1)
    );

    const people = Number(getStatus(selectedId).current_people) || 0;
    const result = calcSupply(
        item,
        stock ?? 0,
        people,
        days !== null && days >= 1 ? days : targetDays[item.key]
    );

    row.dataset.level = result.level;

    row.querySelector('.remain-badge').textContent =
        result.remainingDays === null ? '—' : `残${result.remainingDays}日`;

    const need = row.querySelector('.s-need');
    const isShort = result.shortage > 0;
    need.classList.toggle('is-zero', !isShort);

    if (window.matchMedia('(max-width: 700px)').matches) {
        need.textContent = isShort
            ? `必要量: ${formatNumber(result.required)}${item.unit}　` +
              `不足: ${formatNumber(result.shortage)}${item.unit} 要補充`
            : `必要量: ${formatNumber(result.required)}${item.unit}　不足なし`;
    } else {
        need.textContent = isShort
            ? `+ ${formatNumber(result.shortage)} ${item.unit}`
            : '—';
    }

    row.querySelector('.state-chip').textContent = isShort ? '要補充' : '充足';
}

function updateAllRows() {
    SUPPLY_ITEMS.forEach(updateRow);
}

// 上部の集計を計算する
function updateSummary() {
    let totalPeople = 0;
    let totalCapacity = 0;
    let attentionCount = 0;
    let sufficiencySum = 0;
    let sufficiencyCount = 0;

    shelterList.forEach(shelter => {
        const status = getStatus(shelter.common_id);
        const people = Number(status.current_people) || 0;

        totalPeople += people;
        totalCapacity += Number(status.capacity) || 0;

        const crowding = getCrowdingInfo(status).className;
        let needsAttention = crowding === 'crowded' || crowding === 'full';

        if (people > 0) {
            let ratioSum = 0;

            SUPPLY_ITEMS.forEach(item => {
                const stock = Number(status[item.field]) || 0;
                const result = calcSupply(
                    item, stock, people, targetDays[item.key]
                );

                if (result.shortage > 0) needsAttention = true;

                ratioSum += Math.min(1, stock / result.required);
            });

            sufficiencySum += ratioSum / SUPPLY_ITEMS.length;
            sufficiencyCount++;
        }

        if (needsAttention) attentionCount++;
    });

    document.getElementById('sum-shelters').textContent =
        `${formatNumber(shelterList.length)}件`;
    document.getElementById('sum-attention').textContent =
        `${formatNumber(attentionCount)}件`;
    document.getElementById('sum-people').textContent =
        `${formatNumber(totalPeople)}人`;
    document.getElementById('sum-capacity').textContent =
        `定員 ${formatNumber(totalCapacity)}人 中`;
    document.getElementById('sum-sufficiency').textContent =
        sufficiencyCount === 0
            ? '—'
            : `${Math.round(sufficiencySum / sufficiencyCount * 100)}%`;
}

function setMessage(text, type) {
    const message = document.getElementById('save-message');
    message.textContent = text;
    message.className = 'save-message' + (type ? ` ${type}` : '');
}

// 物資情報を保存する
async function saveSupplies() {
    if (selectedId === null) return;

    const fields = {};

    for (const item of SUPPLY_ITEMS) {
        const input = document.getElementById(`stock-${item.key}`);
        const value = parseNonNegativeInt(input.value);

        if (value === null) {
            setMessage(
                `${item.label}の在庫には0以上の整数を入力してください。`,
                'error'
            );
            input.focus();
            return;
        }

        fields[item.field] = value;
    }

    const commonId = selectedId;
    const saveButton = document.getElementById('save-button');
    saveButton.disabled = true;
    saveButton.textContent = '更新中...';
    setMessage('');

    try {
        await updateShelterStatus(commonId, fields);

        statusData[commonId] = {
            ...statusData[commonId],
            ...fields
        };

        refreshShelterOption(commonId);
        updateSummary();

        if (selectedId === commonId) {
            updateAllRows();
        }

        setMessage('物資情報を更新しました。', 'success');

    } catch (error) {
        console.error('更新エラー:', error);
        setMessage('更新できませんでした。サーバーを確認してください。', 'error');

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '物資情報を更新する';
    }
}

// 入力を保存前の値に戻す
function resetInputs() {
    if (selectedId !== null) {
        selectShelter(selectedId);
    }
}

document.getElementById('shelter-select').addEventListener(
    'change',
    event => selectShelter(event.target.value)
);

document.getElementById('save-button').addEventListener(
    'click',
    saveSupplies
);

document.getElementById('cancel-button').addEventListener(
    'click',
    resetInputs
);

// 画面幅でPC・スマホの表示が変わったら文言を切り替える
window.matchMedia('(max-width: 700px)').addEventListener(
    'change',
    () => {
        if (selectedId !== null) updateAllRows();
    }
);

loadData();
