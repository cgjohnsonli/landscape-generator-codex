import React, { useRef, useEffect, useCallback } from 'react'
import { useStore } from '../store/useStore.js'
import { LABELS, paintBrush, fillPolygon } from '../core/raster.js'
import { changedToCommand, pushHistory } from '../core/history.js'
import { distToImageData } from '../core/analysis.js'

export default function MapCanvas() {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const {
    raster, sourceImage, renderTick, opacity,
    activeTool,
    distMap, showAnalysis, analysisType,
    heatmapScale, heatmapGamma,
  } = useStore()

  const editState = useRef({
    isDrawing: false,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    originPanX: 0,
    originPanY: 0,
    polygonPoints: [],
    strokeChangedMap: new Map(),
  })

  const [zoom, setZoom] = React.useState(1)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !raster) return
    const ctx = canvas.getContext('2d')

    canvas.width = raster.width
    canvas.height = raster.height

    const imgData = new ImageData(raster.width, raster.height)
    const { data } = imgData
    for (let i = 0; i < raster.data.length; i++) {
      const labelId = raster.data[i]
      const [r, g, b] = LABELS[labelId]?.rgb ?? [100, 116, 139]
      const base = i * 4
      data[base] = r
      data[base + 1] = g
      data[base + 2] = b
      data[base + 3] = 255
    }
    ctx.putImageData(imgData, 0, 0)

    if (sourceImage && opacity > 0) {
      ctx.globalAlpha = 1 - opacity
      ctx.drawImage(sourceImage, 0, 0, raster.width, raster.height)
      ctx.globalAlpha = 1
    }

    if (showAnalysis && distMap) {
      const baseMaxDist = analysisType === 'road' ? 300 / raster.cellSize : 500 / raster.cellSize
      const maxDist = Math.max(1, baseMaxDist * heatmapScale)
      const heatImgData = distToImageData(distMap, raster.width, raster.height, maxDist, heatmapGamma)
      ctx.putImageData(heatImgData, 0, 0)
    }
  }, [raster, renderTick, opacity, showAnalysis, distMap, analysisType, heatmapScale, heatmapGamma])

  useEffect(() => {
    const c = canvasRef.current
    const o = overlayRef.current
    if (!c || !o || !raster) return
    o.width = c.width
    o.height = c.height
  }, [raster])

  useEffect(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [raster])

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

  const commitBrushStroke = useCallback(() => {
    const changedMap = editState.current.strokeChangedMap
    if (!changedMap || changedMap.size === 0) return
    const { history: hist } = useStore.getState()
    const changed = Array.from(changedMap.entries()).map(([idx, rec]) => ({ idx, old: rec.old, labelId: rec.labelId }))
    pushHistory(hist, changedToCommand(changed, '笔刷'))
    useStore.setState({ history: { ...hist } })
    changedMap.clear()
  }, [])

  const applyBrush = useCallback((px, py) => {
    const { raster: r, activeLabel: lbl, brushRadius: br } = useStore.getState()
    if (!r) return
    const scale = r.cellSize ?? 1
    const changed = paintBrush(r, px * scale, py * scale, br * scale, lbl)
    if (changed.length === 0) return

    const changedMap = editState.current.strokeChangedMap
    for (const item of changed) {
      if (!changedMap.has(item.idx)) {
        changedMap.set(item.idx, { old: item.old, labelId: item.labelId })
      } else {
        changedMap.get(item.idx).labelId = item.labelId
      }
    }
    useStore.setState({ renderTick: useStore.getState().renderTick + 1 })
  }, [])

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

    ctx.setLineDash([])
    for (const pt of pts) {
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#22c55e'
      ctx.fill()
    }
  }, [])

  const finishPolygon = useCallback(() => {
    const pts = editState.current.polygonPoints
    if (pts.length < 3) return
    const { raster: r, activeLabel: lbl, history: hist } = useStore.getState()
    if (!r) return
    const rasterPts = pts.map(({ x, y }) => ({ x: toRasterPixel(x), y: toRasterPixel(y) }))
    const changed = fillPolygon(r, rasterPts, lbl)
    if (changed.length > 0) {
      pushHistory(hist, changedToCommand(changed, '多边形'))
      useStore.setState({ history: { ...hist }, renderTick: useStore.getState().renderTick + 1 })
    }
    editState.current.polygonPoints = []
    overlayRef.current?.getContext('2d').clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
  }, [toRasterPixel])

  const onMouseDown = useCallback((e) => {
    const [px, py] = getCanvasPos(e)

    // 中键（滚轮）强制平移
    if (e.button === 1) {
      e.preventDefault()
      editState.current.isPanning = true
      editState.current.panStartX = e.clientX
      editState.current.panStartY = e.clientY
      editState.current.originPanX = pan.x
      editState.current.originPanY = pan.y
      return
    }

    // 笔刷和多边形仅左键
    if (e.button !== 0) return

    const tool = useStore.getState().activeTool

    if (tool === 'pan') {
      editState.current.isPanning = true
      editState.current.panStartX = e.clientX
      editState.current.panStartY = e.clientY
      editState.current.originPanX = pan.x
      editState.current.originPanY = pan.y
      return
    }

    if (tool === 'brush') {
      editState.current.isDrawing = true
      editState.current.strokeChangedMap = new Map()
      applyBrush(px, py)
    } else if (tool === 'polygon') {
      const pts = editState.current.polygonPoints
      if (pts.length >= 3) {
        const first = pts[0]
        const dist = Math.hypot(px - first.x, py - first.y)
        if (dist < 12) {
          finishPolygon()
          return
        }
      }
      pts.push({ x: px, y: py })
      drawPolygonPreview(px, py)
    }
  }, [applyBrush, drawPolygonPreview, finishPolygon, getCanvasPos, pan.x, pan.y])

  const onMouseMove = useCallback((e) => {
    const [px, py] = getCanvasPos(e)

    if (editState.current.isPanning) {
      const dx = e.clientX - editState.current.panStartX
      const dy = e.clientY - editState.current.panStartY
      setPan({ x: editState.current.originPanX + dx, y: editState.current.originPanY + dy })
      return
    }

    const tool = useStore.getState().activeTool
    if (tool === 'brush' && editState.current.isDrawing) {
      applyBrush(px, py)
    } else if (tool === 'polygon') {
      drawPolygonPreview(px, py)
    }
    if (tool === 'brush') drawBrushCursor(px, py)
  }, [applyBrush, drawPolygonPreview, getCanvasPos])

  const onMouseUp = useCallback(() => {
    if (editState.current.isDrawing) {
      commitBrushStroke()
    }
    editState.current.isDrawing = false
    editState.current.isPanning = false
  }, [commitBrushStroke])

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
    if (editState.current.isDrawing) commitBrushStroke()
    editState.current.isDrawing = false
    editState.current.isPanning = false
    const overlay = overlayRef.current
    if (overlay) overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height)
  }, [commitBrushStroke])

  const onDoubleClick = useCallback((e) => {
    if (e.button !== 0) return
    if (useStore.getState().activeTool !== 'polygon') return
    finishPolygon()
  }, [finishPolygon])

  const onWheelZoom = useCallback((e) => {
    e.preventDefault()
    const direction = e.deltaY < 0 ? 1 : -1
    const step = direction > 0 ? 1.1 : 0.9
    setZoom((prev) => {
      const next = prev * step
      return Math.min(8, Math.max(0.5, next))
    })
  }, [])

  const cursorStyle = editState.current.isPanning
    ? 'grabbing'
    : activeTool === 'brush'
      ? 'none'
      : activeTool === 'polygon'
        ? 'crosshair'
        : 'grab'

  return (
    <div style={styles.root}>
      <div
        style={{
          ...styles.stage,
          width: raster?.width ?? 0,
          height: raster?.height ?? 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
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
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <div style={styles.zoomBadge}>缩放 {Math.round(zoom * 100)}%</div>
    </div>
  )
}

const styles = {
  root: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
