const PARSE_API_URL = '/api/parse'

const IMG_MAX_RETRIES = 5
const IMG_RETRY_DELAY_MS = 2000

/**
 * Parse a bank statement file via the backend (which calls TextIn official API).
 * @param {File} file
 * @returns {Promise<{ markdown: string, pages: Array }>}
 */
export async function parseDocument(file) {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(PARSE_API_URL, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`文档解析失败 (${response.status}): ${errText}`)
  }

  const data = await response.json()
  return {
    markdown: data.markdown || '',
    pages: data.pages || [],
  }
}

/**
 * Download a single page image with retry logic.
 * @param {string} imageId
 * @param {Function} [onRetry]
 * @returns {Promise<string>} data URL
 */
export async function downloadPageImage(imageId, onRetry) {
  if (!imageId) throw new Error('image_id 为空')

  for (let attempt = 0; attempt < IMG_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      onRetry?.()
      await new Promise((r) => setTimeout(r, IMG_RETRY_DELAY_MS))
    }
    try {
      const response = await fetch(`/api/image?image_id=${encodeURIComponent(imageId)}`)

      if (response.status >= 400 && response.status < 500) {
        throw new Error(`图片下载失败 HTTP ${response.status}`)
      }
      if (!response.ok) {
        if (attempt < IMG_MAX_RETRIES - 1) continue
        throw new Error(`图片下载失败 HTTP ${response.status}`)
      }

      const json = await response.json()
      const b64 = json?.data?.image ?? ''
      if (b64) return `data:image/jpeg;base64,${b64}`

      if (attempt < IMG_MAX_RETRIES - 1) continue
      throw new Error('响应中无图片数据')
    } catch (err) {
      if (attempt < IMG_MAX_RETRIES - 1) continue
      throw err
    }
  }
  throw new Error(`图片加载失败: image_id=${imageId}`)
}

/**
 * Download all page images with a concurrency of 4, calling onImageReady as each resolves.
 * @param {Array} pages
 * @param {Function} onImageReady - called with { imageId, blobUrl, pageIndex, width, height }
 */
export async function downloadAllPageImages(pages, onImageReady) {
  const CONCURRENCY = 4
  let nextToStart = 0

  async function downloadOne(i) {
    const page = pages[i]
    const blobUrl = await downloadPageImage(page.image_id).catch(() => '')
    onImageReady({
      imageId: page.image_id,
      blobUrl,
      pageIndex: i,
      width: page.width,
      height: page.height,
    })
    if (nextToStart < pages.length) {
      await downloadOne(nextToStart++)
    }
  }

  const initial = Math.min(CONCURRENCY, pages.length)
  await Promise.all(Array.from({ length: initial }, () => downloadOne(nextToStart++)))
}
