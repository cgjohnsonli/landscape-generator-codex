import { useEffect } from 'react'
import { useStore } from './store/useStore.js'
import Toolbar from './components/Toolbar.jsx'
import MapCanvas from './components/MapCanvas.jsx'
import SidePanel from './components/SidePanel.jsx'
import UploadOverlay from './components/UploadOverlay.jsx'
import ProcessingOverlay from './components/ProcessingOverlay.jsx'
import ClusterMapper from './components/ClusterMapper.jsx'

export default function App() {
  const { raster, clusters, isProcessing, undo, redo } = useStore()

  // 全局键盘快捷键
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const showClusterMapper = clusters && !raster

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.logoText}>GreenLens</span>
          <span style={styles.logoSub}>景观设计辅助平台</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.version}>MVP v0.1</span>
        </div>
      </header>

      {/* Main Layout */}
      <div style={styles.main}>
        {/* Toolbar */}
        {raster && <Toolbar />}

        {/* Canvas Area */}
        <div style={styles.canvasWrap}>
          {!raster && !isProcessing && !showClusterMapper && <UploadOverlay />}
          {raster && <MapCanvas />}
        </div>

        {/* Side Panel */}
        {raster && <SidePanel />}
      </div>

      {/* Overlays */}
      {isProcessing && <ProcessingOverlay />}
      {showClusterMapper && <ClusterMapper />}
    </div>
  )
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#0d1117',
    color: '#e2e8f0',
    fontFamily: "'DM Mono', monospace",
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: '48px',
    background: '#0d1117',
    borderBottom: '1px solid #1e2d3d',
    flexShrink: 0,
    zIndex: 100,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoIcon: {
    fontSize: '18px',
    color: '#22c55e',
    fontFamily: "'Syne', sans-serif",
  },
  logoText: {
    fontSize: '15px',
    fontWeight: '700',
    fontFamily: "'Syne', sans-serif",
    color: '#f1f5f9',
    letterSpacing: '0.05em',
  },
  logoSub: {
    fontSize: '11px',
    color: '#475569',
    letterSpacing: '0.08em',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  version: {
    fontSize: '10px',
    color: '#334155',
    letterSpacing: '0.1em',
    background: '#1e2d3d',
    padding: '3px 8px',
    borderRadius: '3px',
  },
  main: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  canvasWrap: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    background: '#080d12',
  },
}
