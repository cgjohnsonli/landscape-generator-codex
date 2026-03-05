import { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore.js'
import { LABELS, paintBrush, fillPolygon } from '../core/raster.js'
import { changedToCommand, pushHistory } from '../core/history.js'
import { distToImageData } from '../core/analysis.js'

export default function MapCanvas() {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null) // 编辑交互层
  const {
    raster, sourceImage, renderTick, opacity,
    activeTool,
    distMap, showAnalysis,
  } = useStore()

  // 编辑状态（不进入 zustand，减少重渲染）
  const editState = useRef({
    isDrawing: false,
    polygonPoints: [],      // 多边形顶点 [{x,y}]
    lastPx: null, lastPy: null,
  })


  const [zoom, setZoom] = useState(1)

  // ── 主渲染 ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !raster) return
    const ctx = canvas.getContext('2d')

    canvas.width = raster.width
    canvas.height = raster.height

    // 1. 绘制语义点阵
    const imgData = new ImageData(raster.width, raster.height)
    const { data } = imgData
    for (let i = 0; i < raster.data.length; i++) {
      const labelId = raster.data[i]
      const [r, g, b] = LABELS[labelId]?.rgb ?? [100, 116, 139]
      const base = i * 4
      data[base] = r; data[base+1] = g; data[base+2] = b; data[base+3] = 255
    }
    ctx.putImageData(imgData, 0, 0)

    // 2. 叠加原图（半透明参考层）
    if (sourceImage && opacity > 0) {
      ctx.globalAlpha = 1 - opacity
      ctx.drawImage(sourceImage, 0, 0, raster.width, raster.height)
      ctx.globalAlpha = 1
    }

    // 3. 叠加分析热力图
    if (showAnalysis && distMap) {
      const maxDist = 500 / raster.cellSize
      const heatImgData = distToImageData(distMap, raster.width, raster.height, maxDist)
      ctx.putImageData(heatImgData, 0, 0)
    }
  }, [raster, renderTick, opacity, showAnalysis, distMap])

  // ── Overlay canvas 尺寸同步 ──
  useEffect(() => {
    const c = canvasRef.current
    const o = overlayRef.current
    if (!c || !o || !raster) return
    o.width = c.width
    o.height = c.height
  }, [raster])

  useEffect(() => {
    setZoom(1)
  }, [raster])

  // ── 坐标转换（canvas 内坐标） ──
  const getCanvasPos = useCallback((e) => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY,
    ]
  }, [])

  const toRasterPixel = useCallback((v) => {
    const cellSize = useStore.getState().raster?.cellSize ?? 1
    return v * cellSize
  }, [])

  // ── 笔刷绘制 ──
  const doBrush = useCallback((px, py) => {
    const { raster: r, activeLabel: lbl, brushRadius: br, history: hist } = useStore.getState()
    if (!r) return
    const scale = r.cellSize ?? 1
    const changed = paintBrush(r, px * scale, py * scale, br * scale, lbl)
    if (changed.length > 0) {
      pushHistory(hist, changedToCommand(changed, '笔刷'))
      useStore.setState({ history: { ...hist }, renderTick: useStore.getState().renderTick + 1 })
    }
  }, [])

  // ── 多边形绘制（overlay canvas） ──
  const drawPolygonPreview = useCallback((mouseX, mouseY) => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    const pts = editState.current.polygonPoints
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    if (pts.length === 0) return

    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    if (mouseX !== undefined) ctx.lineTo(mouseX, mouseY)
    ctx.strokeStyle = LABELS[useStore.getState().activeLabel]?.color ?? '#22c55e'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.stroke()

    // 顶点
    ctx.setLineDash([])
    for (const pt of pts) {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#22c55e'
      ctx.fill()
    }
  }, [])

  // ── 鼠标事件 ──
  const onMouseDown = useCallback((e) => {
    const [px, py] = getCanvasPos(e)
    const tool = useStore.getState().activeTool

    if (tool === 'brush') {
      editState.current.isDrawing = true
      editState.current.lastPx = px
      editState.current.lastPy = py
      doBrush(px, py)
    } else if (tool === 'polygon') {
      const pts = editState.current.polygonPoints
      // 双击或点击起点 → 完成多边形
      if (pts.length >= 3) {
        const first = pts[0]
        const dist = Math.hypot(px - first.x, py - first.y)
        if (dist < 12) {
          // Close polygon
          const { raster: r, activeLabel: lbl, history: hist } = useStore.getState()
          const rasterPts = pts.map(({ x, y }) => ({ x: toRasterPixel(x), y: toRasterPixel(y) }))
          const changed = fillPolygon(r, rasterPts, lbl)
          if (changed.length > 0) {
            pushHistory(hist, changedToCommand(changed, '多边形'))
            useStore.setState({ history: { ...hist }, renderTick: useStore.getState().renderTick + 1 })
          }
          editState.current.polygonPoints = []
          overlayRef.current?.getContext('2d').clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
          return
        }
      }
      pts.push({ x: px, y: py })
      drawPolygonPreview(px, py)
    }
  }, [doBrush, getCanvasPos, drawPolygonPreview, toRasterPixel])

  const onMouseMove = useCallback((e) => {
    const [px, py] = getCanvasPos(e)
    const tool = useStore.getState().activeTool

    if (tool === 'brush' && editState.current.isDrawing) {
      doBrush(px, py)
    } else if (tool === 'polygon') {
      drawPolygonPreview(px, py)
    }
    // 更新笔刷光标
    if (tool === 'brush') drawBrushCursor(px, py)
  }, [doBrush, getCanvasPos, drawPolygonPreview])

  const onMouseUp = useCallback(() => {
    editState.current.isDrawing = false
  }, [])

  // 笔刷光标显示
  const drawBrushCursor = (px, py) => {
    const overlay = overlayRef.current
    if (!overlay || useStore.getState().activeTool !== 'brush') return
    const ctx = overlay.getContext('2d')
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    const r = useStore.getState().brushRadius
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.strokeStyle = LABELS[useStore.getState().activeLabel]?.color ?? '#22c55e'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 2])
    ctx.stroke()
    ctx.setLineDash([])
  }

  const onMouseLeave = useCallback(() => {
    editState.current.isDrawing = false
    const overlay = overlayRef.current
    if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height)
  }, [])

  // 双击完成多边形
  const onDoubleClick = useCallback(() => {
    if (useStore.getState().activeTool !== 'polygon') return
    const pts = editState.current.polygonPoints
    if (pts.length >= 3) {
      const { raster: r, activeLabel: lbl, history: hist } = useStore.getState()
      const rasterPts = pts.map(({ x, y }) => ({ x: toRasterPixel(x), y: toRasterPixel(y) }))
      const changed = fillPolygon(r, rasterPts, lbl)
      if (changed.length > 0) {
        pushHistory(hist, changedToCommand(changed, '多边形'))
        useStore.setState({ history: { ...hist }, renderTick: useStore.getState().renderTick + 1 })
      }
      editState.current.polygonPoints = []
      overlayRef.current?.getContext('2d').clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
    }
  }, [toRasterPixel])

  const onWheelZoom = useCallback((e) => {
    e.preventDefault()
    const direction = e.deltaY < 0 ? 1 : -1
    const step = direction > 0 ? 1.1 : 0.9
    setZoom((prev) => {
      const next = prev * step
      return Math.min(8, Math.max(0.5, next))
    })
  }, [])

  const cursorStyle = activeTool === 'brush' ? 'none' : activeTool === 'polygon' ? 'crosshair' : 'grab'

  return (
    <div style={styles.root}>
      <div
        style={{ ...styles.stage, width: raster?.width ?? 0, height: raster?.height ?? 0, transform: `scale(${zoom})` }}
        onWheel={onWheelZoom}
      >
        <canvas ref={canvasRef} style={styles.canvas} />
        <canvas
          ref={overlayRef}
          style={{ ...styles.canvas, ...styles.overlay, cursor: cursorStyle }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onDoubleClick={onDoubleClick}
        />
      </div>
      <div style={styles.zoomBadge}>缩放 {Math.round(zoom * 100)}%</div>
    </div>
  )
}

const styles = {
  root: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'auto',
    background: '#080d12',
  },
  stage: {
    position: 'relative',
    transformOrigin: 'center center',
  },
  canvas: {
    position: 'absolute',
    maxWidth: '100%',
    maxHeight: '100%',
    imageRendering: 'pixelated',
    objectFit: 'contain',
  },
  overlay: {
    pointerEvents: 'all',
    background: 'transparent',
  },
  zoomBadge: {
    position: 'absolute',
    right: '12px',
    bottom: '12px',
    padding: '4px 8px',
    fontSize: '11px',
    borderRadius: '4px',
    border: '1px solid #334155',
    color: '#cbd5e1',
    background: '#0d1117cc',
    pointerEvents: 'none',
  },
}
