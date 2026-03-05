/**
 * core/history.js
 * 操作历史（撤销/重做）— Command Pattern
 */

export function createHistory(maxSize = 50) {
  return { stack: [], cursor: -1, maxSize }
}

/**
 * 提交一个操作
 * command: { redo: (raster) => void, undo: (raster) => void, label: string }
 */
export function pushHistory(history, command) {
  // 丢弃 cursor 之后的历史
  history.stack = history.stack.slice(0, history.cursor + 1)
  history.stack.push(command)
  if (history.stack.length > history.maxSize) history.stack.shift()
  history.cursor = history.stack.length - 1
}

export function canUndo(history) {
  return history.cursor >= 0
}

export function canRedo(history) {
  return history.cursor < history.stack.length - 1
}

export function undo(history, raster) {
  if (!canUndo(history)) return false
  history.stack[history.cursor].undo(raster)
  history.cursor--
  return true
}

export function redo(history, raster) {
  if (!canRedo(history)) return false
  history.cursor++
  history.stack[history.cursor].redo(raster)
  return true
}

/**
 * 从 changed 数组（fillPolygon / paintBrush 的返回值）创建 Command
 * changed: [{ idx, old, labelId }, ...]
 */
export function changedToCommand(changed, label = '') {
  return {
    label,
    redo(raster) {
      for (const { idx, labelId } of changed) raster.data[idx] = labelId
    },
    undo(raster) {
      for (const { idx, old } of changed) raster.data[idx] = old
    },
  }
}
