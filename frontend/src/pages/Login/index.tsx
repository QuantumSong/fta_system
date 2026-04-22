import React, { useState } from 'react'
import { Form, Input, Button, message, Tabs } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/services/api'
import useAuthStore from '@/stores/authStore'
import logoImg from '@/assets/logo.png'

const Login: React.FC = () => {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('login')
  const [loginForm] = Form.useForm()
  const [registerForm] = Form.useForm()

  const handleLogin = async (values: any) => {
    try {
      setLoading(true)
      const res: any = await authApi.login({
        username: values.username,
        password: values.password,
      })
      setAuth(res.token, res.user)
      message.success('登录成功')
      navigate('/projects')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (values: any) => {
    try {
      setLoading(true)
      const res: any = await authApi.register({
        username: values.username,
        email: values.email,
        password: values.password,
      })
      setAuth(res.token, res.user)
      message.success('注册成功')
      navigate('/projects')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        width: 400,
        height: 400,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(129,140,248,0.15) 0%, transparent 70%)',
        top: -100,
        right: -100,
      }} />
      <div style={{
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)',
        bottom: -80,
        left: -80,
      }} />

      <div style={{
        width: 420,
        background: 'rgba(255,255,255,0.97)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        padding: '40px 36px',
        position: 'relative',
        zIndex: 1,
        animation: 'scaleIn 400ms ease-out both',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src={logoImg}
            alt="FTA Logo"
            style={{
              height: 60,
              width: 'auto',
              margin: '0 auto 12px',
              display: 'block',
            }}
          />
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1e293b' }}>
            FTA 智能生成系统
          </h2>
          <p style={{ color: '#64748b', fontSize: 14, margin: '6px 0 0' }}>
            故障树分析协同工作平台
          </p>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          centered
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form form={loginForm} onFinish={handleLogin} layout="vertical" size="large">
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input prefix={<UserOutlined />} placeholder="用户名" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44 }}>
                      登 录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Form form={registerForm} onFinish={handleRegister} layout="vertical" size="large">
                  <Form.Item
                    name="username"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input prefix={<UserOutlined />} placeholder="用户名" />
                  </Form.Item>
                  <Form.Item
                    name="email"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '邮箱格式不正确' },
                    ]}
                  >
                    <Input prefix={<MailOutlined />} placeholder="邮箱" />
                  </Form.Item>
                  <Form.Item
                    name="password"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, message: '密码至少6位' },
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="密码（至少6位）" />
                  </Form.Item>
                  <Form.Item
                    name="confirm"
                    dependencies={['password']}
                    rules={[
                      { required: true, message: '请确认密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('password') === value) {
                            return Promise.resolve()
                          }
                          return Promise.reject(new Error('两次密码不一致'))
                        },
                      }),
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44 }}>
                      注 册
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}

export default Login
