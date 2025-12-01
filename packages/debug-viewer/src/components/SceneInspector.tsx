import React, { useState, useEffect } from 'react';
import { Box, List, ListItemButton, ListItemText, Collapse, Typography, Paper, Divider, IconButton, Button, Chip, Stack } from '@mui/material';
import { ExpandLess, ExpandMore, GridOn, LightMode, Visibility, VisibilityOff } from '@mui/icons-material';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import { UVPreviewDialog } from './UVPreviewDialog';


interface SceneInspectorProps
{
  vrm: VRM | null;
  scene?: THREE.Scene; // Three.jsシーン全体（ライトなど含む）
}

interface SceneNodeProps
{
  object: THREE.Object3D;
  depth: number;
  selectedObject: THREE.Object3D | null;
  onSelect: (object: THREE.Object3D) => void;
  onVisibilityChange?: () => void;
}

const SceneNode: React.FC<SceneNodeProps> = ({ object, depth, selectedObject, onSelect, onVisibilityChange }) =>
{
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(object.visible);
  const hasChildren = object.children.length > 0;
  const isMesh = (object as THREE.Mesh).isMesh;

  const handleClick = (e: React.MouseEvent) =>
  {
    e.stopPropagation();
    setOpen(!open);
    onSelect(object);
  };

  const handleSelect = (e: React.MouseEvent) =>
  {
    e.stopPropagation();
    onSelect(object);
  };

  const handleToggleVisibility = (e: React.MouseEvent) =>
  {
    e.stopPropagation();
    object.visible = !object.visible;
    setVisible(object.visible);
    onVisibilityChange?.();
  };

  const isSelected = selectedObject === object;

  return (
    <>
      <ListItemButton
        sx={{
          pl: depth * 2,
          py: 0.5,
          backgroundColor: isSelected ? 'rgba(25, 118, 210, 0.12)' : 'transparent',
          opacity: visible ? 1 : 0.5
        }}
        onClick={handleSelect}
      >
        {hasChildren ? (
          <IconButton size="small" onClick={handleClick} sx={{ mr: 1, color: 'inherit' }}>
            {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 28, mr: 1 }} />
        )}
        <ListItemText
          primary={object.name || `<${object.type}>`}
          primaryTypographyProps={{
            variant: 'body2',
            style: {
              fontWeight: isSelected ? 'bold' : 'normal',
              textDecoration: visible ? 'none' : 'line-through'
            },
            color: 'inherit'
          }}
        />
        <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)', mr: 1 }}>
          {object.type}
        </Typography>
        {isMesh && (
          <IconButton
            size="small"
            onClick={handleToggleVisibility}
            sx={{ color: visible ? 'inherit' : 'rgba(0, 0, 0, 0.3)' }}
          >
            {visible ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
          </IconButton>
        )}
      </ListItemButton>
      {hasChildren && (
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {object.children.map((child) => (
              <SceneNode
                key={child.uuid}
                object={child}
                depth={depth + 1}
                selectedObject={selectedObject}
                onSelect={onSelect}
                onVisibilityChange={onVisibilityChange}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

interface InspectorPanelProps
{
  object: THREE.Object3D | null;
  onVisibilityChange?: () => void;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({ object, onVisibilityChange }) =>
{
  const [uvPreviewOpen, setUvPreviewOpen] = useState(false);
  const [visible, setVisible] = useState(object?.visible ?? true);

  // オブジェクトが変わったら可視状態を同期
  useEffect(() =>
  {
    setVisible(object?.visible ?? true);
  }, [object]);

  if (!object)
  {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Select a node to view details
        </Typography>
      </Box>
    );
  }

  const isMesh = (obj: THREE.Object3D): obj is THREE.Mesh =>
  {
    return (obj as THREE.Mesh).isMesh;
  };

  const handleToggleVisibility = () =>
  {
    object.visible = !object.visible;
    setVisible(object.visible);
    onVisibilityChange?.();
  };

  return (
    <Box sx={{ p: 2, color: 'black' }}>
      <Typography variant="h6" gutterBottom color="inherit">
        {object.name || 'Unnamed Object'}
      </Typography>
      <Typography variant="caption" display="block" gutterBottom sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
        Type: {object.type}
      </Typography>
      <Typography variant="caption" display="block" gutterBottom sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
        UUID: {object.uuid}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => console.log(object)}
        >
          Log to Console
        </Button>

        {isMesh(object) && (
          <>
            <Button
              variant="outlined"
              size="small"
              startIcon={<GridOn />}
              onClick={() => setUvPreviewOpen(true)}
            >
              Show UV
            </Button>
            <Button
              variant={visible ? 'outlined' : 'contained'}
              size="small"
              startIcon={visible ? <Visibility /> : <VisibilityOff />}
              onClick={handleToggleVisibility}
              color={visible ? 'primary' : 'warning'}
            >
              {visible ? 'Visible' : 'Hidden'}
            </Button>
          </>
        )}
      </Stack>

      {isMesh(object) && (
        <UVPreviewDialog
          open={uvPreviewOpen}
          onClose={() => setUvPreviewOpen(false)}
          mesh={object}
        />
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" color="inherit">Transform</Typography>
      <Box sx={{ ml: 1, mt: 1 }}>
        <Typography variant="body2" color="inherit">Position</Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          X: {object.position.x.toFixed(4)}
        </Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Y: {object.position.y.toFixed(4)}
        </Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Z: {object.position.z.toFixed(4)}
        </Typography>

        <Typography variant="body2" sx={{ mt: 1 }} color="inherit">Rotation (Euler)</Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          X: {object.rotation.x.toFixed(4)}
        </Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Y: {object.rotation.y.toFixed(4)}
        </Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Z: {object.rotation.z.toFixed(4)}
        </Typography>

        <Typography variant="body2" sx={{ mt: 1 }} color="inherit">Scale</Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          X: {object.scale.x.toFixed(4)}
        </Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Y: {object.scale.y.toFixed(4)}
        </Typography>
        <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          Z: {object.scale.z.toFixed(4)}
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" color="inherit">Material</Typography>
      {isMesh(object) ? (
        <Box sx={{ ml: 1, mt: 1 }}>
          {Array.isArray(object.material) ? (
            object.material.map((mat, idx) => (
              <Box key={idx} sx={{ mb: 1 }}>
                <Typography variant="body2" color="inherit">{mat.name || `Material ${idx}`}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>Type: {mat.type}</Typography>
              </Box>
            ))
          ) : (
            <>
              <Typography variant="body2" color="inherit">{object.material.name || 'Unnamed Material'}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>Type: {object.material.type}</Typography>
            </>
          )}
        </Box>
      ) : (
        <Typography variant="caption" sx={{ ml: 1, color: 'rgba(0, 0, 0, 0.6)' }}>No Material</Typography>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" color="inherit">Geometry</Typography>
      {isMesh(object) ? (
        <Box sx={{ ml: 1, mt: 1 }}>
          <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>Type: {object.geometry.type}</Typography>
          {object.geometry.attributes.position && (
            <Typography variant="caption" display="block" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
              Vertices: {object.geometry.attributes.position.count}
            </Typography>
          )}
        </Box>
      ) : (
        <Typography variant="caption" sx={{ ml: 1, color: 'rgba(0, 0, 0, 0.6)' }}>No Geometry</Typography>
      )}
    </Box>
  );
};

/**
 * シーン統計を計算
 */
function computeSceneStats(scene: THREE.Object3D): {
  totalObjects: number;
  meshes: number;
  skinnedMeshes: number;
  lights: number;
  directionalLights: number;
  ambientLights: number;
  pointLights: number;
  materials: Set<THREE.Material>;
}
{
  const stats = {
    totalObjects: 0,
    meshes: 0,
    skinnedMeshes: 0,
    lights: 0,
    directionalLights: 0,
    ambientLights: 0,
    pointLights: 0,
    materials: new Set<THREE.Material>(),
  };

  scene.traverse((obj) =>
  {
    stats.totalObjects++;

    if ((obj as THREE.Mesh).isMesh)
    {
      stats.meshes++;
      const mesh = obj as THREE.Mesh;
      if (Array.isArray(mesh.material))
      {
        mesh.material.forEach((m) => stats.materials.add(m));
      } else if (mesh.material)
      {
        stats.materials.add(mesh.material);
      }
    }

    if ((obj as THREE.SkinnedMesh).isSkinnedMesh)
    {
      stats.skinnedMeshes++;
    }

    if ((obj as THREE.Light).isLight)
    {
      stats.lights++;
      if ((obj as THREE.DirectionalLight).isDirectionalLight)
      {
        stats.directionalLights++;
      }
      if ((obj as THREE.AmbientLight).isAmbientLight)
      {
        stats.ambientLights++;
      }
      if ((obj as THREE.PointLight).isPointLight)
      {
        stats.pointLights++;
      }
    }
  });

  return stats;
}

export const SceneInspector: React.FC<SceneInspectorProps> = ({ vrm, scene }) =>
{
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null);
  const [sceneStats, setSceneStats] = useState<ReturnType<typeof computeSceneStats> | null>(null);
  const [vrmStats, setVrmStats] = useState<ReturnType<typeof computeSceneStats> | null>(null);
  // 可視性変更時に再レンダリングをトリガーするためのカウンター
  const [, setVisibilityVersion] = useState(0);

  const handleVisibilityChange = () =>
  {
    setVisibilityVersion((v) => v + 1);
  };

  // シーン統計を計算
  useEffect(() =>
  {
    if (scene)
    {
      setSceneStats(computeSceneStats(scene));
    }
    if (vrm)
    {
      setVrmStats(computeSceneStats(vrm.scene));
    }
  }, [scene, vrm]);

  if (!vrm)
  {
    return <Box sx={{ p: 2, color: 'black' }}>No VRM loaded</Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', color: 'black' }}>
      {/* シーン統計パネル */}
      <Paper sx={{ p: 2, borderBottom: '1px solid #ddd', borderRadius: 0 }} elevation={0}>
        <Typography variant="subtitle2" gutterBottom>
          <LightMode fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
          Scene Statistics
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {sceneStats && (
            <>
              <Chip
                size="small"
                label={`Lights: ${sceneStats.lights}`}
                color={sceneStats.lights > 0 ? 'success' : 'error'}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Dir: ${sceneStats.directionalLights}`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Ambient: ${sceneStats.ambientLights}`}
                variant="outlined"
              />
              <Chip
                size="small"
                label={`Objects: ${sceneStats.totalObjects}`}
                variant="outlined"
              />
            </>
          )}
        </Stack>
        {vrmStats && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              VRM Scene: {vrmStats.meshes} meshes, {vrmStats.skinnedMeshes} skinned, {vrmStats.materials.size} materials
            </Typography>
          </Box>
        )}
      </Paper>

      {/* メインコンテンツ */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Paper sx={{ width: '40%', overflow: 'auto', borderRight: '1px solid #ddd', borderRadius: 0, color: 'black' }} elevation={0}>
          <List component="nav" dense>
            {/* Three.jsシーン全体を表示（渡されている場合） */}
            {scene && (
              <>
                <Typography variant="caption" sx={{ pl: 2, pt: 1, display: 'block', color: 'text.secondary' }}>
                  Full Scene
                </Typography>
                <SceneNode
                  object={scene}
                  depth={0}
                  selectedObject={selectedObject}
                  onSelect={setSelectedObject}
                  onVisibilityChange={handleVisibilityChange}
                />
                <Divider sx={{ my: 1 }} />
              </>
            )}
            <Typography variant="caption" sx={{ pl: 2, pt: 1, display: 'block', color: 'text.secondary' }}>
              VRM Scene
            </Typography>
            <SceneNode
              object={vrm.scene}
              depth={0}
              selectedObject={selectedObject}
              onSelect={setSelectedObject}
              onVisibilityChange={handleVisibilityChange}
            />
          </List>
        </Paper>
        <Box sx={{ width: '60%', overflow: 'auto', bgcolor: '#f5f5f5', color: 'black' }}>
          <InspectorPanel object={selectedObject} onVisibilityChange={handleVisibilityChange} />
        </Box>
      </Box>
    </Box>
  );
};
