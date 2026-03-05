import { useStore } from '../store/useStore.js'
import { LABELS, computeStats } from '../core/raster.js'

const TABS = [
  { id: 'label', label: '图例' },
  { id: 'stats', label: '统计' },
  { id: 'analysis', label: '分析' },
]

export default function SidePanel() {
  const {
    activePanel, setActivePanel, raster, suggestions, coverageStats, analysisType,
    distMap, heatmapScale, heatmapGamma,
  } = useStore()

  return (
    <div style={styles.panel}>
      {/* Tabs */}
      <div style={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id}
            style={{ ...styles.tab, ...(activePanel === t.id ? styles.tabActive : {}) }}
            onClick={() => setActivePanel(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={styles.body}>
        {activePanel === 'label' && <LabelPanel />}
        {activePanel === 'stats' && <StatsPanel raster={raster} />}
        {activePanel === 'analysis' && (
          <AnalysisPanel
            suggestions={suggestions}
            coverageStats={coverageStats}
            analysisType={analysisType}
            distMap={distMap}
            raster={raster}
            heatmapScale={heatmapScale}
            heatmapGamma={heatmapGamma}
          />
        )}
      </div>
    </div>
  )
}

function LabelPanel() {
  const {
    layerSettings,
    designabilityMap,
    showDesignability,
    setShowDesignability,
    toggleLayerVisibility,
    toggleLayerLock,
    toggleOtherLayerVisibility,
    toggleOtherLayerLock,
    raster,
  } = useStore()
  const designableCount = designabilityMap?.reduce((acc, v) => acc + (v === 1 ? 1 : 0), 0) ?? 0
  const totalCells = raster?.data?.length ?? 0
  const designablePct = totalCells > 0 ? ((designableCount / totalCells) * 100).toFixed(1) : '0.0'
  return (
    <div>
      <div style={styles.sectionTitle}>更新设计属性</div>
      <button
        style={{ ...styles.toggleBtn, ...(showDesignability ? styles.toggleBtnOn : {}) }}
        onClick={() => setShowDesignability(!showDesignability)}
      >
        {showDesignability ? '✅ 显示可改遮罩' : '◻ 显示可改遮罩'}
      </button>
      <div style={styles.designMeta}>可更新：{designableCount} / {totalCells}（{designablePct}%）</div>

      <div style={styles.sectionTitle}>用地类型图例</div>
      {LABELS.map(l => {
        const layer = layerSettings[l.id] ?? { visible: true, locked: false }
        return (
          <div key={l.id} style={styles.legendRow}>
            <div style={{ ...styles.legendSwatch, background: l.color, opacity: layer.visible ? 1 : 0.35 }} />
            <span style={{ ...styles.legendText, opacity: layer.visible ? 1 : 0.5 }}>{l.name}</span>
            <button
              style={{ ...styles.layerBtn, ...(layer.visible ? styles.layerBtnOn : {}) }}
              onClick={() => toggleLayerVisibility(l.id)}
              onContextMenu={(e) => { e.preventDefault(); toggleOtherLayerVisibility(l.id) }}
              title="左键：切换当前图层可见性；右键：切换其他图层可见性"
            >
              {layer.visible ? '👁' : '🚫'}
            </button>
            <button
              style={{ ...styles.layerBtn, ...(layer.locked ? styles.layerBtnOn : {}) }}
              onClick={() => toggleLayerLock(l.id)}
              onContextMenu={(e) => { e.preventDefault(); toggleOtherLayerLock(l.id) }}
              title="左键：切换当前图层锁定；右键：切换其他图层锁定"
            >
              {layer.locked ? '🔒' : '🔓'}
            </button>
            <span style={styles.legendId}>#{l.id}</span>
          </div>
        )
      })}
      <div style={{ marginTop: '20px' }}>
        <div style={styles.sectionTitle}>操作说明</div>
        <div style={styles.helpText}>
          <p style={styles.helpItem}>🖌 <b>笔刷</b>：按住拖拽涂抹</p>
          <p style={styles.helpItem}>⬡ <b>多边形</b>：点击添加顶点<br/>双击或点击起点完成</p>
          <p style={styles.helpItem}>⌨ <b>Ctrl+Z</b>：撤销</p>
          <p style={styles.helpItem}>⌨ <b>Ctrl+Y</b>：重做</p>
        </div>
      </div>
    </div>
  )
}

function StatsPanel({ raster }) {
  if (!raster) return <div style={styles.empty}>暂无数据</div>
  const stats = computeStats(raster)
  const cellArea = (raster.cellSize ** 2)
  return (
    <div>
      <div style={styles.sectionTitle}>用地面积统计</div>
      <div style={styles.statsMeta}>
        栅格: {raster.width}×{raster.height} &nbsp;|&nbsp; 格元: {raster.cellSize}m
      </div>
      {stats.filter(s => s.cells > 0).map(s => (
        <div key={s.id} style={styles.statRow}>
          <div style={styles.statHeader}>
            <div style={{ ...styles.statDot, background: s.color }} />
            <span style={styles.statName}>{s.name}</span>
            <span style={styles.statPct}>{s.percent}%</span>
          </div>
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${s.percent}%`, background: s.color }} />
          </div>
          <div style={styles.statArea}>
            {(s.cells * cellArea / 1e4).toFixed(2)} hm²
          </div>
        </div>
      ))}
    </div>
  )
}


function computeHeatmapBands(distMap, raster, analysisType, heatmapScale, heatmapGamma) {
  if (!distMap || !raster) return null
  const baseMaxDist = analysisType === 'road' ? 300 / raster.cellSize : 500 / raster.cellSize
  const maxDist = Math.max(1, baseMaxDist * heatmapScale)

  let green = 0
  let yellow = 0
  let red = 0
  let valid = 0

  for (let i = 0; i < distMap.length; i++) {
    const d = distMap[i]
    if (d < 0) continue
    const normalized = Math.min(d / maxDist, 1)
    const t = Math.pow(normalized, heatmapGamma)
    valid++
    if (t < 0.33) green++
    else if (t < 0.66) yellow++
    else red++
  }

  if (valid === 0) return null
  const pct = (v) => ((v / valid) * 100).toFixed(1)
  return { greenPct: pct(green), yellowPct: pct(yellow), redPct: pct(red), valid }
}

function AnalysisPanel({ suggestions, coverageStats, analysisType, distMap, raster, heatmapScale, heatmapGamma }) {
  if (!suggestions) return (
    <div style={styles.empty}>
点击工具栏「运行分析」按钮<br/>运行空间分析热力图
    </div>
  )

  return (
    <div>
      <div style={styles.sectionTitle}>{analysisType === 'road' ? '道路可达性覆盖' : '绿地服务圈覆盖'}</div>
      {coverageStats?.map(s => (
        <div key={s.threshold} style={styles.coverRow}>
          <span style={styles.coverLabel}>{s.threshold}m 圈</span>
          <div style={styles.barTrack}>
            <div style={{ ...styles.barFill, width: `${s.percent}%`, background: '#22c55e' }} />
          </div>
          <span style={styles.coverPct}>{s.percent}%</span>
        </div>
      ))}

      <HeatmapBandSummary
        distMap={distMap}
        raster={raster}
        analysisType={analysisType}
        heatmapScale={heatmapScale}
        heatmapGamma={heatmapGamma}
      />

      <div style={{ marginTop: '20px' }}>
        <div style={styles.sectionTitle}>优化建议</div>
        {suggestions?.suggestions?.map((s, i) => (
          <div key={i} style={{ ...styles.suggCard, borderColor: s.level === 'ok' ? '#16a34a' : s.level === 'warning' ? '#d97706' : '#ef4444' }}>
            <div style={{ ...styles.suggTitle, color: s.level === 'ok' ? '#22c55e' : s.level === 'warning' ? '#fbbf24' : '#f87171' }}>
              {s.level === 'ok' ? '✓' : s.level === 'warning' ? '⚠' : '✗'} {s.title}
            </div>
            <div style={styles.suggText}>{s.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}


function HeatmapBandSummary({ distMap, raster, analysisType, heatmapScale, heatmapGamma }) {
  const bands = computeHeatmapBands(distMap, raster, analysisType, heatmapScale, heatmapGamma)
  if (!bands) return null

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={styles.sectionTitle}>热力分布占比</div>
      <div style={styles.bandRow}>
        <span style={{ ...styles.bandDot, background: '#22c55e' }} />
        <span style={styles.bandLabel}>绿色（高可达）</span>
        <span style={styles.bandPct}>{bands.greenPct}%</span>
      </div>
      <div style={styles.bandRow}>
        <span style={{ ...styles.bandDot, background: '#facc15' }} />
        <span style={styles.bandLabel}>黄色（中等）</span>
        <span style={styles.bandPct}>{bands.yellowPct}%</span>
      </div>
      <div style={styles.bandRow}>
        <span style={{ ...styles.bandDot, background: '#ef4444' }} />
        <span style={styles.bandLabel}>红色（低可达）</span>
        <span style={styles.bandPct}>{bands.redPct}%</span>
      </div>
    </div>
  )
}

const styles = {
  panel: {
    width: '220px', flexShrink: 0,
    background: '#0d1117',
    borderLeft: '1px solid #1e2d3d',
    display: 'flex', flexDirection: 'column',
    zIndex: 10,
  },
  tabs: { display: 'flex', borderBottom: '1px solid #1e2d3d' },
  tab: {
    flex: 1, padding: '10px 0',
    background: 'transparent',
    border: 'none',
    color: '#475569',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    letterSpacing: '0.05em',
    transition: 'color 0.1s',
  },
  tabActive: { color: '#22c55e', borderBottom: '1px solid #22c55e' },
  body: { flex: 1, padding: '16px 14px', overflowY: 'auto' },

  sectionTitle: {
    fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase',
    color: '#334155', marginBottom: '10px', paddingBottom: '6px',
    borderBottom: '1px solid #1e2d3d',
  },
  legendRow: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '5px 0', borderBottom: '1px solid #0f172a',
  },
  legendSwatch: { width: '12px', height: '12px', borderRadius: '2px', flexShrink: 0 },
  legendText: { fontSize: '11px', color: '#94a3b8', flex: 1 },
  legendId: { fontSize: '10px', color: '#334155', fontFamily: "'DM Mono', monospace" },

  helpText: {
    fontSize: '11px', color: '#475569', lineHeight: '1.8',
  },
  helpItem: { margin: '4px 0' },

  statsMeta: { fontSize: '10px', color: '#334155', marginBottom: '12px', fontFamily: "'DM Mono', monospace" },
  statRow: { marginBottom: '12px' },
  statHeader: { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' },
  statDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  statName: { flex: 1, fontSize: '11px', color: '#94a3b8' },
  statPct: { fontSize: '11px', color: '#64748b', fontFamily: "'DM Mono', monospace" },
  barTrack: { height: '4px', background: '#1e2d3d', borderRadius: '2px', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: '2px', transition: 'width 0.3s' },
  statArea: { fontSize: '10px', color: '#334155', marginTop: '3px', textAlign: 'right', fontFamily: "'DM Mono', monospace" },

  coverRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' },
  coverLabel: { fontSize: '10px', color: '#64748b', width: '50px', flexShrink: 0, fontFamily: "'DM Mono', monospace" },
  coverPct: { fontSize: '10px', color: '#22c55e', width: '35px', textAlign: 'right', fontFamily: "'DM Mono', monospace" },

  toggleBtn: {
    width: '100%',
    textAlign: 'left',
    padding: '6px 8px',
    background: 'transparent',
    color: '#94a3b8',
    border: '1px solid #1e2d3d',
    borderRadius: '4px',
    fontSize: '11px',
    fontFamily: "'DM Mono', monospace",
    cursor: 'pointer',
    marginBottom: '6px',
  },
  toggleBtnOn: {
    borderColor: '#ef4444',
    color: '#fecaca',
    background: '#7f1d1d33',
  },
  designMeta: { fontSize: '10px', color: '#64748b', marginBottom: '12px', fontFamily: "'DM Mono', monospace" },
  bandRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' },
  bandDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  bandLabel: { flex: 1, fontSize: '10px', color: '#94a3b8' },
  bandPct: { fontSize: '10px', color: '#cbd5e1', fontFamily: "'DM Mono', monospace" },

  suggCard: {
    padding: '10px', marginBottom: '10px',
    background: '#080d12', border: '1px solid',
    borderRadius: '4px',
  },
  suggTitle: { fontSize: '11px', fontWeight: '600', marginBottom: '6px', fontFamily: "'Syne', sans-serif" },
  suggText: { fontSize: '11px', color: '#64748b', lineHeight: '1.6' },

  empty: { fontSize: '12px', color: '#334155', textAlign: 'center', paddingTop: '40px', lineHeight: '1.8' },
}
