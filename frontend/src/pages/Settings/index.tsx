import React from 'react'
import { Card, Form, Input, Button, Select, message } from 'antd'
import {
  SaveOutlined,
  RobotOutlined,
  ToolOutlined,
  InfoCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons'

const Settings: React.FC = () => {
  const [llmForm] = Form.useForm()
  const [systemForm] = Form.useForm()

  const handleSaveLLM = (values: any) => {
    localStorage.setItem('llm_config', JSON.stringify(values))
    message.success('LLM配置已保存')
  }

  const handleSaveSystem = (values: any) => {
    localStorage.setItem('system_config', JSON.stringify(values))
    message.success('系统配置已保存')
  }

  return (
    <div className="settings-page">
      <h2>系统设置</h2>

      <Card
        className="settings-card animate-fade-in-up stagger-1"
        title={
          <span>
            <RobotOutlined style={{ color: 'var(--primary)', marginRight: 8 }} />
            LLM 模型配置
          </span>
        }
      >
        <Form form={llmForm} layout="vertical" onFinish={handleSaveLLM} style={{ maxWidth: 560 }}>
          <Form.Item name="provider" label="模型提供商" initialValue="qwen">
            <Select>
              <Select.Option value="qwen">通义千问 (Qwen3.5)</Select.Option>
              <Select.Option value="deepseek">DeepSeek (V3.2)</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="api_key" label="API Key">
            <Input.Password placeholder="输入API Key" />
          </Form.Item>
          <Form.Item name="api_url" label="API URL">
            <Input placeholder="https://api.example.com/v1" />
          </Form.Item>
          <Form.Item name="model" label="模型名称" initialValue="qwen3.5-72b">
            <Input placeholder="例如：qwen3.5-72b" />
          </Form.Item>
          <Form.Item name="temperature" label="Temperature" initialValue={0.1}>
            <Input type="number" min={0} max={1} step={0.1} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card
        className="settings-card animate-fade-in-up stagger-2"
        title={
          <span>
            <ToolOutlined style={{ color: 'var(--warning)', marginRight: 8 }} />
            系统配置
          </span>
        }
      >
        <Form form={systemForm} layout="vertical" onFinish={handleSaveSystem} style={{ maxWidth: 560 }}>
          <Form.Item name="max_nodes" label="最大节点数" initialValue={1000}>
            <Input type="number" min={100} max={5000} />
          </Form.Item>
          <Form.Item name="auto_save" label="自动保存" initialValue={true}>
            <Select>
              <Select.Option value={true}>开启</Select.Option>
              <Select.Option value={false}>关闭</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="auto_save_interval" label="自动保存间隔(秒)" initialValue={30}>
            <Input type="number" min={10} max={300} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

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
          <p>基于知识的工业设备故障树智能生成与辅助构建系统</p>
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
