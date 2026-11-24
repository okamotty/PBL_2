
// 避難所情報を保存する配列
let shelterList = [];

// 避難所の管理情報を保存するオブジェクト
let statusData = {};

// 人数変更画面で編集中の避難所ID
let editingCommonId = null;

// 避難所情報を取得
async function loadShelters() {
    const loading = document.getElementById('loading');
    loading.textContent = '避難所情報を読み込んでいます...';
    loading.classList.remove('hidden');

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
        const suppliesUrl =
            '/manage/supplies?id=' + encodeURIComponent(commonId);

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

            <td class="action-cell">
                <button
                    type="button"
                    class="edit-button"
                    data-id="${escapeHTML(commonId)}">
                    人数変更
                </button>
                <a class="supplies-link" href="${escapeHTML(suppliesUrl)}">
                    物資更新
                </a>
            </td>
        `;

        tbody.appendChild(row);
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

// 人数変更画面を開く
function openPeopleModal(commonId) {
    const shelter = shelterList.find(
        item => String(item.common_id) === String(commonId)
    );

    if (!shelter) return;

    const status = statusData[shelter.common_id] || {};
    const people = Number(status.current_people) || 0;
    const capacity = Number(status.capacity) || 0;
    const crowding = getCrowdingInfo(status);
    const rate = getUsageRate(status);

    editingCommonId = shelter.common_id;

    document.getElementById('people-current-card').dataset.level =
        crowding.className;

    document.getElementById('people-shelter-name').textContent =
        shelter.shelter_name || '名称不明';

    const badge = document.getElementById('people-badge');
    badge.textContent = crowding.label;
    badge.dataset.level = crowding.className;

    document.getElementById('people-current-count').textContent =
        people.toLocaleString();

    document.getElementById('people-capacity-text').textContent =
        capacity > 0
            ? `/ ${capacity.toLocaleString()}人`
            : '/ 収容人数未設定';

    document.getElementById('people-meter-fill').style.width =
        `${Math.min(rate ?? 0, 100)}%`;

    document.getElementById('people-rate').textContent =
        rate === null ? '—' : `${rate}%`;

    document.getElementById('people-input').value = people;
    document.getElementById('people-capacity-input').value = capacity;

    document.getElementById('people-modal').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

// 人数変更画面を閉じる
function closePeopleModal() {
    editingCommonId = null;
    document.getElementById('people-modal').classList.add('hidden');
    document.body.classList.remove('modal-open');
}

// ボタンで避難者数を増減（0未満にはしない）
function stepPeople(amount) {
    const input = document.getElementById('people-input');
    const current = parseNonNegativeInt(input.value) ?? 0;

    input.value = Math.max(0, current + amount);
}

// 避難者数・収容人数を更新
async function savePeople() {
    if (editingCommonId === null) return;

    const people = parseNonNegativeInt(
        document.getElementById('people-input').value
    );
    const capacity = parseNonNegativeInt(
        document.getElementById('people-capacity-input').value
    );

    if (people === null || capacity === null) {
        alert('避難者数と収容人数には0以上の整数を入力してください。');
        return;
    }

    const commonId = editingCommonId;
    const saveButton = document.getElementById('people-save');
    saveButton.disabled = true;
    saveButton.textContent = '更新中...';

    try {
        await updateShelterStatus(commonId, {
            current_people: people,
            capacity: capacity
        });

        // 画面上の管理情報も更新
        statusData[commonId] = {
            ...statusData[commonId],
            current_people: people,
            capacity: capacity
        };

        displayShelters();
        closePeopleModal();

        alert('避難者数を更新しました！');

    } catch (error) {
        console.error('更新エラー:', error);
        alert('更新できませんでした。サーバーを確認してください。');

    } finally {
        saveButton.disabled = false;
        saveButton.textContent = '変更を確定する';
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

// 一覧の「人数変更」ボタン
document.getElementById('shelter-table-body').addEventListener(
    'click',
    function (event) {
        const button = event.target.closest('.edit-button');

        if (button) {
            openPeopleModal(button.dataset.id);
        }
    }
);

// 人数変更画面のボタン
document.getElementById('people-modal').addEventListener(
    'click',
    function (event) {
        // 背景をクリックしたら閉じる
        if (event.target === this) {
            closePeopleModal();
            return;
        }

        if (event.target.closest('[data-close-people]')) {
            closePeopleModal();
            return;
        }

        const stepButton = event.target.closest('[data-step]');

        if (stepButton) {
            stepPeople(Number(stepButton.dataset.step));
        }
    }
);

document.getElementById('people-save').addEventListener(
    'click',
    savePeople
);

// Escキーで人数変更画面を閉じる
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && editingCommonId !== null) {
        closePeopleModal();
    }
});

// 初期表示
loadShelters();
