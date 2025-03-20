#nullable enable
using System;
using System.Collections.Generic;
using System.Numerics;

namespace net.rs64.TexTransCore.UVIsland
{
    public class RelocationContext
    {
        // UV 空間である Normalize されているのサイズ X == 1 , Y == 1, が基本だけど 横長だったりする場合に 高さ == 0.5f になったりするかもしれない。
        // Padding も UV の Normalize されているサイズ。

        public readonly float TargetHeight;
        public readonly float Padding;
        public readonly IslandReference? Reference;

        public RelocationContext(float targetHeight, float padding, IslandReference? reference = null)
        {
            TargetHeight = targetHeight;
            Padding = padding;
            Reference = reference;
        }

        public class IslandReference
        {
            public readonly Func<IslandTransform, Triangle2D[]> GetReferencedIslandPolygons;

            public IslandReference(Func<IslandTransform, Triangle2D[]> getReferencedIslandPolygons)
            {
                GetReferencedIslandPolygons = getReferencedIslandPolygons;
            }
        }
    }
    public class RelocationResult
    {
        public bool IsSuccess;
        public bool IsRectangleMove;
        public RelocationResult(bool isSuccess, bool isRectangleMove)
        {
            IsSuccess = isSuccess;
            IsRectangleMove = isRectangleMove;
        }
    }
    public interface IIslandRelocator
    {
        // IslandTransform は class で実態がヒープにあるからそれをいい感じに書き換えてもらうような形
        RelocationResult Relocation(RelocationContext relocationContext, IslandTransform[] islandTransforms);
    }
}
