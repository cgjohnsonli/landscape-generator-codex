export const PROJECT_FILE_VERSION = 1

export function buildProjectSnapshot(state) {
  const { raster, designabilityMap, greenSubtypeMap, quickDesignMarkers, layerSettings, imageName } = state
  if (!raster) throw new Error('当前无可保存的底图数据')

  return {
    type: 'greenlens-project',
    version: PROJECT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    imageName: imageName || '未命名项目',
    raster: {
      width: raster.width,
      height: raster.height,
      cellSize: raster.cellSize,
      data: Array.from(raster.data),
    },
    designabilityMap: Array.from(designabilityMap ?? new Uint8Array(raster.width * raster.height)),
    greenSubtypeMap: Array.from(greenSubtypeMap ?? new Uint8Array(raster.width * raster.height)),
    quickDesignMarkers: quickDesignMarkers ?? [],
    layerSettings,
  }
}

export function downloadProjectFile(snapshot) {
  const json = JSON.stringify(snapshot)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = (snapshot.imageName || 'project').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_')
  a.href = url
  a.download = `${safeName}.greenlens.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function readProjectFile(file) {
  const text = await file.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('项目文件不是有效的 JSON')
  }

  if (parsed?.type !== 'greenlens-project') {
    throw new Error('文件类型不正确（不是 GreenLens 项目文件）')
  }
  if (!parsed?.raster?.width || !parsed?.raster?.height || !Array.isArray(parsed?.raster?.data)) {
    throw new Error('项目文件缺少 raster 数据')
  }

  const { width, height, cellSize = 1, data } = parsed.raster
  const expected = width * height
  if (data.length !== expected) {
    throw new Error(`raster 数据长度错误：期望 ${expected}，实际 ${data.length}`)
  }

  const designabilityMapRaw = Array.isArray(parsed.designabilityMap) ? parsed.designabilityMap : new Array(expected).fill(0)
  if (designabilityMapRaw.length !== expected) {
    throw new Error(`designabilityMap 数据长度错误：期望 ${expected}，实际 ${designabilityMapRaw.length}`)
  }


  const greenSubtypeMapRaw = Array.isArray(parsed.greenSubtypeMap) ? parsed.greenSubtypeMap : new Array(expected).fill(0)
  if (greenSubtypeMapRaw.length !== expected) {
    throw new Error(`greenSubtypeMap 数据长度错误：期望 ${expected}，实际 ${greenSubtypeMapRaw.length}`)
  }

  return {
    imageName: parsed.imageName || file.name,
    raster: {
      width,
      height,
      cellSize,
      data: Uint8Array.from(data),
    },
    designabilityMap: Uint8Array.from(designabilityMapRaw),
    greenSubtypeMap: Uint8Array.from(greenSubtypeMapRaw),
    quickDesignMarkers: Array.isArray(parsed.quickDesignMarkers) ? parsed.quickDesignMarkers : [],
    layerSettings: parsed.layerSettings,
  }
}
