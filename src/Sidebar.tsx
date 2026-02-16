import './Sidebar.css'

interface SidebarProps {
  activeItem?: 'projects' | 'tasks' | 'settings'
  onNavigateHome?: () => void
}

export function Sidebar({ activeItem = 'projects', onNavigateHome }: SidebarProps) {
  return (
    <aside className="app-sidebar">
      <div className="sidebar-top">
        <button className="sidebar-logo" onClick={onNavigateHome} title="Back to projects">
          T
        </button>
        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${activeItem === 'projects' ? 'active' : ''}`}
            title="Projects"
            onClick={onNavigateHome}
          >
            <span className="material-symbols-rounded">dashboard</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeItem === 'tasks' ? 'active' : ''}`}
            title="Tasks"
          >
            <span className="material-symbols-rounded">task_alt</span>
          </button>
          <button className="sidebar-nav-item" title="Settings">
            <span className="material-symbols-rounded">settings</span>
          </button>
        </nav>
      </div>
      <div className="sidebar-bottom">
        <div className="sidebar-avatar">T</div>
      </div>
    </aside>
  )
}
