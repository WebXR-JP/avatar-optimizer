import { useCallback } from 'react'
import type { WebGLRenderer, Texture, WebGLRenderTarget } from 'three'

/**
 * WebGLデバッグ用ユーティリティフック
 * テクスチャやバッファをBase64でコンソール出力し、PlaywrightMCPから読み取り可能にする
 *
 * @param gl - Three.jsのWebGLRenderer
 */
export function useWebGLDebug(gl: WebGLRenderer | null) {
  /**
   * テクスチャをBase64 PNG形式でコンソール出力
   * PlaywrightMCPのconsole_messagesから取得可能
   *
   * @param texture - 出力するテクスチャ
   * @param label - 識別用ラベル
   * @param maxSize - 最大サイズ（大きい場合はリサイズ）
   */
  const dumpTexture = useCallback(
    (texture: Texture, label: string, maxSize = 256) => {
      if (!gl || !texture.image) {
        console.warn(`[WebGLDebug] テクスチャが無効: ${label}`)
        return
      }

      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // 元画像のサイズ取得
        const img = texture.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement
        let width = 'width' in img ? img.width : 0
        let height = 'height' in img ? img.height : 0

        // リサイズ（大きすぎる場合）
        if (width > maxSize || height > maxSize) {
          const scale = maxSize / Math.max(width, height)
          width = Math.floor(width * scale)
          height = Math.floor(height * scale)
        }

        canvas.width = width
        canvas.height = height

        // 描画
        ctx.drawImage(img as CanvasImageSource, 0, 0, width, height)

        // Base64出力
        const base64 = canvas.toDataURL('image/png')
        console.log(`[WebGLDebug:Texture] ${label}`)
        console.log(`[WebGLDebug:Base64] ${base64}`)
        console.log(`[WebGLDebug:Size] ${width}x${height}`)
      } catch (e) {
        console.error(`[WebGLDebug] テクスチャ出力エラー: ${label}`, e)
      }
    },
    [gl]
  )

  /**
   * RenderTargetのピクセルデータをBase64 PNG形式でコンソール出力
   *
   * @param renderTarget - 出力するRenderTarget
   * @param label - 識別用ラベル
   */
  const dumpRenderTarget = useCallback(
    (renderTarget: WebGLRenderTarget, label: string) => {
      if (!gl) {
        console.warn(`[WebGLDebug] Rendererが無効: ${label}`)
        return
      }

      try {
        const width = renderTarget.width
        const height = renderTarget.height

        // ピクセルデータ読み取り
        const pixels = new Uint8Array(width * height * 4)
        gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels)

        // Canvasに描画
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const imageData = ctx.createImageData(width, height)

        // WebGLは左下原点なので上下反転
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4
            const dstIdx = ((height - 1 - y) * width + x) * 4
            imageData.data[dstIdx] = pixels[srcIdx]
            imageData.data[dstIdx + 1] = pixels[srcIdx + 1]
            imageData.data[dstIdx + 2] = pixels[srcIdx + 2]
            imageData.data[dstIdx + 3] = pixels[srcIdx + 3]
          }
        }

        ctx.putImageData(imageData, 0, 0)

        // Base64出力
        const base64 = canvas.toDataURL('image/png')
        console.log(`[WebGLDebug:RenderTarget] ${label}`)
        console.log(`[WebGLDebug:Base64] ${base64}`)
        console.log(`[WebGLDebug:Size] ${width}x${height}`)
      } catch (e) {
        console.error(`[WebGLDebug] RenderTarget出力エラー: ${label}`, e)
      }
    },
    [gl]
  )

  /**
   * 現在のフレームバッファをBase64 PNG形式でコンソール出力
   *
   * @param label - 識別用ラベル
   * @param maxSize - 最大サイズ
   */
  const dumpFramebuffer = useCallback(
    (label: string, maxSize = 512) => {
      if (!gl) {
        console.warn(`[WebGLDebug] Rendererが無効: ${label}`)
        return
      }

      try {
        const canvas = gl.domElement

        // リサイズが必要な場合
        let width = canvas.width
        let height = canvas.height

        if (width > maxSize || height > maxSize) {
          const scale = maxSize / Math.max(width, height)
          width = Math.floor(width * scale)
          height = Math.floor(height * scale)

          // リサイズ用キャンバス
          const resizeCanvas = document.createElement('canvas')
          resizeCanvas.width = width
          resizeCanvas.height = height
          const ctx = resizeCanvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(canvas, 0, 0, width, height)
            const base64 = resizeCanvas.toDataURL('image/png')
            console.log(`[WebGLDebug:Framebuffer] ${label}`)
            console.log(`[WebGLDebug:Base64] ${base64}`)
            console.log(`[WebGLDebug:Size] ${width}x${height}`)
          }
        } else {
          const base64 = canvas.toDataURL('image/png')
          console.log(`[WebGLDebug:Framebuffer] ${label}`)
          console.log(`[WebGLDebug:Base64] ${base64}`)
          console.log(`[WebGLDebug:Size] ${width}x${height}`)
        }
      } catch (e) {
        console.error(`[WebGLDebug] Framebuffer出力エラー: ${label}`, e)
      }
    },
    [gl]
  )

  /**
   * WebGL情報をコンソール出力
   */
  const dumpWebGLInfo = useCallback(() => {
    if (!gl) {
      console.warn('[WebGLDebug] Rendererが無効')
      return
    }

    const glContext = gl.getContext()
    const debugInfo = glContext.getExtension('WEBGL_debug_renderer_info')

    const info = {
      vendor: glContext.getParameter(glContext.VENDOR),
      renderer: debugInfo
        ? glContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : glContext.getParameter(glContext.RENDERER),
      version: glContext.getParameter(glContext.VERSION),
      shadingLanguageVersion: glContext.getParameter(glContext.SHADING_LANGUAGE_VERSION),
      maxTextureSize: glContext.getParameter(glContext.MAX_TEXTURE_SIZE),
      maxCubeMapTextureSize: glContext.getParameter(glContext.MAX_CUBE_MAP_TEXTURE_SIZE),
      maxRenderbufferSize: glContext.getParameter(glContext.MAX_RENDERBUFFER_SIZE),
      maxVertexAttribs: glContext.getParameter(glContext.MAX_VERTEX_ATTRIBS),
      maxVertexUniformVectors: glContext.getParameter(glContext.MAX_VERTEX_UNIFORM_VECTORS),
      maxFragmentUniformVectors: glContext.getParameter(glContext.MAX_FRAGMENT_UNIFORM_VECTORS),
    }

    console.log('[WebGLDebug:Info]', JSON.stringify(info, null, 2))
  }, [gl])

  /**
   * シーン内の全テクスチャをリストアップ
   *
   * @param scene - Three.jsシーン
   */
  const listTextures = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (scene: any) => {
      const textures: { name: string; uuid: string; size: string }[] = []

      scene.traverse((obj: { material?: unknown }) => {
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const mat of materials) {
            // マテリアルの各テクスチャプロパティをチェック
            const textureProps = [
              'map',
              'normalMap',
              'emissiveMap',
              'aoMap',
              'roughnessMap',
              'metalnessMap',
              'alphaMap',
              'bumpMap',
              'displacementMap',
              'envMap',
              'lightMap',
              'specularMap',
              'shadeMultiplyTexture',
              'shadingShiftTexture',
              'matcapTexture',
              'rimMultiplyTexture',
              'outlineWidthMultiplyTexture',
              'uvAnimationMaskTexture',
            ]

            for (const prop of textureProps) {
              const tex = mat[prop] as Texture | undefined
              if (tex?.image) {
                const img = tex.image as { width?: number; height?: number }
                textures.push({
                  name: `${mat.name || mat.uuid}.${prop}`,
                  uuid: tex.uuid,
                  size: `${img.width || '?'}x${img.height || '?'}`,
                })
              }
            }
          }
        }
      })

      console.log(`[WebGLDebug:TextureList] Found ${textures.length} textures`)
      console.log('[WebGLDebug:TextureList]', JSON.stringify(textures, null, 2))

      return textures
    },
    []
  )

  return {
    dumpTexture,
    dumpRenderTarget,
    dumpFramebuffer,
    dumpWebGLInfo,
    listTextures,
  }
}
