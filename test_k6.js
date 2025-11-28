import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// 自訂 metrics
const backendCounter = new Counter('backend_hits');
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const nearbyResponseTime = new Trend('nearby_response_time');

// 測試配置
export const options = {
    scenarios: {
        // 場景 1: 負載測試 - 模擬真實用戶行為
        load_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 10 },  // 爬升到 10 用戶
                { duration: '1m', target: 50 },   // 爬升到 50 用戶
                { duration: '2m', target: 50 },   // 維持 50 用戶
                { duration: '30s', target: 0 },   // 降回 0
            ],
            gracefulRampDown: '30s',
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<500'],        // 95% 請求 < 500ms
        'http_req_duration{name:nearby}': ['p(95)<300'], // nearby API < 300ms
        'http_req_failed': ['rate<0.01'],         // 錯誤率 < 1%
        'cache_hits': ['count>0'],                 // 至少要有快取命中
    },
};

// 測試數據 - 台北市不同位置
const testLocations = [
    { name: '台北車站', lat: 25.0478, lng: 121.5170 },
    { name: '信義區', lat: 25.0330, lng: 121.5654 },
    { name: '士林', lat: 25.0938, lng: 121.5262 },
    { name: '大安區', lat: 25.0263, lng: 121.5436 },
    { name: '中山區', lat: 25.0629, lng: 121.5250 },
];

const testRadii = [1000, 3000, 5000]; // 1km, 3km, 5km

// 模擬用戶登入取得 token (如果需要)
function getAuthToken() {
    // 如果 API 需要認證，先登入
    const loginRes = http.post('http://localhost/auth/login', JSON.stringify({
        email: 'test@example.com',
        password: 'testpassword'
    }), {
        headers: { 'Content-Type': 'application/json' },
    });
    
    if (loginRes.status === 200) {
        return loginRes.json('token');
    }
    return null;
}

export default function () {
    // 隨機選擇測試位置和範圍
    const location = testLocations[Math.floor(Math.random() * testLocations.length)];
    const radius = testRadii[Math.floor(Math.random() * testRadii.length)];
    
    // 設定請求參數
    const params = {
        headers: {
            'Content-Type': 'application/json',
        },
        tags: { name: 'nearby' },
    };

    // 測試 1: 查詢附近商家
    const nearbyUrl = `http://localhost/user/nearby?lat=${location.lat}&lng=${location.lng}&radius=${radius}&limit=50`;
    const nearbyRes = http.get(nearbyUrl, params);
    
    // 檢查回應
    const nearbyCheck = check(nearbyRes, {
        'nearby: status is 200': (r) => r.status === 200,
        'nearby: has data': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.success && Array.isArray(body.data);
            } catch {
                return false;
            }
        },
        'nearby: response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (nearbyCheck && nearbyRes.status === 200) {
        const body = JSON.parse(nearbyRes.body);
        
        // 記錄快取命中/未命中
        if (body.source === 'redis') {
            cacheHits.add(1);
        } else if (body.source === 'mysql') {
            cacheMisses.add(1);
        }
        
        // 記錄回應時間
        nearbyResponseTime.add(nearbyRes.timings.duration);
        
        // 記錄後端處理時間
        if (body.timeMs) {
            console.log(`${location.name} (${radius}m): ${body.timeMs}ms, source: ${body.source}, count: ${body.data.length}`);
        }
    }

    // 測試 2: 重複查詢同一位置（測試快取效果）
    if (Math.random() < 0.3) { // 30% 機率重複查詢
        sleep(0.1);
        const cachedRes = http.get(nearbyUrl, params);
        
        check(cachedRes, {
            'cached: status is 200': (r) => r.status === 200,
            'cached: faster than first query': (r) => r.timings.duration < nearbyRes.timings.duration,
        });
        
        if (cachedRes.status === 200) {
            const cachedBody = JSON.parse(cachedRes.body);
            if (cachedBody.source === 'redis') {
                cacheHits.add(1);
            }
        }
    }

    // 測試 3: 負載均衡測試
    const healthRes = http.get('http://localhost/health', {
        tags: { name: 'health' },
    });
    
    check(healthRes, {
        'health: status is 200': (r) => r.status === 200,
    });

    // 模擬用戶思考時間
    sleep(Math.random() * 2 + 1); // 1-3 秒
}

// 測試開始時執行
export function setup() {
    console.log('='.repeat(80));
    console.log('🚀 K6 負載測試開始');
    console.log('='.repeat(80));
    console.log('測試位置:', testLocations.length, '個');
    console.log('測試範圍:', testRadii.join(', '), 'm');
    console.log('='.repeat(80));
}

// 測試結束時執行
export function teardown(data) {
    console.log('='.repeat(80));
    console.log('✅ K6 負載測試完成');
    console.log('='.repeat(80));
}
