import React, { useEffect, useMemo, useState } from 'react'
import {
  Card, Form, Input, Button, Select, message, Slider, InputNumber,
  Switch, Row, Col, Divider, Tag, Tooltip, Typography, Space, Collapse,
} from 'antd'
import {
  SaveOutlined,
  RobotOutlined,
  ToolOutlined,
  InfoCircleOutlined,
  TeamOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  ExperimentOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
  CloudServerOutlined,
  ReloadOutlined,
} from '@ant-design/icons'

const { Text } = Typography

/* ── 模型提供商定义 ────────────────────────────────── */
const MODEL_PROVIDERS = [
  {
    key: 'deepseek',
    label: 'DeepSeek',
    tag: '推荐',
    tagColor: 'blue',
    defaultUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
  },
  {
    key: 'qwen',
    label: '通义千问 (Qwen)',
    tag: '国产',
    tagColor: 'orange',
    defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-long'],
    defaultModel: 'qwen-plus',
  },
  {
    key: 'openai',
    label: 'OpenAI',
    tag: '',
    tagColor: '',
    defaultUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o3-mini'],
    defaultModel: 'gpt-4o-mini',
  },
  {
    key: 'zhipu',
    label: '智谱 AI (GLM)',
    tag: '国产',
    tagColor: 'orange',
    defaultUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-plus', 'glm-4-flash', 'glm-4-long', 'glm-4'],
    defaultModel: 'glm-4-flash',
  },
  {
    key: 'moonshot',
    label: 'Moonshot (Kimi)',
    tag: '国产',
    tagColor: 'orange',
    defaultUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    defaultModel: 'moonshot-v1-32k',
  },
  {
    key: 'baichuan',
    label: '百川智能',
    tag: '国产',
    tagColor: 'orange',
    defaultUrl: 'https://api.baichuan-ai.com/v1',
    models: ['Baichuan4', 'Baichuan3-Turbo', 'Baichuan3-Turbo-128k'],
    defaultModel: 'Baichuan4',
  },
  {
    key: 'ollama',
    label: 'Ollama (本地部署)',
    tag: '本地',
    tagColor: 'green',
    defaultUrl: 'http://localhost:11434/v1',
    models: ['llama3', 'qwen2.5', 'deepseek-r1', 'mistral', 'gemma2'],
    defaultModel: 'qwen2.5',
  },
  {
    key: 'custom',
    label: '自定义 (OpenAI 兼容)',
    tag: '',
    tagColor: '',
    defaultUrl: '',
    models: [],
    defaultModel: '',
  },
]

/* ── 默认配置 ────────────────────────────────── */
const DEFAULT_LLM = {
  provider: 'deepseek',
  api_key: '',
  api_url: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  temperature: 0.1,
  max_tokens: 4096,
  top_p: 0.95,
  frequency_penalty: 0,
  presence_penalty: 0,
  timeout: 60,
  retry_count: 2,
}

const DEFAULT_SYSTEM = {
  max_nodes: 500,
  max_depth: 10,
  default_layout: 'TB',
  validation_on_save: true,
  generation_min_nodes: 8,
  generation_max_nodes: 50,
  rag_top_k: 5,
  rag_similarity_threshold: 0.3,
  knowledge_auto_link: true,
  eval_similarity_threshold: 0.6,
  export_format: 'json',
}

const Settings: React.FC = () => {
  const [llmForm] = Form.useForm()
  const [systemForm] = Form.useForm()
  const [provider, setProvider] = useState('deepseek')

  // 读取已保存的配置
  useEffect(() => {
    try {
      const llm = JSON.parse(localStorage.getItem('llm_config') || '{}')
      const sys = JSON.parse(localStorage.getItem('system_config') || '{}')
      llmForm.setFieldsValue({ ...DEFAULT_LLM, ...llm })
      systemForm.setFieldsValue({ ...DEFAULT_SYSTEM, ...sys })
      if (llm.provider) setProvider(llm.provider)
    } catch { /* ignore */ }
  }, [llmForm, systemForm])

  const currentProvider = useMemo(
    () => MODEL_PROVIDERS.find((p) => p.key === provider) || MODEL_PROVIDERS[0],
    [provider],
  )

  const handleProviderChange = (value: string) => {
    setProvider(value)
    const p = MODEL_PROVIDERS.find((x) => x.key === value)
    if (p) {
      llmForm.setFieldsValue({
        api_url: p.defaultUrl,
        model: p.defaultModel,
      })
    }
  }

  const handleSaveLLM = (values: any) => {
    localStorage.setItem('llm_config', JSON.stringify(values))
    message.success('模型配置已保存')
  }

  const handleSaveSystem = (values: any) => {
    localStorage.setItem('system_config', JSON.stringify(values))
    message.success('系统配置已保存')
  }

  const handleResetLLM = () => {
    llmForm.setFieldsValue(DEFAULT_LLM)
    setProvider('deepseek')
    message.info('已重置为默认模型配置')
  }

  const handleResetSystem = () => {
    systemForm.setFieldsValue(DEFAULT_SYSTEM)
    message.info('已重置为默认系统配置')
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <h2><SettingOutlined style={{ marginRight: 10 }} />系统设置</h2>
          <Text type="secondary">配置模型参数、系统行为与生成策略</Text>
        </div>
      </div>

      {/* ═══ LLM 模型配置 ═══ */}
      <Card
        className="settings-card animate-fade-in-up stagger-1"
        title={
          <span>
            <RobotOutlined style={{ color: 'var(--primary)', marginRight: 8 }} />
            LLM 模型配置
          </span>
        }
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={handleResetLLM}>
            重置默认
          </Button>
        }
      >
        <Form form={llmForm} layout="vertical" onFinish={handleSaveLLM} initialValues={DEFAULT_LLM}>
          {/* 提供商 + API Key 行 */}
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="provider" label="模型提供商">
                <Select onChange={handleProviderChange}>
                  {MODEL_PROVIDERS.map((p) => (
                    <Select.Option key={p.key} value={p.key}>
                      <Space>
                        {p.label}
                        {p.tag && <Tag color={p.tagColor} style={{ marginLeft: 4, fontSize: 11, lineHeight: '18px', padding: '0 5px' }}>{p.tag}</Tag>}
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="api_key" label="API Key" tooltip="密钥仅保存在浏览器本地，不会上传至服务器">
                <Input.Password placeholder="sk-..." />
              </Form.Item>
            </Col>
          </Row>

          {/* API URL + 模型名称 行 */}
          <Row gutter={20}>
            <Col span={12}>
              <Form.Item name="api_url" label={<span><ApiOutlined style={{ marginRight: 4 }} />API 地址</span>}>
                <Input placeholder={currentProvider.defaultUrl || 'https://api.example.com/v1'} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="model" label="模型名称">
                {currentProvider.models.length > 0 ? (
                  <Select
                    showSearch
                    allowClear
                    placeholder="选择或输入模型名称"
                    options={currentProvider.models.map((m) => ({ label: m, value: m }))}
                  />
                ) : (
                  <Input placeholder="输入模型名称" />
                )}
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" plain style={{ margin: '4px 0 16px', fontSize: 13 }}>
            <ExperimentOutlined style={{ marginRight: 4 }} />推理参数
          </Divider>

          <Row gutter={20}>
            <Col span={8}>
              <Form.Item name="temperature" label={
                <Tooltip title="控制输出随机性，越低越确定性，越高越多样性。故障树生成建议 0.05-0.2">
                  Temperature
                </Tooltip>
              }>
                <Slider min={0} max={1} step={0.01} tooltip={{ formatter: (v) => `${v}` }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="top_p" label={
                <Tooltip title="核采样参数，与 Temperature 配合使用。建议保持 0.9-1.0">
                  Top P
                </Tooltip>
              }>
                <Slider min={0} max={1} step={0.01} tooltip={{ formatter: (v) => `${v}` }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="max_tokens" label={
                <Tooltip title="单次请求最大生成 Token 数。复杂故障树建议 4096+">
                  最大 Token 数
                </Tooltip>
              }>
                <InputNumber min={256} max={32768} step={256} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={20}>
            <Col span={8}>
              <Form.Item name="frequency_penalty" label={
                <Tooltip title="频率惩罚，减少重复内容。0 = 无惩罚，2 = 强烈惩罚">
                  频率惩罚
                </Tooltip>
              }>
                <Slider min={-2} max={2} step={0.1} tooltip={{ formatter: (v) => `${v}` }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="presence_penalty" label={
                <Tooltip title="存在惩罚，鼓励生成新话题。0 = 无惩罚，2 = 强烈鼓励新话题">
                  存在惩罚
                </Tooltip>
              }>
                <Slider min={-2} max={2} step={0.1} tooltip={{ formatter: (v) => `${v}` }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="timeout" label="超时(秒)">
                <InputNumber min={10} max={300} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item name="retry_count" label="重试次数">
                <InputNumber min={0} max={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              保存模型配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* ═══ 系统配置 ═══ */}
      <Card
        className="settings-card animate-fade-in-up stagger-2"
        title={
          <span>
            <ToolOutlined style={{ color: 'var(--warning)', marginRight: 8 }} />
            系统配置
          </span>
        }
        extra={
          <Button size="small" icon={<ReloadOutlined />} onClick={handleResetSystem}>
            重置默认
          </Button>
        }
      >
        <Form form={systemForm} layout="vertical" onFinish={handleSaveSystem} initialValues={DEFAULT_SYSTEM}>
          <Collapse
            ghost
            defaultActiveKey={['editor', 'generation', 'rag', 'eval']}
            items={[
              {
                key: 'editor',
                label: <span><ThunderboltOutlined style={{ marginRight: 6, color: 'var(--primary)' }} />编辑器与画布</span>,
                children: (
                  <Row gutter={20}>
                    <Col span={8}>
                      <Form.Item name="max_nodes" label={
                        <Tooltip title="单棵故障树允许的最大节点数量">最大节点数</Tooltip>
                      }>
                        <InputNumber min={50} max={5000} step={50} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="max_depth" label={
                        <Tooltip title="故障树允许的最大深度层级">最大深度</Tooltip>
                      }>
                        <InputNumber min={3} max={30} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="default_layout" label="默认布局方向">
                        <Select>
                          <Select.Option value="TB">从上到下 (TB)</Select.Option>
                          <Select.Option value="LR">从左到右 (LR)</Select.Option>
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="validation_on_save" label="保存时自动校验" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="export_format" label="默认导出格式">
                        <Select>
                          <Select.Option value="json">JSON</Select.Option>
                          <Select.Option value="opsa-xml">OpenPSA XML</Select.Option>
                          <Select.Option value="png">PNG 图片</Select.Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'generation',
                label: <span><RobotOutlined style={{ marginRight: 6, color: 'var(--success)' }} />AI 生成策略</span>,
                children: (
                  <Row gutter={20}>
                    <Col span={8}>
                      <Form.Item name="generation_min_nodes" label={
                        <Tooltip title="AI 生成故障树时的最少节点数要求">最少生成节点</Tooltip>
                      }>
                        <InputNumber min={3} max={30} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="generation_max_nodes" label={
                        <Tooltip title="AI 生成故障树时的最多节点数限制">最多生成节点</Tooltip>
                      }>
                        <InputNumber min={10} max={200} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="knowledge_auto_link" label={
                        <Tooltip title="生成时自动关联项目知识图谱中的实体">自动关联知识图谱</Tooltip>
                      } valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'rag',
                label: <span><CloudServerOutlined style={{ marginRight: 6, color: 'var(--accent)' }} />RAG 检索配置</span>,
                children: (
                  <Row gutter={20}>
                    <Col span={8}>
                      <Form.Item name="rag_top_k" label={
                        <Tooltip title="RAG 检索返回的最大文档片段数量">检索 Top-K</Tooltip>
                      }>
                        <InputNumber min={1} max={20} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="rag_similarity_threshold" label={
                        <Tooltip title="低于此相似度的检索结果将被过滤">相似度阈值</Tooltip>
                      }>
                        <Slider min={0} max={1} step={0.05} tooltip={{ formatter: (v) => `${v}` }} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'eval',
                label: <span><SafetyCertificateOutlined style={{ marginRight: 6, color: 'var(--warning)' }} />评测参数</span>,
                children: (
                  <Row gutter={20}>
                    <Col span={8}>
                      <Form.Item name="eval_similarity_threshold" label={
                        <Tooltip title="标准树对比时，节点名称模糊匹配的相似度阈值">节点匹配阈值</Tooltip>
                      }>
                        <Slider min={0.3} max={1} step={0.05} tooltip={{ formatter: (v) => `${v}` }} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
            ]}
          />

          <Form.Item style={{ marginBottom: 0, marginTop: 16, paddingLeft: 12 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              保存系统配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* ═══ 关于系统 ═══ */}
      <Card
        className="settings-card animate-fade-in-up stagger-3"
        title={
          <span>
            <InfoCircleOutlined style={{ color: 'var(--accent)', marginRight: 8 }} />
            关于系统
          </span>
        }
      >
        <div className="settings-about">
          <div className="settings-about-logo">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 7V12C4 16.42 7.4 20.56 12 22C16.6 20.56 20 16.42 20 12V7L12 2Z" fill="white" fillOpacity="0.9" />
              <path d="M12 6L8 10H11V16H13V10H16L12 6Z" fill="rgba(79,70,229,0.7)" />
            </svg>
          </div>
          <h3>FTA 智能生成系统</h3>
          <div className="version-tag">v1.0.0</div>
          <p>基于知识增强大模型的工业设备故障树智能生成与辅助分析系统</p>
          <p>第十六届中国大学生服务外包创新创业大赛参赛作品</p>
          <p>企业命题：无锡雪浪数制科技有限公司</p>
          <div style={{ marginTop: 20 }}>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
              <TeamOutlined style={{ marginRight: 6 }} />
              团队成员
            </p>
            <div className="team-members">
              <span className="team-member">宋德海</span>
              <span className="team-member">陈政</span>
              <span className="team-member">周煜笙</span>
              <span className="team-member">黄清阳</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default Settings
