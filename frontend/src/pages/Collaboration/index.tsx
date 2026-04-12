import React, { useState } from 'react'
import { Input, Button, message, Card, Result } from 'antd'
import { TeamOutlined, LoginOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { collabApi } from '@/services/api'

const Collaboration: React.FC = () => {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [joinResult, setJoinResult] = useState<any>(null)

  const handleJoin = async () => {
    const trimmed = code.trim().toUpperCase()
    if (trimmed.length !== 6) {
      message.warning('请输入6位协作密码')
      return
    }
    try {
      setLoading(true)
      const res: any = await collabApi.joinCollab(trimmed)
      setJoinResult(res)
      message.success(res.message)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '加入失败')
    } finally {
      setLoading(false)
    }
  }

  if (joinResult) {
    return (
      <div className="page-wrapper" style={{ maxWidth: 500, margin: '60px auto' }}>
        <Result
          status="success"
          title="加入协作成功"
          subTitle={`你已加入项目「${joinResult.project_name}」`}
          extra={[
            <Button
              type="primary"
              key="open"
              size="large"
              onClick={() => navigate(`/editor?project=${joinResult.project_id}`)}
            >
              打开项目编辑器
            </Button>,
            <Button key="projects" onClick={() => navigate('/projects')}>
              返回项目列表
            </Button>,
          ]}
        />
      </div>
    )
  }

  return (
    <div className="page-wrapper" style={{ maxWidth: 480, margin: '60px auto' }}>
      <Card style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(79,70,229,0.3)',
          }}>
            <TeamOutlined style={{ fontSize: 28, color: '#fff' }} />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>加入协同项目</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
            输入项目所有者分享的6位协作密码
          </p>
        </div>

        <div style={{ maxWidth: 300, margin: '0 auto' }}>
          <Input
            size="large"
            maxLength={6}
            placeholder="输入6位协作密码"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onPressEnter={handleJoin}
            style={{
              textAlign: 'center',
              fontSize: 24,
              letterSpacing: 8,
              fontWeight: 700,
              fontFamily: 'monospace',
            }}
          />
          <Button
            type="primary"
            size="large"
            icon={<LoginOutlined />}
            loading={loading}
            onClick={handleJoin}
            block
            style={{ marginTop: 16, height: 44 }}
          >
            加入协作
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default Collaboration
