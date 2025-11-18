import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// 自訂 counter 來統計每個 backend 收到的請求數
const backendCounter = new Counter('backend_hits');

export let options = {
    stages: [
        { duration: '10s', target: 10 },
        { duration: '30s', target: 50 },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        'http_req_duration': [
            { threshold: 'p(95)<200', abortOnFail: false } // 95% 請求 < 200ms
        ],
    },
};

export default function () {
    const res = http.get('http://localhost');

    // 檢查回應是否成功
    check(res, { 'status is 200': (r) => r.status === 200 });

    // 從回應 body 判斷是哪個 backend 回應
    // 假設後端回傳: {"message":"Hello from backend1 (delay 50ms)"}
    const backendName = res.json().message.match(/Hello from (\w+)/)[1];
    // 計數
    backendCounter.add(1, { backend: backendName });

    sleep(1);
}
