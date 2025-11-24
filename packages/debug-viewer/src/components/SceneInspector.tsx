import React, { useState } from 'react';
import { Box, List, ListItemButton, ListItemText, Collapse, Typography, Paper, Divider, IconButton, Button } from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import * as THREE from 'three';
import { VRM } from '@pixiv/three-vrm';


interface SceneInspectorProps
{
  vrm: VRM | null;
}

interface SceneNodeProps
{
  object: THREE.Object3D;
  depth: number;
  selectedObject: THREE.Object3D | null;
  onSelect: (object: THREE.Object3D) => void;
}

const SceneNode: React.FC<SceneNodeProps> = ({ object, depth, selectedObject, onSelect }) =>
{
  const [open, setOpen] = useState(false);
  const hasChildren = object.children.length > 0;

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

  const isSelected = selectedObject === object;

  return (
    <>
      <ListItemButton
        sx={{ pl: depth * 2, py: 0.5, backgroundColor: isSelected ? 'rgba(25, 118, 210, 0.12)' : 'transparent' }}
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
            style: { fontWeight: isSelected ? 'bold' : 'normal' },
            color: 'inherit'
          }}
        />
        <Typography variant="caption" sx={{ color: 'rgba(0, 0, 0, 0.6)' }}>
          {object.type}
        </Typography>
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
              />
            ))}
          </List>
        </Collapse>
      )}
    </>
  );
};

const InspectorPanel: React.FC<{ object: THREE.Object3D | null }> = ({ object }) =>
{
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

      <Button
        variant="outlined"
        size="small"
        onClick={() => console.log(object)}
        sx={{ mt: 1, mb: 1 }}
      >
        Log to Console
      </Button>

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

export const SceneInspector: React.FC<SceneInspectorProps> = ({ vrm }) =>
{
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null);

  if (!vrm)
  {
    return <Box sx={{ p: 2, color: 'black' }}>No VRM loaded</Box>;
  }

  return (
    <Box sx={{ display: 'flex', height: '100%', color: 'black' }}>
      <Paper sx={{ width: '40%', overflow: 'auto', borderRight: '1px solid #ddd', borderRadius: 0, color: 'black' }} elevation={0}>
        <List component="nav" dense>
          <SceneNode
            object={vrm.scene}
            depth={0}
            selectedObject={selectedObject}
            onSelect={setSelectedObject}
          />
        </List>
      </Paper>
      <Box sx={{ width: '60%', overflow: 'auto', bgcolor: '#f5f5f5', color: 'black' }}>
        <InspectorPanel object={selectedObject} />
      </Box>
    </Box>
  );
};
