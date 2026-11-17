
// 避難所情報を保存する配列
let shelterList = [];

// 避難所の管理情報を保存するオブジェクト
let statusData = {};

// HTMLに表示する文字列を安全に変換
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

// 混雑状況を判定
function getCrowdingInfo(status) {
    const people = Number(status.current_people) || 0;
    const capacity = Number(status.capacity) || 0;

    if (capacity <= 0) {
        return {
            label: '未設定',
            className: 'unknown'
        };
    }

    const rate = people / capacity * 100;

    if (rate >= 100) {
        return {
            label: '満員',
            className: 'full'
        };
    }

    if (rate >= 50) {
        return {
            label: 'やや混雑',
            className: 'crowded'
        };
    }

    return {
        label: '空きあり',
        className: 'available'
    };
}

// 避難所情報を取得
async function loadShelters() {
    const loading = document.getElementById('loading');
    loading.textContent = '避難所情報を読み込んでいます...';

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

        loading.classList.add('hidden');

        displayShelters();

    } catch (error) {
        console.error('読み込みエラー:', error);
        loading.textContent =
            'データを取得できませんでした。サーバーを確認してください。';
    }
}

// 一覧表を表示
function displayShelters() {
    const tbody = document.getElementById('shelter-table-body');
    const searchText = document
        .getElementById('search-input')
        .value.trim()
        .toLowerCase();

    tbody.innerHTML = '';

    const filteredShelters = shelterList.filter(shelter => {
        const name = String(shelter.shelter_name || '').toLowerCase();
        const address = String(shelter.address || '').toLowerCase();

        return name.includes(searchText) ||
               address.includes(searchText);
    });

    filteredShelters.forEach(shelter => {
        const commonId = shelter.common_id;

        const status = statusData[commonId] || {
            current_people: 0,
            capacity: 0,
            supplies_water: 0,
            supplies_food: 0,
            supplies_blanket: 0
        };

        const crowding = getCrowdingInfo(status);

        const row = document.createElement('tr');

        row.innerHTML = `
            <td>${escapeHTML(shelter.shelter_name)}</td>

            <td>
                <span class="status ${crowding.className}">
                    ${crowding.label}
                </span>
            </td>

            <td>${Number(status.current_people) || 0}人</td>
            <td>${Number(status.capacity) || 0}人</td>
            <td>${Number(status.supplies_water) || 0}L</td>
            <td>${Number(status.supplies_food) || 0}食</td>
            <td>${Number(status.supplies_blanket) || 0}枚</td>

            <td>
                <button
                    class="edit-button"
                    data-id="${escapeHTML(commonId)}">
                    編集
                </button>
            </td>
        `;

        tbody.appendChild(row);
    });

    // 編集ボタンにイベントを設定
    tbody.querySelectorAll('.edit-button').forEach(button => {
        button.addEventListener('click', function () {
            openEditModal(this.dataset.id);
        });
    });

    updateSummary();
}

// 上部の集計情報を更新
function updateSummary() {
    let totalPeople = 0;
    let fullCount = 0;

    shelterList.forEach(shelter => {
        const status = statusData[shelter.common_id] || {};
        const people = Number(status.current_people) || 0;

        totalPeople += people;

        if (getCrowdingInfo(status).className === 'full') {
            fullCount++;
        }
    });

    document.getElementById('shelter-count').textContent =
        shelterList.length.toLocaleString();

    document.getElementById('people-count').textContent =
        totalPeople.toLocaleString();

    document.getElementById('full-count').textContent =
        fullCount.toLocaleString();
}

// 編集画面を開く
function openEditModal(commonId) {
    const shelter = shelterList.find(
        item => item.common_id === commonId
    );

    if (!shelter) return;

    const status = statusData[commonId] || {};

    document.getElementById('edit-common-id').value = commonId;

    document.getElementById('edit-shelter-name').textContent =
        shelter.shelter_name || '名称不明';

    document.getElementById('edit-people').value =
        Number(status.current_people) || 0;

    document.getElementById('edit-capacity').value =
        Number(status.capacity) || 0;

    document.getElementById('edit-water').value =
        Number(status.supplies_water) || 0;

    document.getElementById('edit-food').value =
        Number(status.supplies_food) || 0;

    document.getElementById('edit-blanket').value =
        Number(status.supplies_blanket) || 0;

    document.getElementById('edit-modal').classList.remove('hidden');
}

// 編集画面を閉じる
function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
}

// 入力値を確認
function getEditValues() {
    const fields = [
        'edit-people',
        'edit-capacity',
        'edit-water',
        'edit-food',
        'edit-blanket'
    ];

    const values = {};

    for (const fieldId of fields) {
        const value = document.getElementById(fieldId).value;

        if (
            value.trim() === '' ||
            !Number.isSafeInteger(Number(value)) ||
            Number(value) < 0
        ) {
            alert('人数や物資数には0以上の整数を入力してください。');
            return null;
        }

        values[fieldId] = Number(value);
    }

    return values;
}

// 避難所情報を更新
async function saveShelterData() {
    const commonId = document.getElementById('edit-common-id').value;
    const values = getEditValues();

    if (!values) return;

    const saveButton = document.getElementById('save-button');
    saveButton.disabled = true;
    saveButton.textContent = '更新中...';

    try {
        const response = await fetch('/api/status/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                common_id: commonId,
                current_people: values['edit-people'],
                capacity: values['edit-capacity'],
                supplies_water: values['edit-water'],
                supplies_food: values['edit-food'],
                supplies_blanket: values['edit-blanket']
            })
        });

        if (!response.ok) {
            throw new Error('更新に失敗しました。');
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error('データベースへの保存に失敗しました。');
        }

        // 画面上の管理情報も更新
        statusData[commonId] = {
            ...statusData[commonId],
            current_people: values['edit-people'],
            capacity: values['edit-capacity'],
            supplies_water: values['edit-water'],
            supplies_food: values['edit-food'],
            supplies_blanket: values['edit-blanket']
        };

        displayShelters();
        closeEditModal();

        alert('避難所情報を更新しました！');

    } catch (error) {
        console.error('更新エラー:', error);
        alert('更新できませんでした。サーバーを確認してください。');

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '更新する';
    }
}

// 各ボタンのイベント設定
document.getElementById('search-input').addEventListener(
    'input',
    displayShelters
);

document.getElementById('reload-button').addEventListener(
    'click',
    loadShelters
);

document.getElementById('cancel-button').addEventListener(
    'click',
    closeEditModal
);

document.getElementById('save-button').addEventListener(
    'click',
    saveShelterData
);

// 初期表示
loadShelters();
