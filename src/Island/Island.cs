#nullable enable
using System;
using System.Collections.Generic;
using System.Numerics;

namespace net.rs64.TexTransCore.UVIsland
{
    [Serializable]
    public class Island
    {
        public List<TriangleIndex> Triangles;
        public IslandTransform Transform = new();

        public Island(Island source)
        {
            Triangles = new List<TriangleIndex>(source.Triangles);
            Transform = source.Transform;
        }
        public Island(TriangleIndex triangleIndex, IslandTransform? islandTransform = null)
        {
            Triangles = new List<TriangleIndex> { triangleIndex };
            Transform = islandTransform ?? new();
        }
        public Island(List<TriangleIndex> trianglesOfIsland, IslandTransform? islandTransform = null)
        {
            Triangles = trianglesOfIsland;
            Transform = islandTransform ?? new();
        }
        public Island()
        {
            Triangles = new List<TriangleIndex>();
        }
    }
    public class IslandTransform
    {
        public Vector2 Position;
        public Vector2 Size;

        // radian
        public float Rotation;

        public static Vector2 RotateVector(Vector2 vec, float radian)
        {
            var x = (float)(vec.X * Math.Cos(radian) - vec.Y * Math.Sin(radian));
            var y = (float)(vec.X * Math.Sin(radian) + vec.Y * Math.Cos(radian));
            return new(x, y);
        }
        public Vector2 GetRotatedMaxPos()
        {
            return RotateVector(Size, Rotation);
        }

        public IslandTransform Clone()
        {
            return new()
            {
                Position = this.Position,
                Size = this.Size,
                Rotation = this.Rotation,
            };
        }


    }
}
