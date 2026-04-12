import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Editor from './pages/Editor'
import ReportView from './pages/ReportView'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Editor />} />
        <Route path="/report/:reportId" element={<ReportView />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
