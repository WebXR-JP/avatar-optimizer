import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, List, ListItemButton, ListItemText, Collapse, Typography, Paper, Divider, IconButton, Button, Chip, Stack, Slider, TextField, Autocomplete, InputAdornment } from '@mui/material';
import { ExpandLess, ExpandMore, GridOn, LightMode, Visibility, VisibilityOff, Restore, Search } from '@mui/icons-material';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';
import { UVPreviewDialog } from './UVPreviewDialog';


interface SceneInspectorProps
{
  vrm: VRM | null;
  scene?: THREE.Scene; // Three.jsシーン全体（ライトなど含む）
}

// ノードの名前パス（name配列）を取得 - 再読み込み後も一致できるように名前を使用
function getNodeNamePath(object: THREE.Object3D): string[] {
  const path: string[] = [];
  let current: THREE.Object3D | null = object;
  while (current) {
    path.unshift(current.name || current.type);
    current = current.parent;
  }
  return path;
}

// 名前パスからノードを検索
function findNodeByNamePath(root: THREE.Object3D, namePath: string[]): THREE.Object3D | null {
  if (namePath.length === 0) return null;

  // ルートから順に検索
  let current: THREE.Object3D = root;
  const pathToMatch = [...namePath];

  // ルートの名前が一致するか確認
  const rootName = pathToMatch.shift();
  if ((current.name || current.type) !== rootName) {
    return null;
  }

  // 子を順に検索
  for (const name of pathToMatch) {
    const child: THREE.Object3D | undefined = current.children.find(c => (c.name || c.type) === name);
    if (!child) return null;
    current = child;
  }

  return current;
}

// ノードまでのパスに含まれるuuidを取得
function getExpandedUuids(object: THREE.Object3D): Set<string> {
  const uuids = new Set<string>();
  let current: THREE.Object3D | null = object;
  while (current) {
    uuids.add(current.uuid);
    current = current.parent;
  }
  return uuids;
}

// localStorageキー
const SELECTED_NODE_KEY = 'sceneInspector_selectedNodePath';

// シーン内の全ノードをフラットなリストで取得
interface NodeSearchOption {
  object: THREE.Object3D;
  label: string;
  path: string;
  type: string;
}

function collectAllNodes(root: THREE.Object3D): NodeSearchOption[] {
  const nodes: NodeSearchOption[] = [];

  function traverse(obj: THREE.Object3D, pathParts: string[]) {
    const name = obj.name || `<${obj.type}>`;
    const currentPath = [...pathParts, name];

    nodes.push({
      object: obj,
      label: name,
      path: currentPath.join(' / '),
      type: obj.type,
    });

    for (const child of obj.children) {
      traverse(child, currentPath);
    }
  }

  traverse(root, []);
  return nodes;
}

interface SceneNodeProps
{
  object: THREE.Object3D;
  depth: number;
  selectedObject: THREE.Object3D | null;
  onSelect: (object: THREE.Object3D) => void;
  onVisibilityChange?: () => void;
  expandedPath: Set<string>; // 展開すべきノードのuuid集合
}

const SceneNode: React.FC<SceneNodeProps> = ({ object, depth, selectedObject, onSelect, onVisibilityChange, expandedPath }) =>
{
  // 初期展開状態: expandedPathに含まれていれば展開
  const [open, setOpen] = useState(expandedPath.has(object.uuid));
  const [visible, setVisible] = useState(object.visible);
  const hasChildren = object.children.length > 0;
  const isMesh = (object as THREE.Mesh).isMesh;

  // expandedPathが変更されたら展開状態を更新
  useEffect(() => {
    if (expandedPath.has(object.uuid)) {
      setOpen(true);
    }
  }, [expandedPath, object.uuid]);

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
                expandedPath={expandedPath}
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

// Transform編集用のVector3エディタ
interface Vector3EditorProps
{
  label: string;
  value: THREE.Vector3 | THREE.Euler;
  onChange: (axis: 'x' | 'y' | 'z', value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  isEuler?: boolean;
}

const Vector3Editor: React.FC<Vector3EditorProps> = ({
  label,
  value,
  onChange,
  min = -2,
  max = 2,
  step = 0.01,
  isEuler = false
}) =>
{
  // Eulerの場合はラジアンから度に変換して表示
  const displayValue = (v: number) => isEuler ? (v * 180 / Math.PI) : v;
  const toRadians = (deg: number) => deg * Math.PI / 180;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" color="inherit" sx={{ mb: 1 }}>{label}</Typography>
      {(['x', 'y', 'z'] as const).map((axis) => (
        <Box key={axis} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" sx={{ width: 20, color: 'rgba(0, 0, 0, 0.6)' }}>
            {axis.toUpperCase()}:
          </Typography>
          <Slider
            size="small"
            value={displayValue(value[axis])}
            onChange={(_, newValue) => {
              const v = isEuler ? toRadians(newValue as number) : (newValue as number);
              onChange(axis, v);
            }}
            min={isEuler ? -180 : min}
            max={isEuler ? 180 : max}
            step={isEuler ? 1 : step}
            sx={{ mx: 1, flex: 1 }}
          />
          <TextField
            size="small"
            type="number"
            value={displayValue(value[axis]).toFixed(isEuler ? 1 : 4)}
            onChange={(e) => {
              const v = parseFloat(e.target.value) || 0;
              onChange(axis, isEuler ? toRadians(v) : v);
            }}
            inputProps={{
              step: isEuler ? 1 : step,
              style: { padding: '4px 8px', width: 70, fontSize: 12 }
            }}
            sx={{ width: 90 }}
          />
        </Box>
      ))}
    </Box>
  );
};

interface InspectorPanelProps
{
  object: THREE.Object3D | null;
  onVisibilityChange?: () => void;
  onTransformChange?: () => void;
}

const InspectorPanel: React.FC<InspectorPanelProps> = ({ object, onVisibilityChange, onTransformChange }) =>
{
  const [uvPreviewOpen, setUvPreviewOpen] = useState(false);
  const [visible, setVisible] = useState(object?.visible ?? true);
  // Transform値を追跡して再レンダリングをトリガー
  const [, setTransformVersion] = useState(0);
  // 初期Transform値を保存
  const [initialTransform, setInitialTransform] = useState<{
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
  } | null>(null);

  // オブジェクトが変わったら可視状態を同期し、初期Transform値を保存
  useEffect(() =>
  {
    setVisible(object?.visible ?? true);
    if (object) {
      setInitialTransform({
        position: object.position.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
      });
    }
  }, [object]);

  // Transform変更ハンドラ
  const handlePositionChange = useCallback((axis: 'x' | 'y' | 'z', value: number) => {
    if (!object) return;
    object.position[axis] = value;
    object.updateMatrixWorld(true);
    setTransformVersion(v => v + 1);
    onTransformChange?.();
  }, [object, onTransformChange]);

  const handleRotationChange = useCallback((axis: 'x' | 'y' | 'z', value: number) => {
    if (!object) return;
    object.rotation[axis] = value;
    object.updateMatrixWorld(true);
    setTransformVersion(v => v + 1);
    onTransformChange?.();
  }, [object, onTransformChange]);

  const handleScaleChange = useCallback((axis: 'x' | 'y' | 'z', value: number) => {
    if (!object) return;
    object.scale[axis] = value;
    object.updateMatrixWorld(true);
    setTransformVersion(v => v + 1);
    onTransformChange?.();
  }, [object, onTransformChange]);

  // Transformリセット
  const handleResetTransform = useCallback(() => {
    if (!object || !initialTransform) return;
    object.position.copy(initialTransform.position);
    object.rotation.copy(initialTransform.rotation);
    object.scale.copy(initialTransform.scale);
    object.updateMatrixWorld(true);
    setTransformVersion(v => v + 1);
    onTransformChange?.();
  }, [object, initialTransform, onTransformChange]);

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

      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" color="inherit" sx={{ flex: 1 }}>Transform</Typography>
        <Button
          size="small"
          startIcon={<Restore />}
          onClick={handleResetTransform}
          sx={{ fontSize: 11 }}
        >
          Reset
        </Button>
      </Box>

      <Box sx={{ ml: 1, mt: 1 }}>
        <Vector3Editor
          label="Position"
          value={object.position}
          onChange={handlePositionChange}
          min={-2}
          max={2}
          step={0.001}
        />

        <Vector3Editor
          label="Rotation (degrees)"
          value={object.rotation}
          onChange={handleRotationChange}
          isEuler
        />

        <Vector3Editor
          label="Scale"
          value={object.scale}
          onChange={handleScaleChange}
          min={0}
          max={3}
          step={0.01}
        />
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
  // 展開すべきノードのuuid集合
  const [expandedPath, setExpandedPath] = useState<Set<string>>(new Set());

  // 検索用のノードリストをメモ化
  const searchableNodes = useMemo(() => {
    if (!vrm) return [];
    return collectAllNodes(vrm.scene);
  }, [vrm]);

  const handleVisibilityChange = () =>
  {
    setVisibilityVersion((v) => v + 1);
  };

  // 検索で選択されたときのハンドラ
  const handleSearchSelect = useCallback((option: NodeSearchOption | null) => {
    if (!option) return;
    setSelectedObject(option.object);
    // 名前パスを保存
    const namePath = getNodeNamePath(option.object);
    localStorage.setItem(SELECTED_NODE_KEY, JSON.stringify(namePath));
    // 選択されたノードまでのパスを展開
    setExpandedPath(getExpandedUuids(option.object));
  }, []);

  // ノード選択時にlocalStorageに保存
  const handleSelect = useCallback((object: THREE.Object3D) => {
    setSelectedObject(object);
    // 名前パスを保存
    const namePath = getNodeNamePath(object);
    localStorage.setItem(SELECTED_NODE_KEY, JSON.stringify(namePath));
    // 選択されたノードまでのパスを展開
    setExpandedPath(getExpandedUuids(object));
  }, []);

  // コンポーネントマウント時またはVRM変更時に以前選択していたノードを復元
  // マウント時にも復元するため、空の依存配列を持つ別のuseEffectで処理
  useEffect(() => {
    if (!vrm) return;

    const restoreSelection = () => {
      const savedPath = localStorage.getItem(SELECTED_NODE_KEY);
      if (!savedPath) return;

      try {
        const namePath = JSON.parse(savedPath) as string[];
        // VRMシーンから検索
        const found = findNodeByNamePath(vrm.scene, namePath);
        if (found) {
          setSelectedObject(found);
          setExpandedPath(getExpandedUuids(found));
        }
      } catch {
        // パースエラーは無視
      }
    };

    restoreSelection();
  }, [vrm]);

  // タブ切り替え等でコンポーネントが再マウントされた時も復元
  // vrm.scene.uuidを使って、同じVRMでも再マウント時に復元を試みる
  useEffect(() => {
    if (!vrm || selectedObject) return; // 既に選択されている場合はスキップ

    const savedPath = localStorage.getItem(SELECTED_NODE_KEY);
    if (!savedPath) return;

    try {
      const namePath = JSON.parse(savedPath) as string[];
      const found = findNodeByNamePath(vrm.scene, namePath);
      if (found) {
        setSelectedObject(found);
        setExpandedPath(getExpandedUuids(found));
      }
    } catch {
      // パースエラーは無視
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {/* ノード検索 */}
        <Autocomplete
          size="small"
          options={searchableNodes}
          getOptionLabel={(option) => option.label}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.object.uuid}>
              <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Typography variant="body2" noWrap>{option.label}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap>
                  {option.path}
                </Typography>
              </Box>
            </Box>
          )}
          filterOptions={(options, { inputValue }) => {
            const search = inputValue.toLowerCase();
            return options.filter(opt =>
              opt.label.toLowerCase().includes(search) ||
              opt.path.toLowerCase().includes(search)
            ).slice(0, 50); // 最大50件
          }}
          onChange={(_, value) => handleSearchSelect(value)}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder="Search nodes..."
              sx={{ mt: 1 }}
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          )}
          sx={{ mt: 1 }}
          clearOnBlur={false}
          blurOnSelect
        />
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
                  onSelect={handleSelect}
                  onVisibilityChange={handleVisibilityChange}
                  expandedPath={expandedPath}
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
              onSelect={handleSelect}
              onVisibilityChange={handleVisibilityChange}
              expandedPath={expandedPath}
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
