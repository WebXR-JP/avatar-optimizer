import { useCallback, useState } from 'react'
import { Box, List, ListItem, ListItemButton, ListItemText, Typography, CircularProgress, Button, Divider } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import { MToonMaterial, type VRM } from '@pixiv/three-vrm'
import { MToonAtlasMaterial } from '@xrift/mtoon-atlas'
import { Mesh, Texture } from 'three'
import { Canvas } from '@react-three/fiber'
import TexturePreviewScene from './TexturePreviewScene'

interface TextureEntry
{
  name: string
  texture: Texture
}

interface TextureViewerProps
{
  vrm: VRM | null
}

/**
 * VRMモデルに含まれるテクスチャを一覧表示するコンポーネント。
 * 左側にテクスチャ名リストを表示し、右側で選択したテクスチャを表示します。
 */
function TextureViewer({ vrm }: TextureViewerProps)
{
  const [textures, setTextures] = useState<TextureEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const extractAndSetTextures = useCallback(async () =>
  {
    if (!vrm)
    {
      console.warn('No VRM model loaded.')
      setTextures([])
      setSelectedIndex(null)
      return
    }

    setIsLoading(true)

    try
    {
      const textureMap = new Map<string, Texture>()

      // シーン内のメッシュを走査してテクスチャを抽出
      vrm.scene.traverse((obj) =>
      {
        if (obj instanceof Mesh)
        {
          const material = obj.material

          if (Array.isArray(material))
          {
            material.forEach((mat) =>
            {
              if (mat instanceof MToonMaterial || ('isMToonAtlasMaterial' in mat && mat.isMToonAtlasMaterial))
              {
                extractTexturesFromMaterial(mat as MToonMaterial | MToonAtlasMaterial, textureMap)
              }
            })
          } else
          {
            if (material instanceof MToonMaterial || ('isMToonAtlasMaterial' in material && material.isMToonAtlasMaterial))
            {
              extractTexturesFromMaterial(material as MToonMaterial | MToonAtlasMaterial, textureMap)
            }
          }
        }
      })

      // Texture オブジェクトのリストに変換
      const textureList: TextureEntry[] = Array.from(textureMap.entries()).map(
        ([name, texture]) => ({
          name,
          texture,
        }),
      )

      setTextures(textureList)
      // 最初のテクスチャを選択
      setSelectedIndex(textureList.length > 0 ? 0 : null)
    } finally
    {
      setIsLoading(false)
    }
  }, [vrm])

  const selectedTexture = selectedIndex !== null ? textures[selectedIndex] : null

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* 左パネル：テクスチャリスト */}
      <Box
        sx={{
          width: 300,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #ccc',
          backgroundColor: '#f5f5f5',
        }}
      >
        {/* ヘッダー */}
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" sx={{ color: '#000' }}>
              Textures ({textures.length})
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            fullWidth
            startIcon={<RefreshIcon />}
            onClick={extractAndSetTextures}
            disabled={isLoading || !vrm}
          >
            {isLoading ? 'Loading...' : 'Reload'}
          </Button>
        </Box>

        <Divider />

        {/* テクスチャリスト */}
        {isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <CircularProgress />
          </Box>
        )}

        {!isLoading && textures.length === 0 && (
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" color="textSecondary">
              No textures found. Click "Reload" to extract textures.
            </Typography>
          </Box>
        )}

        {!isLoading && textures.length > 0 && (
          <List sx={{ overflow: 'auto', flex: 1 }}>
            {textures.map((entry, index) => (
              <ListItem key={index} disablePadding>
                <ListItemButton
                  selected={selectedIndex === index}
                  onClick={() => setSelectedIndex(index)}
                  sx={{
                    borderLeft: selectedIndex === index ? '4px solid #1976d2' : 'none',
                    paddingLeft: selectedIndex === index ? 'calc(16px - 4px)' : '16px',
                  }}
                >
                  <ListItemText
                    primary={entry.name}
                    secondary={`${(entry.texture.image as any)?.width ?? '?'} × ${(entry.texture.image as any)?.height ?? '?'}`}
                    primaryTypographyProps={{ noWrap: true, fontSize: '0.9rem', sx: { color: '#000' } }}
                    secondaryTypographyProps={{ noWrap: true, fontSize: '0.75rem' }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* 右パネル：テクスチャ表示 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedTexture ? (
          <>
            {/* テクスチャ情報 */}
            <Box sx={{ p: 2, borderBottom: '1px solid #ccc', backgroundColor: '#fafafa' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5, color: '#000' }}>
                {selectedTexture.name}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {(selectedTexture.texture.image as any)?.width ?? '?'} × {(selectedTexture.texture.image as any)?.height ?? '?'} px
              </Typography>
            </Box>

            {/* Three.js Canvas でテクスチャ表示 */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <Canvas
                style={{ width: '100%', height: '100%' }}
                orthographic
                camera={{ position: [0, 0, 5] }}
              >
                <TexturePreviewScene texture={selectedTexture.texture} />
              </Canvas>
            </Box>
          </>
        ) : (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#fafafa',
            }}
          >
            <Typography color="textSecondary">Select a texture to preview</Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}

/**
 * マテリアルからテクスチャを抽出するヘルパー関数
 */


/**
 * マテリアルからテクスチャを抽出するヘルパー関数
 */
function extractTexturesFromMaterial(
  material: MToonMaterial | MToonAtlasMaterial,
  textureMap: Map<string, Texture>,
): void
{
  // MToonAtlasMaterial の場合
  if ('isMToonAtlasMaterial' in material && material.isMToonAtlasMaterial)
  {
    const atlasMaterial = material as MToonAtlasMaterial
    const uniforms = atlasMaterial.uniforms

    // パラメータテクスチャ
    if (uniforms.uParameterTexture?.value)
    {
      const name = `${material.name || 'AtlasMaterial'}_uParameterTexture`
      textureMap.set(name, uniforms.uParameterTexture.value)
    }

    // その他のアトラス化されたテクスチャ
    const textureUniforms = [
      'map',
      'normalMap',
      'emissiveMap',
      'shadeMultiplyTexture',
      'shadingShiftTexture',
      'matcapTexture',
      'rimMultiplyTexture',
      'outlineWidthMultiplyTexture',
      'uvAnimationMaskTexture',
    ] as const

    for (const prop of textureUniforms)
    {
      const texture = uniforms[prop]?.value
      if (texture && texture instanceof Texture)
      {
        const name = `${material.name || 'AtlasMaterial'}_${prop}`
        // 重複を避けるために既に登録済みかチェックしても良いが、Mapなので上書きされる
        textureMap.set(name, texture)
      }
    }
    return
  }

  // 通常の MToonMaterial の場合
  const mtoonMaterial = material as MToonMaterial
  const textureProperties = [
    'map',
    'normalMap',
    'emissiveMap',
    'shadeMultiplyTexture',
    'shadingShiftTexture',
    'matcapTexture',
    'rimMultiplyTexture',
    'outlineWidthMultiplyTexture',
    'uvAnimationMaskTexture',
  ] as const

  for (const prop of textureProperties)
  {
    const texture = mtoonMaterial[prop]
    if (texture && texture instanceof Texture)
    {
      const name = `${mtoonMaterial.name || 'Material'}_${prop}`
      textureMap.set(name, texture)
    }
  }
}

export default TextureViewer
