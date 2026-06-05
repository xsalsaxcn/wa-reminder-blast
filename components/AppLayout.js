import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppLayout({ children, title = 'WA Reminder & Blast' }) {
  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#172033]">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar title={title} />
          <main className="flex-1 px-6 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
