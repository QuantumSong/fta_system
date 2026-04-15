import React from 'react'
import { Layout, Menu } from 'antd'
import {
  AppstoreOutlined,
  ApartmentOutlined,
  ExperimentOutlined,
  SettingOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'

const { Sider } = Layout

const AppSidebar: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const currentPath = location.pathname.startsWith('/editor') ? '/editor' : location.pathname

  const menuItems = [
    {
      key: '/projects',
      icon: <AppstoreOutlined />,
      label: '项目管理',
    },
    {
      key: '/editor',
      icon: <ApartmentOutlined />,
      label: '故障树编辑',
    },
    {
      key: '/collaboration',
      icon: <TeamOutlined />,
      label: '协同工作',
    },
    {
      key: '/knowledge',
      icon: <ExperimentOutlined />,
      label: '知识抽取',
    },
    {
      key: '/expert',
      icon: <SafetyCertificateOutlined />,
      label: '专家模式',
    },
    {
      key: '/benchmark',
      icon: <BarChartOutlined />,
      label: '指标评测',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ]

  return (
    <Sider width={220} className="app-sidebar">
      <Menu
        mode="inline"
        selectedKeys={[currentPath]}
        style={{ height: '100%', borderRight: 0 }}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
      />
    </Sider>
  )
}

export default AppSidebar
