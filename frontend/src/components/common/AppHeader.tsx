import React from 'react'
import { Layout, Avatar, Dropdown, Tag } from 'antd'
import { UserOutlined, DownOutlined, SettingOutlined, LogoutOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '@/stores/authStore'
import logoImg from '@/assets/logo.png'

const { Header } = Layout

const AppHeader: React.FC = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const userMenuItems = [
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'logout') {
      logout()
      navigate('/login')
    } else if (key === 'settings') {
      navigate('/settings')
    }
  }

  return (
    <Header className="app-header">
      <div className="app-header-logo">
        <img
          src={logoImg}
          alt="FTA Logo"
          style={{ height: 28, width: 'auto', marginRight: 8 }}
        />
        <h1>FTA<span>智能生成</span>系统</h1>
      </div>
      <Dropdown menu={{ items: userMenuItems, onClick: handleMenuClick }} placement="bottomRight" trigger={['click']}>
        <div className="app-header-user">
          <Avatar size={32} icon={<UserOutlined />} />
          <span className="app-header-user-name">{user?.username || '用户'}</span>
          {user?.role === 'admin' && (
            <Tag color="gold" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}>管理员</Tag>
          )}
          <DownOutlined />
        </div>
      </Dropdown>
    </Header>
  )
}

export default AppHeader
