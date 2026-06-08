# FB Auto Analytics 🚀

更简洁、更智能的 Facebook 广告发布与数据分析平台。

## 功能

- 📊 **可视化数据仪表盘** — 花费/展示/点击/转化趋势图、广告系列花费占比饼图、TOP 排行
- 🚀 **广告系列管理** — 创建、编辑、删除广告系列（支持 Traffic / Conversions 目标）
- 🎯 **广告组管理** — 受众定位（年龄/性别）、预算设置、出价策略
- 📢 **广告管理** — 广告创意（标题/正文/图片/CTA/链接）
- 📦 **批量发布** — CSV 模板下载 → 填写 → 上传 → 自动逐条创建，实时进度追踪
- 🔐 **Facebook OAuth 登录** — 安全授权，Token 加密存储，自动刷新

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 18 + TypeScript + Vite + Ant Design 5 + Recharts |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite (sql.js) |
| API | Facebook Marketing API (Graph API v19.0) |

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example server/.env
```

编辑 `server/.env`，填入你的 Facebook App 凭证：

```env
FACEBOOK_APP_ID=你的App ID
FACEBOOK_APP_SECRET=你的App Secret
FACEBOOK_REDIRECT_URI=http://localhost:3000/api/auth/callback
```

> **获取 Facebook App 凭证：**
> 1. 前往 [Facebook Developers](https://developers.facebook.com/)
> 2. 创建应用 → 选择「商务」类型
> 3. 添加「Marketing API」产品
> 4. 在设置中获取 App ID 和 App Secret
> 5. 配置 OAuth 重定向 URI: `http://localhost:3000/api/auth/callback`

### 2. 安装依赖

```bash
# 后端
cd server
npm install

# 前端
cd ../client
npm install
```

### 3. 启动

```bash
# 终端 1 - 启动后端 (https://localhost:3000)
cd server
npm run dev

# 终端 2 - 启动前端 (https://localhost:5173)
cd client
npm run dev
```

### 4. 使用

1. 浏览器打开 **`https://localhost:5173`**（必须用 HTTPS，用 `http://` 会连不上）
2. 点击「使用 Facebook 账号登录」
3. 授权后即可查看广告账户数据

## 项目结构

```
fb_auto_analytics/
├── client/                     # React 前端
│   └── src/
│       ├── components/         # UI 组件
│       │   ├── Analytics/      # 图表组件
│       │   ├── Common/         # 通用组件
│       │   └── Layout/         # 布局组件
│       ├── hooks/              # 自定义 Hooks
│       ├── pages/              # 页面
│       ├── services/           # API 调用
│       ├── store/              # Zustand 状态管理
│       └── types/              # TypeScript 类型
├── server/                     # Express 后端
│   └── src/
│       ├── config/             # 环境配置
│       ├── middleware/         # 中间件
│       ├── models/             # 数据库模型
│       ├── routes/             # API 路由
│       └── services/           # 业务逻辑 + Facebook SDK
├── .env.example
└── README.md
```

## API 端点

```
GET    /api/auth/login           Facebook OAuth 登录
GET    /api/auth/callback         OAuth 回调
GET    /api/auth/status           登录状态

GET    /api/accounts              广告账户列表

GET    /api/campaigns             广告系列列表
POST   /api/campaigns             创建广告系列
PUT    /api/campaigns/:id         更新广告系列
DELETE /api/campaigns/:id         删除广告系列

GET    /api/adsets                广告组列表
POST   /api/adsets                创建广告组

GET    /api/ads                   广告列表
POST   /api/ads                   创建广告

GET    /api/insights/overview     仪表盘总览
GET    /api/insights/trends       趋势数据
GET    /api/insights/campaigns    广告系列指标

GET    /api/batch/template        下载 CSV 模板
POST   /api/batch/upload          上传 CSV 批量创建
GET    /api/batch/status/:jobId   批量任务进度
```

## Facebook App 所需权限

- `ads_read` — 读取广告数据
- `ads_management` — 管理广告
- `public_profile` — 用户基本信息
- `email` — 用户邮箱
