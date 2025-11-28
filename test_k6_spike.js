/**
 * K6 尖峰流量測試 (Spike Test)
 * 測試系統在突然湧入大量用戶時的表現
 * 
 * 執行方式：
 * k6 run test_k6_spike.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// 自訂 metrics
const successRate = new Rate('success_rate');
const errorCounter = new Counter('errors');

export const options = {
    stages: [
        { duration: '10s', target: 10 },    // 正常流量
        { duration: '30s', target: 200 },   // 突然爆量！
        { duration: '1m', target: 200 },    // 維持高峰
        { duration: '10s', target: 10 },    // 回到正常
        { duration: '10s', target: 0 },     // 結束
    ],
    thresholds: {
        'http_req_duration': ['p(95)<2000'],      // 95% < 2秒
        'http_req_failed': ['rate<0.05'],         // 錯誤率 < 5%
        'success_rate': ['rate>0.95'],            // 成功率 > 95%
    },
};

const locations = [
    { lat: 25.0478, lng: 121.5170, radius: 3000 }, // 台北車站
    { lat: 25.0330, lng: 121.5654, radius: 3000 }, // 信義區
    { lat: 25.0938, lng: 121.5262, radius: 3000 }, // 士林
];

export default function () {
    const loc = locations[Math.floor(Math.random() * locations.length)];
    const url = `http://localhost/user/nearby?lat=${loc.lat}&lng=${loc.lng}&radius=${loc.radius}&limit=50`;
    
    const res = http.get(url, {
        timeout: '10s',
    });
    
    const success = check(res, {
        'status is 200': (r) => r.status === 200,
        'has valid response': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.success !== undefined;
            } catch {
                return false;
            }
        },
    });
    
    successRate.add(success);
    if (!success) {
        errorCounter.add(1);
        console.error(`Error: status=${res.status}, time=${res.timings.duration}ms`);
    }
    
    sleep(0.1);
}

export function setup() {
    console.log('🔥 Spike Test - 尖峰流量測試');
    console.log('將在 30 秒內從 10 → 200 用戶');
}

export function teardown(data) {
    console.log('✅ Spike Test 完成');
}
