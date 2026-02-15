import { useState } from 'react'
import { Card, Input, Button, List, Space, Typography, Popconfirm } from 'antd'
import { PlusOutlined, DeleteOutlined, RightOutlined } from '@ant-design/icons'
import type { Project } from './types'

interface ProjectListProps {
  projects: Project[]
  onCreateProject: (name: string) => void | Promise<void>
  onDeleteProject: (id: string) => void | Promise<void>
  onEnterProject: (project: Project) => void
}

export function ProjectList({
  projects,
  onCreateProject,
  onDeleteProject,
  onEnterProject,
}: ProjectListProps) {
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const t = name.trim()
    if (!t) return
    onCreateProject(t)
    setName('')
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 560 }}>
      <Card title="Projects" size="small">
        <form onSubmit={handleSubmit}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New project name"
              onPressEnter={(e) => { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) }}
            />
            <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
              Create
            </Button>
          </Space.Compact>
        </form>
      </Card>
      {projects.length === 0 ? (
        <Card>
          <Typography.Text type="secondary">No projects yet. Create one above.</Typography.Text>
        </Card>
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={projects}
          renderItem={(project) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  ghost
                  size="small"
                  icon={<RightOutlined />}
                  onClick={() => onEnterProject(project)}
                >
                  Open
                </Button>,
                <Popconfirm
                  title="Delete this project?"
                  description="All tasks in this project will be deleted. This cannot be undone."
                  onConfirm={() => onDeleteProject(project.id)}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    title="Delete project"
                  />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta title={project.name} />
            </List.Item>
          )}
        />
      )}
    </Space>
  )
}
