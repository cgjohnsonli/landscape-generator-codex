/**
 * store/useStore.js
 * 全局状态管理（Zustand）
 */
import { create } from 'zustand'
import { createHistory, pushHistory, undo, redo, canUndo, canRedo, changedToCommand } from '../core/history.js'
import { LABELS } from '../core/raster.js'

const createDefaultLayers = () => Object.fromEntries(
  LABELS.map((l) => [l.id, { visible: true, locked: false }])
)

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
  designabilityMap: null,  // Uint8Array: 0=不可改,1=可改
  subCategoryMap: null,    // Uint8Array: 子类 ID（含义取决于主类）
  renderTick: 0,           // 用于触发 canvas 重绘

  // ── 编辑工具 ──
  activeTool: 'brush',     // 'brush' | 'polygon' | 'pan'
  activeLabel: 3,          // 当前绘制标签（默认绿地）
  activeSubCategory: 0,    // 当前绘制子类 ID
  showSubCategories: false, // 是否用子类颜色渲染
  brushRadius: 20,         // 像素半径
  opacity: 0.85,           // 叠加层透明度
  editTarget: 'landuse',   // 'landuse' | 'designability'
  designabilityPaintValue: 1,
  showDesignability: false,

  // ── 历史 ──
  history: createHistory(),

  // ── 分析结果 ──
  distMap: null,
  coverageStats: null,
  suggestions: null,
  showAnalysis: false,
  analysisType: 'green',
  heatmapScale: 0.4,
  heatmapGamma: 0.4,

  // ── 图层 ──
  layerSettings: createDefaultLayers(),

  // ── 视图 ──
  activePanel: 'label',   // 'label' | 'stats' | 'analysis'

  // ── 标记 ──
  markers: [],             // [{ id, name, x, y }]  canvas 像素坐标

  // ── Actions ──
  setSourceImage: (img, data, name) => set({ sourceImage: img, imageData: data, imageName: name }),
  setClusters: (clusters) => set({ clusters }),
  setClusterToLabel: (map) => set({ clusterToLabel: map }),
  setProcessing: (isProcessing, msg = '') => set({ isProcessing, processingMsg: msg }),
  setRaster: (raster) => set({
    raster,
    designabilityMap: raster ? new Uint8Array(raster.width * raster.height) : null,
    subCategoryMap: raster ? new Uint8Array(raster.width * raster.height) : null,
    history: createHistory(),
    renderTick: get().renderTick + 1,
  }),
  triggerRender: () => set({ renderTick: get().renderTick + 1 }),

  setActiveTool: (t) => set({ activeTool: t }),
  setActiveLabel: (id) => set({ activeLabel: id, activeSubCategory: 0 }),
  setActiveSubCategory: (id) => set({ activeSubCategory: id }),
  setShowSubCategories: (v) => set({ showSubCategories: v, renderTick: get().renderTick + 1 }),
  selectSubCategory: (labelId, subCatId) => set((state) => {
    const next = { ...state.layerSettings }
    for (const key of Object.keys(next)) {
      const lid = Number(key)
      next[lid] = { ...next[lid], locked: lid !== labelId }
    }
    return {
      activeLabel: labelId,
      activeSubCategory: subCatId,
      showSubCategories: true,
      layerSettings: next,
      renderTick: state.renderTick + 1,
    }
  }),
  setBrushRadius: (r) => set({ brushRadius: r }),
  setOpacity: (v) => set({ opacity: v }),
  setEditTarget: (v) => set({ editTarget: v }),
  setDesignabilityPaintValue: (v) => set({ designabilityPaintValue: v }),
  setShowDesignability: (v) => set({ showDesignability: v }),
  setDesignabilityMap: (map) => set({ designabilityMap: map, renderTick: get().renderTick + 1 }),
  loadProjectData: ({ imageName, raster, designabilityMap, layerSettings, subCategoryMap }) => set({
    imageName: imageName || '',
    sourceImage: null,
    imageData: null,
    clusters: null,
    clusterToLabel: [],
    raster,
    designabilityMap: designabilityMap ?? new Uint8Array(raster.width * raster.height),
    subCategoryMap: subCategoryMap ?? new Uint8Array(raster.width * raster.height),
    layerSettings: layerSettings ?? createDefaultLayers(),
    showAnalysis: false,
    distMap: null,
    coverageStats: null,
    suggestions: null,
    history: createHistory(),
    activePanel: 'label',
    activeSubCategory: 0,
    showSubCategories: false,
    renderTick: get().renderTick + 1,
  }),
  setActivePanel: (p) => set({ activePanel: p }),
  addMarker: (marker) => set((state) => ({ markers: [...state.markers, marker] })),
  removeMarker: (id) => set((state) => ({ markers: state.markers.filter((m) => m.id !== id) })),
  toggleLayerVisibility: (id) => set((state) => ({
    layerSettings: {
      ...state.layerSettings,
      [id]: { ...state.layerSettings[id], visible: !state.layerSettings[id]?.visible },
    },
  })),
  toggleLayerLock: (id) => set((state) => ({
    layerSettings: {
      ...state.layerSettings,
      [id]: { ...state.layerSettings[id], locked: !state.layerSettings[id]?.locked },
    },
  })),

  toggleOtherLayerVisibility: (id) => set((state) => {
    const next = { ...state.layerSettings }
    for (const key of Object.keys(next)) {
      const lid = Number(key)
      if (lid === id) continue
      next[lid] = { ...next[lid], visible: !next[lid]?.visible }
    }
    return { layerSettings: next }
  }),
  toggleOtherLayerLock: (id) => set((state) => {
    const next = { ...state.layerSettings }
    for (const key of Object.keys(next)) {
      const lid = Number(key)
      if (lid === id) continue
      next[lid] = { ...next[lid], locked: !next[lid]?.locked }
    }
    return { layerSettings: next }
  }),

  setDistMap: (distMap, coverageStats, suggestions, analysisType = 'green') =>
    set({ distMap, coverageStats, suggestions, analysisType, showAnalysis: true }),
  setShowAnalysis: (v) => set({ showAnalysis: v }),
  setHeatmapScale: (v) => set({ heatmapScale: v }),
  setHeatmapGamma: (v) => set({ heatmapGamma: v }),

  pushEdit(changed, label) {
    const { history } = get()
    pushHistory(history, changedToCommand(changed, label))
    set({ history: { ...history }, renderTick: get().renderTick + 1 })
  },

  undo() {
    const { history, raster, designabilityMap, subCategoryMap } = get()
    if (undo(history, raster, designabilityMap, subCategoryMap)) set({ history: { ...history }, renderTick: get().renderTick + 1 })
  },
  redo() {
    const { history, raster, designabilityMap, subCategoryMap } = get()
    if (redo(history, raster, designabilityMap, subCategoryMap)) set({ history: { ...history }, renderTick: get().renderTick + 1 })
  },
  canUndo: () => canUndo(get().history),
  canRedo: () => canRedo(get().history),
}))
