import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography } from '@mui/material';
import * as THREE from 'three';

interface UVPreviewDialogProps
{
  open: boolean;
  onClose: () => void;
  mesh: THREE.Mesh | null;
}

export const UVPreviewDialog: React.FC<UVPreviewDialogProps> = ({ open, onClose, mesh }) =>
{
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() =>
  {
    if (!open || !mesh || !canvas)
    {
      return;
    }

    let animationId: number;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let nonIndexedGeo: THREE.BufferGeometry | null = null;
    let material: THREE.MeshBasicMaterial | null = null;

    try
    {
      const width = 512;
      const height = 512;
      // canvas.width = width; // Let renderer setSize handle this
      // canvas.height = height;

      // 1. Setup Renderer
      // Disable alpha to ensure we see the background color
      renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true });
      renderer.setSize(width, height);
      // Set a distinct background color (Light Blue) to verify renderer is working
      renderer.setClearColor(0xffffff, 1);

      // 2. Setup Scene
      scene = new THREE.Scene();

      // 4. Process Geometry
      geometry = mesh.geometry.clone();

      nonIndexedGeo = geometry.toNonIndexed();

      const uvAttribute = nonIndexedGeo.attributes.uv;
      if (!uvAttribute)
      {
        setError('Mesh has no UV attribute');
        return;
      }

      const positionAttribute = new THREE.BufferAttribute(new Float32Array(uvAttribute.count * 3), 3);

      let minU = Infinity, maxU = -Infinity;
      let minV = Infinity, maxV = -Infinity;

      for (let i = 0; i < uvAttribute.count; i++)
      {
        const u = uvAttribute.getX(i);
        const v = uvAttribute.getY(i);
        positionAttribute.setXYZ(i, u, v, 0);

        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }

      console.log('UVPreviewDialog: UV Bounds', { minU, maxU, minV, maxV });

      nonIndexedGeo.setAttribute('position', positionAttribute);

      // Determine Camera Bounds (Fit UVs + 0..1 range)
      const viewMinU = Math.min(0, minU);
      const viewMaxU = Math.max(1, maxU);
      const viewMinV = Math.min(0, minV);
      const viewMaxV = Math.max(1, maxV);

      const padding = 0.1;
      const widthU = viewMaxU - viewMinU;
      const heightV = viewMaxV - viewMinV;

      const camLeft = viewMinU - widthU * padding;
      const camRight = viewMaxU + widthU * padding;
      const camTop = viewMaxV + heightV * padding;
      const camBottom = viewMinV - heightV * padding;

      // 3. Setup Camera
      const camera = new THREE.OrthographicCamera(camLeft, camRight, camTop, camBottom, 0.1, 10);
      camera.position.set(0, 0, 1);
      camera.lookAt(0, 0, 0);

      // Helper: Unit Square (0..1) - Guide for the texture area
      const unitSquareGeo = new THREE.BufferGeometry();
      const unitSquareVertices = new Float32Array([
        0, 0, 0, 1, 0, 0,
        1, 0, 0, 1, 1, 0,
        1, 1, 0, 0, 1, 0,
        0, 1, 0, 0, 0, 0
      ]);
      unitSquareGeo.setAttribute('position', new THREE.BufferAttribute(unitSquareVertices, 3));
      const unitSquare = new THREE.LineSegments(unitSquareGeo, new THREE.LineBasicMaterial({ color: 0xcccccc }));
      unitSquare.position.z = -0.05; // Behind mesh
      scene.add(unitSquare);

      // 5. Create Mesh for preview
      material = new THREE.MeshBasicMaterial({
        color: 0x000000,
        wireframe: true,
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true
      });

      const previewMesh = new THREE.Mesh(nonIndexedGeo, material);
      previewMesh.renderOrder = 1;
      scene.add(previewMesh);

      // 6. Render Loop
      const animate = () =>
      {
        if (!renderer || !scene) return;
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };
      animate();

      setError(null);

    } catch (err)
    {
      setError('Failed to generate UV preview');
    }

    return () =>
    {
      if (animationId) cancelAnimationFrame(animationId);
      if (renderer) renderer.dispose();
      if (geometry) geometry.dispose();
      if (nonIndexedGeo) nonIndexedGeo.dispose();
      if (material) material.dispose();
    };

  }, [open, mesh, canvas]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md">
      <DialogTitle>UV Preview: {mesh?.name || 'Unknown Mesh'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 300, minHeight: 300 }}>
          {error ? (
            <Typography color="error">{error}</Typography>
          ) : (
            <canvas ref={setCanvas} style={{ border: '1px solid #ccc' }} />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
