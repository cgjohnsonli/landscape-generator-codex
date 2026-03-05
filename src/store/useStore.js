/**
 * store/useStore.js
 * 全局状态管理（Zustand）
 */
import { create } from 'zustand'
import { createHistory, pushHistory, undo, redo, canUndo, canRedo, changedToCommand } from '../core/history.js'

export const useStore = create((set, get) => ({
  // ── 图像 ──
  sourceImage: null,       // HTMLImageElement
  imageData: null,         // ImageData
  imageName: '',

  // ── 聚类结果 ──
  clusters: null,          // { centers, assignments }
  clusterToLabel: [],      // 聚类 ID → 标签 ID
  isProcessing: false,
  processingMsg: '',

  // ── 点阵 ──
  raster: null,            // RasterGrid
  renderTick: 0,           // 用于触发 canvas 重绘

  // ── 编辑工具 ──
  activeTool: 'brush',     // 'brush' | 'polygon' | 'pan'
  activeLabel: 3,          // 当前绘制标签（默认绿地）
  brushRadius: 20,         // 像素半径
  opacity: 0.85,           // 叠加层透明度

  // ── 历史 ──
  history: createHistory(),

  // ── 分析结果 ──
  distMap: null,
  coverageStats: null,
  suggestions: null,
  showAnalysis: false,

  // ── 视图 ──
  activePanel: 'label',   // 'label' | 'stats' | 'analysis'

  // ── Actions ──
  setSourceImage: (img, data, name) => set({ sourceImage: img, imageData: data, imageName: name }),
  setClusters: (clusters) => set({ clusters }),
  setClusterToLabel: (map) => set({ clusterToLabel: map }),
  setProcessing: (isProcessing, msg = '') => set({ isProcessing, processingMsg: msg }),
  setRaster: (raster) => set({ raster, renderTick: get().renderTick + 1 }),
  triggerRender: () => set({ renderTick: get().renderTick + 1 }),

  setActiveTool: (t) => set({ activeTool: t }),
  setActiveLabel: (id) => set({ activeLabel: id }),
  setBrushRadius: (r) => set({ brushRadius: r }),
  setOpacity: (v) => set({ opacity: v }),
  setActivePanel: (p) => set({ activePanel: p }),

  setDistMap: (distMap, coverageStats, suggestions) =>
    set({ distMap, coverageStats, suggestions, showAnalysis: true }),
  setShowAnalysis: (v) => set({ showAnalysis: v }),

  pushEdit(changed, label) {
    const { history } = get()
    pushHistory(history, changedToCommand(changed, label))
    set({ history: { ...history }, renderTick: get().renderTick + 1 })
  },

  undo() {
    const { history, raster } = get()
    if (undo(history, raster)) set({ history: { ...history }, renderTick: get().renderTick + 1 })
  },
  redo() {
    const { history, raster } = get()
    if (redo(history, raster)) set({ history: { ...history }, renderTick: get().renderTick + 1 })
  },
  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
}))
