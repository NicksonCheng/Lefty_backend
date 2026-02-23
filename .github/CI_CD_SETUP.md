# CI/CD Pipeline Documentation

This document outlines the Continuous Integration (CI) and Continuous Deployment (CD) workflows for the project, ensuring code quality, stability, and automated deployments.

## 🚀 Pipeline Flowchart

```text
git push
    │
    ▼
Stage 1 Static Analysis
  ├── npm ci                  (Install Dependencies)
  ├── tsc --noEmit            (Type Checking)
  ├── eslint                  (Linting / Syntax Rules)
  └── npm audit               (Security Vulnerability Scan - non-blocking)
    │ Fail → Terminate
    ▼
Stage 2 Unit Tests
  ├── npm ci                  (Install Dependencies)
  └── jest                    (Execute Business Logic Tests)
    │ Fail → Terminate
    ▼
Stage 3 Build Verification
  ├── Create stub .env        (Mock environment variables)
  ├── docker compose config   (Syntax Validation)
  └── docker compose build    (Verify Dockerfile Correctness)
    │ All Successful
    ▼
Auto-trigger cd.yml → Deploy to Production
(CI All Passed)
    │
    ▼
Step 1  Print trigger source information (for logging)
    ↓
Step 2  Pull latest code
    ↓
Step 3  Create .env (from GitHub Secret or local file)
    ↓
Step 4  Rebuild only backend×3 + nginx (MySQL/Redis remain untouched)
    ↓
Step 5  Wait up to 90 seconds until /health responds
    ↓
Step 6  GET /health → Must return 200
    ↓
Step 7  GET /nearby → Must return 200 (Verify MySQL + Redis are normal)
    ↓
Step 8  GET /health/redis → Must contain 'activeClient' field
    ↓
Step 9  Check all 6 containers are 'running'
    ↓
    ✅ Deployment Successful
```
