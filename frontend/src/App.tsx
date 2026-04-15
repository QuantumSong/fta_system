import React, { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Layout } from 'antd'
import AppHeader from './components/common/AppHeader'
import AppSidebar from './components/common/AppSidebar'
import Editor from './pages/Editor'
import Knowledge from './pages/Knowledge'
import Projects from './pages/Projects'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Collaboration from './pages/Collaboration'
import ExpertMode from './pages/ExpertMode'
import Benchmark from './pages/Benchmark'
import useAuthStore from './stores/authStore'
import './styles/App.css'

const { Content } = Layout

/** 需要登录才能访问的布局 */
const AuthLayout: React.FC = () => {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return (
    <Layout className="app-layout">
      <AppHeader />
      <Layout>
        <AppSidebar />
        <Content className="app-content">
          <Routes>
            <Route path="/projects" element={<Projects />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/editor/:treeId" element={<Editor />} />
            <Route path="/knowledge" element={<Knowledge />} />
            <Route path="/collaboration" element={<Collaboration />} />
            <Route path="/expert" element={<ExpertMode />} />
            <Route path="/benchmark" element={<Benchmark />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

const App: React.FC = () => {
  const { loadFromStorage, isAuthenticated } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <Router>
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/projects" replace /> : <Login />
        } />
        <Route path="/*" element={<AuthLayout />} />
      </Routes>
    </Router>
  )
}

export default App
