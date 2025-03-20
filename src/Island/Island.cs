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
        public Vector2 GetNotRotatedMaxPos()
        {
            return Position + Size;
        }
        public Vector2 GetRotatedMaxPos()
        {
            return Position + RotateVector(Size, Rotation);
        }

        public IslandTransform Clone()
        {
            var newI = new IslandTransform();
            newI.CopyFrom(this);
            return newI;
        }
        public void CopyFrom(IslandTransform from)
        {
            Position = from.Position;
            Size = from.Size;
            Rotation = from.Rotation;
        }
        public float GetArea()
        {
            return Size.X * Size.Y;
        }

        public TTVector4 GetBox(bool applyRotate = true)
        {
            var box = new TTVector4(Position.X, Position.Y, Position.X, Position.Y);
            var maxPos = applyRotate ? GetRotatedMaxPos() : GetNotRotatedMaxPos();
            box.X = Math.Min(box.X, maxPos.X);
            box.Y = Math.Min(box.Y, maxPos.Y);
            box.Z = Math.Max(box.Z, maxPos.X);
            box.W = Math.Max(box.W, maxPos.Y);
            return box;
        }
        public bool Intersect(IslandTransform other, bool applyRotate = true)
        {
            var thisBox = GetBox(applyRotate);
            var otherBox = other.GetBox(applyRotate);
            return thisBox.X <= otherBox.Z && thisBox.Z >= otherBox.X
            && thisBox.Y <= otherBox.W && thisBox.W >= otherBox.Y;
        }
        public IslandTransform IntersectBox(IslandTransform other)
        {
            if (TTMath.Approximately(Rotation, 0f) is false || TTMath.Approximately(other.Rotation, 0f) is false) { throw new Exception(); }
            var thisBox = GetBox(false);
            var otherBox = other.GetBox(false);

            var interLeft = Math.Max(thisBox.X, otherBox.X);
            var interBottom = Math.Max(thisBox.Y, otherBox.Y);

            var interRight = Math.Min(thisBox.Z, otherBox.Z);
            var interTop = Math.Min(thisBox.W, otherBox.W);

            var min = new Vector2(interLeft, interBottom);
            var max = new Vector2(interRight, interTop);
            return new() { Position = min, Size = max - min };
        }


    }
}
