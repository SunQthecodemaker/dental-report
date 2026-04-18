import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Dashboard from './pages/Dashboard'
import Editor from './pages/Editor'
import ReportView from './pages/ReportView'
import Settings from './pages/Settings'

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/dental-report">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/editor/:chartNumber" element={<Editor />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/report/:reportId" element={<ReportView />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
