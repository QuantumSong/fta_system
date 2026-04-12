import React, { useState, useEffect } from 'react'
import { Card, Button, Tag, Modal, Form, Input, message, Spin, Row, Col, Switch, Tooltip, Typography } from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  AppstoreOutlined,
  ApartmentOutlined,
  TeamOutlined,
  CopyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { projectApi, collabApi } from '@/services/api'
import useAuthStore from '@/stores/authStore'

const { Text } = Typography

const Projects: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const data: any = await projectApi.getProjects() as any
      setProjects(data.projects || [])
    } catch (error) {
      message.error('加载项目失败')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (values: any) => {
    try {
      if (editingProject) {
        await projectApi.updateProject(editingProject.id, values)
        message.success('更新成功')
      } else {
        await projectApi.createProject(values)
        message.success('创建成功')
      }
      setIsModalOpen(false)
      setEditingProject(null)
      form.resetFields()
      loadProjects()
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleDelete = async (id: number) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除项目后所有关联的故障树也将被删除，此操作不可恢复。',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await projectApi.deleteProject(id)
          message.success('删除成功')
          loadProjects()
        } catch (error) {
          message.error('删除失败')
        }
      },
    })
  }

  const openEditModal = (project?: any) => {
    setEditingProject(project || null)
    if (project) {
      form.setFieldsValue(project)
    } else {
      form.resetFields()
    }
    setIsModalOpen(true)
  }

  const handleToggleCollab = async (project: any) => {
    try {
      if (project.collab_enabled) {
        await collabApi.disableCollab(project.id)
        message.success('协作已关闭')
      } else {
        const res: any = await collabApi.enableCollab(project.id)
        Modal.success({
          title: '协作已开启',
          content: (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <p style={{ marginBottom: 8 }}>协作密码：</p>
              <div style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: 6,
                fontFamily: 'monospace',
                background: 'var(--primary-bg)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 24px',
                color: 'var(--primary)',
                display: 'inline-block',
              }}>
                {res.collab_code}
              </div>
              <p style={{ marginTop: 12, color: 'var(--text-secondary)', fontSize: 13 }}>
                将此密码分享给协作伙伴，对方在「协同工作」页面输入即可加入
              </p>
            </div>
          ),
        })
      }
      loadProjects()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  const copyCollabCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      message.success('协作密码已复制')
    })
  }

  return (
    <div className="projects-page">
      <div className="projects-page-header">
        <div>
          <h2>项目管理</h2>
          <p>管理你的故障树分析项目</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          size="large"
          onClick={() => openEditModal()}
        >
          新建项目
        </Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : projects.length === 0 ? (
        <div className="projects-empty">
          <div className="projects-empty-icon">
            <AppstoreOutlined />
          </div>
          <h3>还没有项目</h3>
          <p>创建第一个项目，开始构建故障树分析</p>
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => openEditModal()}>
            创建项目
          </Button>
        </div>
      ) : (
        <Row gutter={[20, 20]}>
          {projects.map((project, index) => (
            <Col key={project.id} xs={24} sm={12} md={8} lg={8} xl={6}>
              <Card
                className={`project-card animate-fade-in-up stagger-${Math.min(index + 1, 6)}`}
                hoverable
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div className="project-card-title" style={{ flex: 1 }}>{project.name}</div>
                  {project.is_owner && (
                    <Tooltip title={project.collab_enabled ? '关闭协作' : '开启协作'}>
                      <Switch
                        size="small"
                        checked={project.collab_enabled}
                        onChange={() => handleToggleCollab(project)}
                        checkedChildren={<TeamOutlined />}
                        unCheckedChildren={<TeamOutlined />}
                      />
                    </Tooltip>
                  )}
                </div>

                <div className="project-card-desc">
                  {project.description || '暂无描述'}
                </div>

                <div className="project-card-meta">
                  <Tag color="purple">{project.device_type || '通用'}</Tag>
                  <Tag color="blue">
                    <ApartmentOutlined style={{ marginRight: 4 }} />
                    {project.tree_count || 0} 棵故障树
                  </Tag>
                  {project.collab_enabled && (
                    <Tag color="green">
                      <TeamOutlined style={{ marginRight: 4 }} />
                      协作中
                    </Tag>
                  )}
                </div>

                {/* 协作密码显示区域（仅所有者可见） */}
                {project.collab_enabled && project.collab_code && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                    padding: '6px 10px',
                    background: 'var(--primary-bg)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 13,
                  }}>
                    <TeamOutlined style={{ color: 'var(--primary)' }} />
                    <Text code style={{ fontSize: 14, letterSpacing: 2 }}>{project.collab_code}</Text>
                    <Tooltip title="复制密码">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={(e) => { e.stopPropagation(); copyCollabCode(project.collab_code) }}
                      />
                    </Tooltip>
                  </div>
                )}

                {/* 拥有者标识 */}
                {project.owner_name && !project.is_owner && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                    <UserOutlined style={{ marginRight: 4 }} />
                    所有者：{project.owner_name}
                  </div>
                )}

                <div className="project-card-actions">
                  <Button
                    type="primary"
                    ghost
                    size="small"
                    icon={<FolderOpenOutlined />}
                    onClick={() => navigate(`/editor?project=${project.id}`)}
                  >
                    打开
                  </Button>
                  {(project.is_owner || user?.role === 'admin') && (
                    <>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => openEditModal(project)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(project.id)}
                      >
                        删除
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title={editingProject ? '编辑项目' : '新建项目'}
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false)
          setEditingProject(null)
          form.resetFields()
        }}
        onOk={() => form.submit()}
        okText={editingProject ? '保存' : '创建'}
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="输入项目名称" size="large" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea rows={3} placeholder="简要描述项目内容..." />
          </Form.Item>
          <Form.Item name="device_type" label="设备类型">
            <Input placeholder="例如：液压系统、电气系统" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Projects
