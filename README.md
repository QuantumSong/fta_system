# FTA-System — 基于知识增强大模型的故障树智能生成与辅助分析系统

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/ReactFlow-12-FF0072?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Ant%20Design-5.12-0170FE?logo=antdesign&logoColor=white" />
  <img src="https://img.shields.io/badge/DeepSeek-LLM-4B32C3" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

面向工业安全与可靠性工程的 **故障树分析（FTA）智能辅助系统**，融合大语言模型（DeepSeek LLM）、知识图谱、RAG 检索增强生成技术，实现从工业文档到故障树的全流程自动化——**文档上传 → 知识抽取 → 图谱构建 → 智能建树 → 质量校验 → 基准评测**。

> **典型场景**：安全工程师上传设备维护手册，系统自动抽取故障实体与因果关系构建知识图谱，输入顶事件后 3 秒内生成 4 级深度、20+ 节点的专业故障树，五维度自动校验质量评分 95+，替代传统 2-3 天的人工分析周期。

---

## 🔬 关键技术创新点

### 创新点 1：知识图谱增强的大模型故障树生成（KG-Enhanced LLM Generation）

**问题**：纯大模型生成故障树容易产生"幻觉"——生成看似合理但不符合具体设备实际的故障模式。

**方案**：提出 **"知识图谱子图 + RAG 文档检索 + 相似案例参考"三源融合 Prompt 增强策略**：

| 信息源 | 作用 | 技术实现 |
|--------|------|----------|
| **知识图谱子图** | 注入领域实体（故障代码、严重等级、检测方法等工业元数据）约束生成 | 从 KG 中检索与顶事件相关的实体子图 |
| **RAG 文档检索** | 补充维护手册中的上下文细节 | TF-IDF 向量化 + 余弦相似度 Top-K 检索 |
| **相似历史案例** | 提供结构参考，提高一致性 | 历史故障树的结构化摘要匹配 |

三者融合注入 LLM Prompt，使生成结果既有大模型推理能力，又有领域知识约束和工程数据支撑，有效抑制幻觉问题。

### 创新点 2：五维度领域化质量校验 + AI 自动修复（Multi-Dimensional Validation）

**问题**：现有故障树工具仅提供基本结构检查，缺乏面向工业领域的深度质量评估。

**方案**：设计 **五维度 x 20+ 条规则的领域化校验引擎**：

| 维度 | 典型规则 | 严重等级 |
|------|----------|----------|
| **结构** | 循环依赖、孤立节点、根节点唯一性 | ERROR |
| **逻辑** | 门类型匹配、输入数量约束、门下挂载校验 | ERROR / WARNING |
| **数据** | 概率范围(0-1)、命名规范、标签缺失 | WARNING |
| **领域** | 因果方向合理性、粒度一致性、故障代码缺失、术语统一 | WARNING / SUGGESTION |
| **完备性** | 底事件覆盖度、中间层完整性、工业字段填充率 | SUGGESTION |

**亮点机制**：
- **精确定位** — 每条问题精确到具体节点/边/逻辑门，前端点击可自动跳转高亮
- **专家规则模块** — 领域专家可配置忽略/指导规则，将经验固化为可复用的知识
- **AI 一键修复** — 将结构化问题描述回传 LLM，自动生成修复后的故障树

### 创新点 3：双模式基准评测体系（Dual-Mode Benchmark Evaluation）

**问题**：故障树生成质量的量化评估在学术界缺乏标准方法。

**方案**：首次提出 **故障树生成质量的双模式量化评测体系**：

| 模式 | 适用场景 | 评测指标 |
|------|----------|----------|
| **标准树对比** | 有专家标注的 Gold Tree | 节点精确率/召回率/F1、边匹配度、深度误差、逻辑门一致性（6 维指标） |
| **AI 独立评测** | 无标准树 | 结构合理性、逻辑正确性、数据完整性、领域准确性、工业字段覆盖率（概率 + 5 项工业元数据） |

**核心算法**：标准树对比模式中使用基于编辑距离的模糊节点对齐算法（SequenceMatcher，阈值 0.6），解决命名不完全一致时的匹配问题。双模式互补，为 FTA 生成算法迭代提供闭环量化反馈。

### 创新点 4：文档驱动的知识图谱全流程自动构建（Document-Driven KG Construction）

**问题**：工业领域知识图谱构建成本高昂，传统方式需要领域专家手动标注。

**方案**：实现 **"文档 -> 知识 -> 故障树 -> 评测"闭环数据流管道**：

```
文档上传(PDF/Word/Excel/TXT)
    | LLM 智能抽取
知识实体 + 关系 (携带 8 项工业元数据)
    | 自动入库
知识图谱 (四种可视化布局供专家审核)
    | 子图检索 + RAG
反哺故障树生成 -> 质量校验 -> 基准评测
```

**抽取的实体携带 8 项工业元数据**：故障代码、故障模式、严重等级、检测方法、参数名称、参数阈值、AMM 维修参考、证据等级。知识形成正向积累循环——越多文档 -> 越丰富的图谱 -> 越准确的故障树生成。

---

## ✨ 功能模块

| 模块 | 说明 |
|------|------|
| **AI 故障树生成** | 输入顶事件，LLM 结合知识图谱 + RAG + 历史案例自动生成完整故障树（支持 7 种逻辑门） |
| **多文档联合建树** | 选择多份文档联合分析，加权融合多源信息生成更完整的故障树 |
| **可视化编辑器** | 基于 ReactFlow 的专业画布：拖拽/缩放/框选/连线样式/自动布局/撤销重做/导出 PNG |
| **知识图谱管理** | 实体与关系的 CRUD、全局/项目隔离、力导向/环形/层次/网格四种可视化布局 |
| **智能知识抽取** | 上传文档 AI 自动抽取实体与关系，携带故障代码、严重等级等工业元数据 |
| **五维度质量校验** | 结构/逻辑/数据/领域/完备性 20+ 条规则，精确定位 + AI 一键修复 |
| **专家规则模块** | 领域专家可配置忽略/指导/自定义校验规则，固化领域经验 |
| **基准评测系统** | 标准树对比（6 维指标）+ AI 独立评测双模式，评测历史可追溯 |
| **实时协作** | WebSocket 多人实时同步编辑，协作码加入，成员与权限管理 |
| **版本管理** | 故障树自动版本记录，支持历史对比与一键回溯 |
| **证据追溯** | 节点/边的知识来源追溯，关联文档原文高亮定位 |
| **用户权限** | JWT 认证，管理员/普通用户角色，项目级权限控制 |

## 📐 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (React 18 + TypeScript)           │
│  ReactFlow Editor · Knowledge Graph (D3) · Ant Design 5 UI      │
├─────────────────────────────────────────────────────────────────┤
│                       Backend (FastAPI + Async)                  │
│  REST API · WebSocket 协作 · JWT Auth · RAG Pipeline             │
├──────────┬────────────────┬────────────────┬────────────────────┤
│  SQLite  │ KG Engine      │ RAG Service    │ DeepSeek LLM       │
│  (持久化) │ (实体/关系/图谱) │ (TF-IDF检索)   │ (生成/抽取/评测)    │
└──────────┴────────────────┴────────────────┴────────────────────┘
```

### 数据流

```
工业文档 ──→ 智能抽取 ──→ 知识图谱 ──→ KG子图 + RAG检索 ──→ LLM生成故障树
                                                                    │
                                                         ┌──────────┤
                                                         ▼          ▼
                                                   五维度校验    基准评测
                                                         │          │
                                                   AI自动修复  评测报告
```

## 📁 项目结构

```
fta-system/
├── backend/                       # Python 后端服务
│   ├── src/
│   │   ├── api/v1/                # REST API 路由
│   │   │   ├── auth.py            # 用户认证（注册/登录/管理）
│   │   │   ├── projects.py        # 项目管理 CRUD
│   │   │   ├── fta.py             # 故障树 CRUD + AI 生成 + 证据追溯
│   │   │   ├── knowledge.py       # 知识实体/关系/图谱可视化
│   │   │   ├── documents.py       # 文档上传与管理
│   │   │   ├── extraction.py      # LLM 知识抽取
│   │   │   ├── validation.py      # 五维度校验 + AI 修复
│   │   │   ├── benchmark.py       # 基准评测（标准树对比 + AI 评测）
│   │   │   ├── expert.py          # 专家规则 CRUD
│   │   │   ├── multidoc.py        # 多文档联合建树
│   │   │   ├── collaboration.py   # 协作管理
│   │   │   └── ws.py              # WebSocket 实时同步
│   │   ├── models/                # SQLAlchemy ORM 数据模型
│   │   ├── services/
│   │   │   ├── generation/        # 故障树生成引擎（KG+RAG+LLM 融合）
│   │   │   ├── validation/        # 领域化逻辑校验器（20+ 规则）
│   │   │   ├── evaluation/        # 评测引擎（节点对齐 + 指标计算）
│   │   │   ├── extraction/        # 知识抽取流水线
│   │   │   └── rag/               # RAG 检索服务（TF-IDF + 知识子图）
│   │   ├── schemas/               # 工业领域 Schema 定义
│   │   ├── core/                  # LLM 客户端、认证、数据库
│   │   ├── config.py              # 配置管理
│   │   └── main.py                # 应用入口
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                      # React 前端应用
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Editor/            # 故障树可视化编辑器（ReactFlow）
│   │   │   ├── Knowledge/         # 知识图谱 + 文档管理 + 实体管理
│   │   │   ├── Benchmark/         # 基准评测仪表盘
│   │   │   ├── ExpertMode/        # 专家规则管理
│   │   │   ├── Projects/          # 项目管理
│   │   │   ├── Settings/          # 系统设置
│   │   │   ├── Login/             # 登录/注册
│   │   │   └── Collaboration/     # 协作加入
│   │   ├── components/
│   │   │   ├── nodes/             # 自定义故障树节点组件（7 种类型）
│   │   │   └── ValidationPanel/   # 校验结果面板
│   │   ├── services/api.ts        # 统一 API 客户端
│   │   ├── schemas/               # 工业 Schema 前端定义
│   │   ├── stores/                # Zustand 状态管理
│   │   └── hooks/                 # 自定义 Hooks（协作 WebSocket 等）
│   ├── package.json
│   └── vite.config.ts
│
├── fta-system.ico                 # 项目图标
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

### 4. 初始化系统

```bash
# 初始化管理员账号（admin / admin123）
curl -X POST http://localhost:8000/api/v1/auth/init-admin

# （可选）创建演示项目数据
# 登录后在系统中调用 POST /api/v1/demo/seed 即可创建 5 个预设演示项目
```

### 5. 演示项目

系统内置 5 个演示项目，涵盖不同复杂度场景：

| 项目 | 复杂度 | 节点数 | 知识实体 | 专家规则 | 标准树 |
|------|--------|--------|----------|----------|--------|
| 航空液压系统故障分析 | 复杂 | 20 | 15 实体 / 18 关系 | 3 条 | ✓ |
| 工业电气控制系统故障分析 | 中等 | 14 | 7 实体 / 6 关系 | 1 条 | ✓ |
| 车辆制动系统故障分析 | 复杂 | 19 | 7 实体 / 6 关系 | 2 条 | ✓ |
| 水泵电机故障快速分析 | 简单 | 5 | 3 实体 / 2 关系 | — | — |
| 消防喷淋系统故障分析 | 简单 | 10 | 3 实体 / 2 关系 | — | — |

## ⚙️ 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥（**必填**） | — |
| `DEEPSEEK_API_URL` | DeepSeek API 地址 | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 模型名称 | `deepseek-chat` |
| `DEEPSEEK_TEMPERATURE` | 生成温度 | `0.1` |
| `DEEPSEEK_MAX_TOKENS` | 最大生成 Token 数 | `4000` |
| `DEBUG` | 调试模式 | `true` |
| `HOST` / `PORT` | 服务地址与端口 | `0.0.0.0` / `8000` |
| `JWT_SECRET` | JWT 签名密钥 | `your-secret-key-change-in-production` |
| `DB_PATH` | SQLite 数据库路径 | `./fta.db` |

## 🛠️ 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端框架** | React 18 + TypeScript | SPA 应用 |
| **可视化编辑** | @xyflow/react (ReactFlow v12) | 故障树画布引擎 |
| **图谱可视化** | D3.js (d3-force) | 力导向/环形/层次/网格布局 |
| **UI 组件** | Ant Design 5 | 企业级组件库 |
| **状态管理** | Zustand | 轻量响应式 |
| **构建工具** | Vite 5 | 开发 & 打包 |
| **后端框架** | FastAPI | 高性能异步 Web 框架 |
| **ORM** | SQLAlchemy 2.0 + aiosqlite | 异步数据库访问 |
| **大模型** | DeepSeek LLM | 生成/抽取/评测/修复 |
| **检索** | scikit-learn (TF-IDF) | RAG 向量化检索 |
| **实时通信** | WebSocket | 多人协作同步 |
| **认证** | python-jose + bcrypt | JWT + 密码哈希 |

## 📸 功能概览

### 故障树可视化编辑器
- 7 种节点类型：顶事件、中间事件、底事件、外部事件、未展开事件、与门(AND)、或门(OR)、异或门(XOR)、禁止门、表决门、优先与门
- 拖拽放置、连线样式自定义（类型/颜色/粗细/箭头/动画）
- 框选/拖拽模式切换、对齐网格、自动树形布局
- 撤销/重做、复制/粘贴/剪切、右键上下文菜单
- 节点属性面板（概率、描述、工业元数据）
- 导入/导出（JSON + OpenPSA XML）、导出 PNG

### 知识图谱与智能抽取
- 文档上传（PDF/Word/Excel/TXT）→ AI 自动抽取实体与关系
- 实体携带完整工业元数据：故障代码、故障模式、严重等级、检测方法、参数阈值、维修参考、证据等级
- 知识图谱四种可视化布局（力导向/环形/层次/网格）+ SVG 交互
- 实体按全局/项目隔离，支持搜索、编辑、关系管理

### 质量校验与专家模式
- 五维度评分：结构(100) + 逻辑(100) + 数据(100) + 领域(100) + 完备性(100)
- 20+ 条校验规则，三级严重度（错误/警告/建议）
- 精确定位：点击问题项自动跳转到对应节点/边/逻辑门
- AI 一键自动修复 + 专家规则配置

### 基准评测仪表盘
- 标准树管理：创建/编辑 Gold Tree + 关系标注
- 标准树对比评测：节点精确率/召回率/F1、边匹配度、深度误差、门一致性
- AI 独立评测：无需标准树，LLM 多维度独立打分
- 评测历史追踪，支持多版本对比

## 📄 License

[MIT](./LICENSE)
