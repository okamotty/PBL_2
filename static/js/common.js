// 管理画面・物資更新画面で共通して使う関数

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

// 利用率（%）を計算。収容人数が未設定ならnullを返す
function getUsageRate(status) {
    const people = Number(status.current_people) || 0;
    const capacity = Number(status.capacity) || 0;

    if (capacity <= 0) return null;

    return Math.round(people / capacity * 100);
}

// 0以上の整数ならその数値を、そうでなければnullを返す
function parseNonNegativeInt(value) {
    const text = String(value ?? '').trim();

    if (text === '') return null;

    const number = Number(text);

    if (!Number.isSafeInteger(number) || number < 0) return null;

    return number;
}

// 避難所の人数・物資を更新する（送った項目だけが更新される）
async function updateShelterStatus(commonId, fields) {
    const response = await fetch('/api/status/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            common_id: commonId,
            ...fields
        })
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || !result || !result.success) {
        throw new Error(
            (result && result.message) || '更新に失敗しました。'
        );
    }

    return result;
}
