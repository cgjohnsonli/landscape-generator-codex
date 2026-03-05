import { useStore } from '../store/useStore.js'
import { LABELS } from '../core/raster.js'
import { saveProject } from '../core/db.js'
import { greenServiceDistance, roadServiceDistance, coverageStats, generateSuggestions, generateRoadSuggestions } from '../core/analysis.js'

const ANALYSIS_OPTIONS = [
  { id: 'green', label: '绿地可达性' },
  { id: 'road', label: '道路可达性' },
]

const TOOLS = [
  { id: 'brush',   icon: '⬤', label: '笔刷' },
  { id: 'polygon', icon: '⬡', label: '多边形' },
  { id: 'pan',     icon: '✥', label: '平移' },
]

export default function Toolbar() {
  const {
    activeTool, setActiveTool,
    brushRadius, setBrushRadius,
    opacity, setOpacity,
    undo, redo, canUndo, canRedo,
    raster,
    setDistMap, setProcessing,
    showAnalysis, setShowAnalysis,
    analysisType,
    heatmapScale, setHeatmapScale,
    heatmapGamma, setHeatmapGamma,
    imageName,
  } = useStore()

  const canUndoNow = canUndo()
  const canRedoNow = canRedo()

  const runAnalysis = async () => {
    if (!raster) return

    if (analysisType === 'road') {
      setProcessing(true, '计算道路可达性...')
      await new Promise(r => setTimeout(r, 30))
      const dist = roadServiceDistance(raster, 2)
      const stats = coverageStats(dist, raster.cellSize, [100, 300, 500])
      const suggestions = generateRoadSuggestions(raster, dist)
      setDistMap(dist, stats, suggestions, 'road')
      setProcessing(false)
      return
    }

    setProcessing(true, '计算绿地服务圈...')
    await new Promise(r => setTimeout(r, 30))
    const dist = greenServiceDistance(raster, 3)
    const stats = coverageStats(dist, raster.cellSize)
    const suggestions = generateSuggestions(raster, dist)
    setDistMap(dist, stats, suggestions, 'green')
    setProcessing(false)
  }

  const saveToDb = async () => {
    if (!raster) return
    try {
      await saveProject({
        id: 'project-1',
        name: imageName || '未命名项目',
        rasterData: Array.from(raster.data),
        rasterWidth: raster.width,
        rasterHeight: raster.height,
        rasterCellSize: raster.cellSize,
      })
      alert('已保存到本地 IndexedDB')
    } catch (e) {
      alert('保存失败: ' + e.message)
    }
  }

  return (
    <div style={styles.toolbar}>
      {/* 工具 */}
      <div style={styles.group}>
        <div style={styles.groupLabel}>工具</div>
        {TOOLS.map(t => (
          <button
            key={t.id}
            title={t.label}
            style={{ ...styles.toolBtn, ...(activeTool === t.id ? styles.toolBtnActive : {}) }}
            onClick={() => setActiveTool(t.id)}
          >
            <span style={styles.toolIcon}>{t.icon}</span>
            <span style={styles.toolLabel}>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={styles.divider} />

      {/* 标签快捷栏 */}
      <div style={styles.group}>
        <div style={styles.groupLabel}>标签</div>
        <LabelQuickPicker />
      </div>

      <div style={styles.divider} />

      {/* 笔刷大小 */}
      {activeTool === 'brush' && (
        <>
          <div style={styles.group}>
            <div style={styles.groupLabel}>笔刷 {brushRadius}px</div>
            <input type="range" min="5" max="80" value={brushRadius}
              style={styles.slider}
              onChange={e => setBrushRadius(parseInt(e.target.value))} />
          </div>
          <div style={styles.divider} />
        </>
      )}

      {/* 透明度 */}
      <div style={styles.group}>
        <div style={styles.groupLabel}>叠加 {Math.round((1-opacity)*100)}%</div>
        <input type="range" min="0" max="1" step="0.05" value={opacity}
          style={styles.slider}
          onChange={e => setOpacity(parseFloat(e.target.value))} />
      </div>

      <div style={styles.divider} />

      {/* 撤销/重做 */}
      <div style={styles.group}>
        <button style={{ ...styles.actionBtn, ...(canUndoNow ? null : styles.actionBtnDisabled) }} onClick={undo} title="撤销 Ctrl+Z" disabled={!canUndoNow}>↩ 撤销</button>
        <button style={{ ...styles.actionBtn, ...(canRedoNow ? null : styles.actionBtnDisabled) }} onClick={redo} title="重做 Ctrl+Y" disabled={!canRedoNow}>↪ 重做</button>
      </div>

      <div style={styles.divider} />

      {/* 分析 */}
      <div style={styles.group}>
        <select
          style={styles.select}
          value={analysisType}
          onChange={(e) => {
            const t = e.target.value
            useStore.setState({
              analysisType: t,
              heatmapScale: 0.4,
              heatmapGamma: 0.4,
            })
          }}
        >
          {ANALYSIS_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <button style={styles.analysisBtn} onClick={runAnalysis}>
          ◎ 运行分析
        </button>
        {showAnalysis && (
          <>
            <div style={styles.groupLabel}>热力范围 {heatmapScale.toFixed(1)}×</div>
            <input
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={heatmapScale}
              style={styles.slider}
              onChange={(e) => setHeatmapScale(parseFloat(e.target.value))}
            />
            <div style={styles.groupLabel}>梯度对比 {heatmapGamma.toFixed(1)}</div>
            <input
              type="range"
              min="0.1"
              max="1.6"
              step="0.1"
              value={heatmapGamma}
              style={styles.slider}
              onChange={(e) => setHeatmapGamma(parseFloat(e.target.value))}
            />
          </>
        )}
        {showAnalysis && (
          <button style={styles.actionBtn} onClick={() => setShowAnalysis(false)}>
            关闭热力图
          </button>
        )}
      </div>

      <div style={styles.divider} />

      {/* 保存 */}
      <div style={styles.group}>
        <button style={styles.actionBtn} onClick={saveToDb}>💾 保存</button>
      </div>
    </div>
  )
}

function LabelQuickPicker() {
  const { activeLabel, setActiveLabel } = useStore()
  const visible = LABELS.slice(0, 12)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {visible.map(l => (
        <button
          key={l.id}
          style={{
            ...styles.labelChip,
            borderColor: activeLabel === l.id ? l.color : 'transparent',
            background: activeLabel === l.id ? l.color + '22' : 'transparent',
          }}
          onClick={() => setActiveLabel(l.id)}
        >
          <span style={{ ...styles.labelDot, background: l.color }} />
          <span style={styles.labelName}>{l.name}</span>
        </button>
      ))}
    </div>
  )
}

const styles = {
  toolbar: {
    width: '120px',
    flexShrink: 0,
    background: '#0d1117',
    borderRight: '1px solid #1e2d3d',
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
    zIndex: 10,
  },
  group: { display: 'flex', flexDirection: 'column', gap: '4px' },
  groupLabel: {
    fontSize: '9px', letterSpacing: '0.12em',
    color: '#334155', textTransform: 'uppercase', paddingLeft: '2px',
    marginBottom: '2px',
  },
  divider: { height: '1px', background: '#1e2d3d', margin: '2px 0' },
  toolBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid transparent',
    color: '#64748b',
    fontSize: '12px',
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    borderRadius: '3px',
    transition: 'all 0.1s',
  },
  toolBtnActive: {
    background: '#1e2d3d',
    border: '1px solid #2e4a6d',
    color: '#22c55e',
  },
  toolIcon: { fontSize: '10px', width: '12px', textAlign: 'center' },
  toolLabel: { fontSize: '11px' },
  slider: { width: '100%', accentColor: '#22c55e', cursor: 'pointer' },
  actionBtn: {
    padding: '5px 8px',
    background: 'transparent',
    border: '1px solid #1e2d3d',
    color: '#64748b',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    borderRadius: '3px',
    transition: 'all 0.1s',
    textAlign: 'left',
  },
  actionBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  select: {
    width: '100%',
    background: '#0d1117',
    border: '1px solid #1e2d3d',
    color: '#cbd5e1',
    padding: '6px 8px',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    borderRadius: '3px',
    outline: 'none',
  },
  analysisBtn: {
    padding: '7px 8px',
    background: 'transparent',
    border: '1px solid #16a34a',
    color: '#22c55e',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    borderRadius: '3px',
    letterSpacing: '0.03em',
  },
  labelChip: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '4px 6px',
    background: 'transparent',
    border: '1px solid transparent',
    color: '#94a3b8',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    borderRadius: '3px',
    transition: 'all 0.1s',
    textAlign: 'left',
  },
  labelDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  labelName: { fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
}
