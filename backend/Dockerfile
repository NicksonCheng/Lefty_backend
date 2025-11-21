FROM node:22-alpine
# 建議使用 LTS 版本 (例如 22) 且用 alpine 體積較小，node:25 較不穩定

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

# 修正：確保這裡的檔名與你實際的 src/servers.ts 一致
# 並且加上 --poll 參數以確保在不同作業系統(Windows/Mac)下能偵測到變更
CMD ["npx", "tsx", "watch", "--clear-screen=false", "src/server.ts"]