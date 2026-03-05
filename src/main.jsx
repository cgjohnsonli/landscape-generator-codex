import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Global reset styles
const globalStyle = document.createElement('style')
globalStyle.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { overflow: hidden; background: #0d1117; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: #080d12; }
  ::-webkit-scrollbar-thumb { background: #1e2d3d; border-radius: 2px; }
  select option { background: #0d1117; color: #cbd5e1; }
  input[type=range] { height: 4px; }
  button:hover { opacity: 0.85; }
`
document.head.appendChild(globalStyle)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
