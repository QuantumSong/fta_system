# FTA-System — 故障树智能生成与分析系统

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Ant%20Design-5.12-0170FE?logo=antdesign&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

基于 **大语言模型（DeepSeek）** 的故障树自动生成系统，集成知识图谱、RAG 增强、实时协作与可视化编辑，面向工业安全与可靠性工程场景。

---

## ✨ 核心特性

| 模块 | 说明 |
|------|------|
| **AI 故障树生成** | 输入顶事件描述，LLM 自动推理生成完整故障树结构（与/或门、中间事件、底事件） |
| **可视化编辑器** | 基于 ReactFlow 的交互式画布，支持拖拽、缩放、框选、连线样式、自动布局、导出 PNG |
| **知识图谱** | 上传工业文档 → 智能抽取实体与关系 → 构建知识图谱，支持力导向/环形/层次/网格四种可视化布局 |
| **RAG 增强** | 文档向量化检索 + 知识子图注入，提升故障树生成质量 |
| **实时协作** | WebSocket 多人实时同步编辑，协作码加入，成员管理 |
| **版本管理** | 故障树自动版本记录，支持历史回溯与恢复 |
| **验证分析** | 最小割集、结构重要度、概率计算等定量/定性分析 |
| **用户权限** | JWT 认证，管理员/普通用户角色，项目级权限控制 |

## 📐 系统架构

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  ReactFlow Editor · Knowledge Graph · Ant Design UI │
├─────────────────────────────────────────────────────┤
│                  Backend (FastAPI)                    │
│  REST API · WebSocket · Auth · RAG Pipeline          │
├──────────┬──────────┬───────────┬───────────────────┤
│  SQLite  │  Neo4j   │  Milvus   │  DeepSeek LLM     │
│  (数据)  │ (图谱)   │ (向量)    │  (AI 推理)        │
└──────────┴──────────┴───────────┴───────────────────┘
```

## 📁 项目结构

```
fta-system/
├── backend/                  # 后端服务
│   ├── src/
│   │   ├── api/v1/           # REST API 路由
│   │   │   ├── auth.py       # 认证（注册/登录/用户管理）
│   │   │   ├── projects.py   # 项目 CRUD
│   │   │   ├── fta.py        # 故障树 CRUD + AI 生成
│   │   │   ├── knowledge.py  # 知识实体/关系/图谱
│   │   │   ├── documents.py  # 文档上传与管理
│   │   │   ├── extraction.py # 知识抽取
│   │   │   ├── validation.py # 故障树验证与分析
│   │   │   ├── collaboration.py # 协作管理
│   │   │   └── ws.py         # WebSocket 实时同步
│   │   ├── models/           # SQLAlchemy ORM 模型
│   │   ├── services/         # 业务逻辑
│   │   │   ├── llm/          # DeepSeek LLM 调用
│   │   │   └── rag/          # RAG 检索增强
│   │   ├── core/             # 认证、数据库初始化
│   │   ├── config.py         # 配置管理
│   │   └── main.py           # 应用入口
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example          # 环境变量模板
│
├── frontend/                 # 前端应用
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Editor/       # 故障树可视化编辑器
│   │   │   ├── Knowledge/    # 知识图谱管理
│   │   │   ├── Projects/     # 项目管理
│   │   │   ├── Login/        # 登录/注册
│   │   │   └── Collaboration/ # 协作加入
│   │   ├── components/
│   │   │   ├── nodes/        # 故障树节点组件
│   │   │   └── common/       # 通用组件
│   │   ├── services/api.ts   # API 客户端
│   │   ├── stores/           # Zustand 状态管理
│   │   └── hooks/            # 自定义 Hooks
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── docker-compose.yml        # Docker 一键部署
├── LICENSE
└── README.md
```

## 🚀 快速开始

### 前置要求

- **Python** 3.10+
- **Node.js** 18+
- **DeepSeek API Key**（[申请地址](https://platform.deepseek.com/)）

### 1. 克隆项目

```bash
git clone https://github.com/QuantumSong/fta_system.git
cd fta_system
```

### 2. 启动后端

```bash
cd backend

# 创建虚拟环境
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY

# 启动服务
python src/main.py
```

后端默认运行在 `http://localhost:8000`，API 文档：`http://localhost:8000/docs`

### 3. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端默认运行在 `http://localhost:5173`

### 4. 初始化管理员账号

```bash
curl -X POST http://localhost:8000/api/v1/auth/init-admin
```

默认管理员账号：`admin` / `admin123`

### 5. Docker 一键部署（可选）

```bash
docker-compose up -d
```

包含：前端(Nginx)、后端(Uvicorn)、MySQL、Neo4j、Redis、Milvus、MinIO

## ⚙️ 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（**必填**） | — |
| `DEEPSEEK_API_URL` | DeepSeek API 地址 | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 模型名称 | `deepseek-chat` |
| `DEEPSEEK_TEMPERATURE` | 生成温度 | `0.1` |
| `DEBUG` | 调试模式 | `true` |
| `HOST` / `PORT` | 服务地址与端口 | `0.0.0.0` / `8000` |
| `JWT_SECRET` | JWT 签名密钥 | `your-secret-key-change-in-production` |
| `DB_PATH` | SQLite 数据库路径 | `./fta.db` |

## 🛠️ 技术栈

### 后端
- **FastAPI** — 异步 Web 框架
- **SQLAlchemy 2.0** + aiosqlite — 异步 ORM
- **DeepSeek LLM** — 大语言模型推理
- **scikit-learn** — TF-IDF 向量化检索
- **WebSocket** — 实时协作
- **python-jose** — JWT 认证

### 前端
- **React 18** + TypeScript
- **@xyflow/react (ReactFlow)** — 故障树可视化编辑
- **d3-force** — 知识图谱力导向布局
- **Ant Design 5** — UI 组件库
- **Zustand** — 状态管理
- **Vite** — 构建工具
- **Axios** — HTTP 客户端

### 基础设施（Docker 部署）
- MySQL 8.0、Neo4j 5、Redis 7、Milvus 2.3、MinIO

## 📸 功能预览

### 故障树编辑器
- 拖拽式节点操作，支持与门/或门/中间事件/底事件等节点类型
- 连线样式自定义（箭头、曲线、粗细、颜色、动画）
- 选择/拖拽模式切换，框选多节点批量操作
- 自动布局、对齐、撤销/重做、复制/粘贴
- 一键导出 PNG 图片

### 知识图谱
- 四种可视化布局：力导向、环形、层次、网格
- SVG 矢量渲染，滚轮缩放 + 画布平移 + 节点拖拽
- 悬浮详情、关系高亮、以节点为中心展开子图

### 知识抽取
- 上传 PDF/Word/Excel/TXT 文档，AI 自动抽取实体与关系
- 支持文本直接输入抽取
- 实时抽取进度展示

## 📄 License

[MIT](./LICENSE)
