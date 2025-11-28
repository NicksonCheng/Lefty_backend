/**
 * K6 Redis 快取效能測試
 * 專門測試 Redis 快取對 /user/nearby API 的效能影響
 * 
 * 執行方式：
 * k6 run test_k6_redis.js
 * 
 * 產生 HTML 報告：
 * k6 run --out json=test_results.json test_k6_redis.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';

// 自訂 metrics
const cacheHits = new Counter('cache_hits');
const cacheMisses = new Counter('cache_misses');
const cacheHitRate = new Rate('cache_hit_rate');
const cachedResponseTime = new Trend('cached_response_time');
const uncachedResponseTime = new Trend('uncached_response_time');

// 測試配置
export const options = {
    scenarios: {
        // 場景 1: 快取預熱
        warmup: {
            executor: 'per-vu-iterations',
            vus: 5,
            iterations: 1,
            maxDuration: '30s',
            exec: 'warmupCache',
        },
        // 場景 2: 快取命中率測試
        cache_hit_test: {
            executor: 'constant-vus',
            vus: 20,
            duration: '1m',
            startTime: '35s', // warmup 完成後開始
            exec: 'testCacheHits',
        },
        // 場景 3: 壓力測試
        stress_test: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '30s', target: 50 },
                { duration: '1m', target: 100 },
                { duration: '30s', target: 150 },
                { duration: '1m', target: 150 },
                { duration: '30s', target: 0 },
            ],
            startTime: '2m', // cache_hit_test 完成後開始
            exec: 'stressTest',
        },
    },
    thresholds: {
        'http_req_duration': ['p(95)<1000'],
        'http_req_duration{cached:yes}': ['p(95)<50'],     // 快取請求 < 50ms
        'http_req_duration{cached:no}': ['p(95)<500'],     // 未快取 < 500ms
        'http_req_failed': ['rate<0.01'],
        'cache_hit_rate': ['rate>0.7'],                    // 快取命中率 > 70%
        'cached_response_time': ['p(95)<50'],
        'uncached_response_time': ['p(95)<500'],
    },
};

// 測試數據
const testQueries = [
    // 台北車站周圍
    { lat: 25.0478, lng: 121.5170, radius: 1000, name: '台北車站_1km' },
    { lat: 25.0478, lng: 121.5170, radius: 3000, name: '台北車站_3km' },
    { lat: 25.0478, lng: 121.5170, radius: 5000, name: '台北車站_5km' },
    
    // 信義區
    { lat: 25.0330, lng: 121.5654, radius: 1000, name: '信義區_1km' },
    { lat: 25.0330, lng: 121.5654, radius: 3000, name: '信義區_3km' },
    
    // 士林
    { lat: 25.0938, lng: 121.5262, radius: 1000, name: '士林_1km' },
    { lat: 25.0938, lng: 121.5262, radius: 3000, name: '士林_3km' },
    
    // 大安區
    { lat: 25.0263, lng: 121.5436, radius: 1000, name: '大安區_1km' },
    { lat: 25.0263, lng: 121.5436, radius: 5000, name: '大安區_5km' },
];

// 場景 1: 快取預熱
export function warmupCache() {
    console.log('🔥 Warming up cache...');
    
    testQueries.forEach(query => {
        const url = `http://localhost/user/nearby?lat=${query.lat}&lng=${query.lng}&radius=${query.radius}&limit=50`;
        const res = http.get(url, {
            tags: { scenario: 'warmup', query: query.name },
        });
        
        check(res, {
            'warmup: status is 200': (r) => r.status === 200,
        });
        
        sleep(0.5);
    });
}

// 場景 2: 快取命中率測試
export function testCacheHits() {
    // 80% 查詢重複的位置（應該命中快取）
    // 20% 查詢新的位置（無快取）
    const shouldHitCache = Math.random() < 0.8;
    
    let query;
    if (shouldHitCache) {
        // 從預定義的查詢中隨機選擇（應該已經在快取中）
        query = testQueries[Math.floor(Math.random() * testQueries.length)];
    } else {
        // 生成隨機座標（不在快取中）
        query = {
            lat: 25.0 + Math.random() * 0.15,
            lng: 121.5 + Math.random() * 0.1,
            radius: [1000, 3000, 5000][Math.floor(Math.random() * 3)],
            name: 'random',
        };
    }
    
    const url = `http://localhost/user/nearby?lat=${query.lat}&lng=${query.lng}&radius=${query.radius}&limit=50`;
    const res = http.get(url, {
        tags: { 
            scenario: 'cache_test',
            query: query.name,
            expected_cached: shouldHitCache ? 'yes' : 'no',
        },
    });
    
    const checks = check(res, {
        'cache_test: status is 200': (r) => r.status === 200,
        'cache_test: has data': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.success && Array.isArray(body.data);
            } catch {
                return false;
            }
        },
    });
    
    if (checks && res.status === 200) {
        try {
            const body = JSON.parse(res.body);
            const isCached = body.source === 'redis';
            
            // 記錄快取命中/未命中
            if (isCached) {
                cacheHits.add(1);
                cacheHitRate.add(1);
                cachedResponseTime.add(res.timings.duration);
                
                // 重新標記為 cached
                res.request.tags.cached = 'yes';
            } else {
                cacheMisses.add(1);
                cacheHitRate.add(0);
                uncachedResponseTime.add(res.timings.duration);
                
                res.request.tags.cached = 'no';
            }
            
            // 記錄詳細資訊
            if (Math.random() < 0.1) { // 10% 機率印出
                console.log(`[${query.name}] cached: ${isCached}, time: ${res.timings.duration.toFixed(2)}ms, results: ${body.data?.length || 0}`);
            }
        } catch (e) {
            console.error('Parse error:', e);
        }
    }
    
    sleep(0.5);
}

// 場景 3: 壓力測試
export function stressTest() {
    // 隨機選擇查詢（混合快取和非快取）
    const query = testQueries[Math.floor(Math.random() * testQueries.length)];
    
    const url = `http://localhost/user/nearby?lat=${query.lat}&lng=${query.lng}&radius=${query.radius}&limit=50`;
    const res = http.get(url, {
        tags: { 
            scenario: 'stress',
            query: query.name,
        },
    });
    
    check(res, {
        'stress: status is 200': (r) => r.status === 200,
        'stress: response time < 1000ms': (r) => r.timings.duration < 1000,
    });
    
    if (res.status === 200) {
        try {
            const body = JSON.parse(res.body);
            if (body.source === 'redis') {
                cacheHits.add(1);
                res.request.tags.cached = 'yes';
            } else {
                cacheMisses.add(1);
                res.request.tags.cached = 'no';
            }
        } catch (e) {
            // Ignore parse errors
        }
    }
    
    sleep(Math.random() * 0.5);
}

// 測試開始
export function setup() {
    console.log('='.repeat(80));
    console.log('🚀 K6 Redis 快取效能測試');
    console.log('='.repeat(80));
    console.log('測試場景:');
    console.log('  1. 快取預熱 (5 VUs × 1 iteration)');
    console.log('  2. 快取命中率測試 (20 VUs × 1 minute)');
    console.log('  3. 壓力測試 (0→150 VUs)');
    console.log('='.repeat(80));
    console.log('測試查詢:', testQueries.length, '種組合');
    console.log('='.repeat(80));
    
    // 測試連線
    const testRes = http.get('http://localhost/health');
    if (testRes.status !== 200) {
        console.error('❌ Backend is not ready!');
        throw new Error('Backend health check failed');
    }
    
    console.log('✅ Backend is ready');
}

// 測試結束
export function teardown(data) {
    console.log('='.repeat(80));
    console.log('✅ K6 測試完成');
    console.log('='.repeat(80));
}

// 產生 HTML 報告
export function handleSummary(data) {
    return {
        'summary.html': htmlReport(data),
        'stdout': JSON.stringify(data, null, 2),
    };
}
