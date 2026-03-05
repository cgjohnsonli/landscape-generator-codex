import { useStore } from '../store/useStore.js'

export default function ProcessingOverlay() {
  const { processingMsg } = useStore()
  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        <div style={styles.spinner} />
        <div style={styles.msg}>{processingMsg || '处理中...'}</div>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:0.4 } 50% { opacity:1 } }
      `}</style>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0,
    background: '#000000bb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(6px)',
  },
  box: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
    padding: '32px 48px',
    background: '#0d1117',
    border: '1px solid #1e2d3d',
    borderRadius: '8px',
  },
  spinner: {
    width: '32px', height: '32px',
    border: '2px solid #1e2d3d',
    borderTop: '2px solid #22c55e',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  msg: {
    fontSize: '13px', color: '#64748b',
    fontFamily: "'DM Mono', monospace",
    letterSpacing: '0.05em',
  },
}
