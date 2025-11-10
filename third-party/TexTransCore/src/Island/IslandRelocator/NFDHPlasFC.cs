#nullable enable
using System;
using System.Collections.Generic;
using System.Linq;
using System.Numerics;
using net.rs64.TexTransCore.TTMathUtil;

namespace net.rs64.TexTransCore.UVIsland
{
    public class NFDHPlasFC : IIslandRelocator
    {
        public RelocationResult Relocation(RelocationContext relocationContext, IslandTransform[] islandTransforms)
        {
            return new(NextFitDecreasingHeightPlusFloorCeiling(islandTransforms, relocationContext.TargetHeight, relocationContext.Padding), true);
        }
        public static bool NextFitDecreasingHeightPlusFloorCeiling(IslandTransform[] islands, float targetHeight, float islandPadding = 0.01f)
        {
            if (islands.Length == 0) { return false; }

            foreach (var tf in islands)
            {
                if (tf.Size.Y > tf.Size.X)
                {
                    tf.Rotation = (float)(Math.PI / 2) * -1f;// 90度の回転！
                    tf.Size = Swap(tf.Size);
                }
                else tf.Rotation = 0f;
            }
            Array.Sort(islands, (lId, rId) => TTMath.RoundToInt((lId.Size.Y - rId.Size.Y) * 1073741824));
            Array.Reverse(islands);

            // using (var sortedIA = new NativeArray<IslandRect>(islands.Length, Allocator.Temp, NativeArrayOptions.UninitializedMemory))
            // {
            // var sortedIASpan = sortedIA.AsSpan();

            // Profiler.BeginSample("Validate");
            ValidateDeceasing(islands);
            // Profiler.EndSample();

            // Profiler.BeginSample("TryNFDHPlasFC");
            if (TryNFDHPlasFC(islands, targetHeight, islandPadding))
            {
                foreach (var tf in islands)
                {
                    if (tf.Rotation != 0f)
                    {
                        tf.Size = Swap(tf.Size);
                        tf.Position.Y += tf.Size.X;
                    }
                }
                // Profiler.EndSample();
                return true;
            }
            // Profiler.EndSample();
            return false;
            // }
        }

        private static Vector2 Swap(Vector2 size)
        {
            (size.X, size.Y) = (size.Y, size.X);
            return size;
        }

        internal static bool ValidateDeceasing(IslandTransform[] rectArray)
        {
            var validateHeight = rectArray[0].Size.Y;
            foreach (var rect in rectArray)
            {
                if (validateHeight >= rect.Size.Y) { validateHeight = rect.Size.Y; }
                else
                {
                    if (TTMath.Approximately(validateHeight, rect.Size.Y) is false)
                    {
                        // no problem
                    }
                    else
                    {
                        TTLog.Warning("NFDHPlusFC : The islands are not sorted correctly according to height. It is possible that undesirable reordering is being done.");
                        return true;
                    }
                }
            }
            return false;
        }

        static bool TryNFDHPlasFC(IslandTransform[] sortedIslands, float targetHeight, float islandPadding = 0.01f)
        {
            var uvWidthBox = new LinkedList<UVWidthBox>();

            for (var i = 0; sortedIslands.Length > i; i += 1)
            {
                // Profiler.BeginSample("TrySet");
                var islandTf = sortedIslands[i];
                if (TrySetBoxList(islandTf))
                {
                    // Profiler.EndSample();
                    continue;
                }
                // Profiler.EndSample();

                // Profiler.BeginSample("NewBox");
                var isFirstBox = uvWidthBox.Any() is false;// 外枠に余白を作ってしまうから、初回は半分の padding にすることで回避する。
                var Floor = isFirstBox ? islandPadding : uvWidthBox.Last.Value.Ceil + islandPadding * 2f;
                var newWithBox = new UVWidthBox(Floor, islandTf.Size.Y, islandPadding, 1f);

                uvWidthBox.AddLast(newWithBox);
                // var pivot = newWithBox.TrySetBox(sortedIslands[i]);
                if (newWithBox.TrySetBox(islandTf) is false)
                {
                    // 初回は基本的に失敗はありえない、ここのコードパスに入るってことは何らかのコードエラーであると言える ...
                    // Profiler.EndSample();
                    return false;
                }
                // sortedIslands[i].Pivot = pivot.Value;
                // Profiler.EndSample();
            }

            var lastHeight = uvWidthBox.Last.Value.Ceil;
            return (lastHeight + islandPadding) <= targetHeight;

            bool TrySetBoxList(IslandTransform sortedIslands)
            {
                foreach (var withBox in uvWidthBox)
                    if (withBox.TrySetBox(sortedIslands))
                        return true;
                return false;
            }

        }


        private readonly struct UVWidthBox
        {
            public readonly float Width;
            public readonly float Padding;
            public readonly float Ceil => Floor + Height;
            public readonly float Floor;
            public readonly float Height;
            public readonly LinkedList<IslandTransform> Upper;
            public readonly LinkedList<IslandTransform> Lower;

            public UVWidthBox(float floor, float height, float padding, float width = 1)
            {
                Width = width;

                Height = height;
                Floor = floor;
                Padding = padding;

                Upper = new();
                Lower = new();
            }
            // Position 成功したら Position を書き換えるよ
            public bool TrySetBox(IslandTransform islandTf)
            {
                if (Height < islandTf.Size.Y) return false;
                {
                    var isFirst = Lower.Any() is false;
                    var emptyXMin = isFirst ? 0 : Lower.Last.Value.Position.X + Lower.Last.Value.Size.X;
                    var emptyXMax = GetCeilWithEmpty(Math.Clamp(Floor + islandTf.Size.Y, Floor, Ceil));
                    var emptyWidthSize = emptyXMax - emptyXMin;
                    var islandWidth = isFirst ? (Padding * 0.5f) + islandTf.Size.X + Padding : Padding + islandTf.Size.X + Padding;
                    if (emptyWidthSize > islandWidth)
                    {
                        islandTf.Position.X = isFirst ? emptyXMin + Padding : emptyXMin + (Padding * 2f);
                        islandTf.Position.Y = Floor;
                        Lower.AddLast(islandTf);
                        return true;
                    }
                }
                {
                    var isFirst = Upper.Any() is false;
                    var emptyXMin = GetFloorWithEmpty(Math.Clamp(Ceil - islandTf.Size.Y, Floor, Ceil));
                    var emptyXMax = isFirst ? Width : Upper.Last.Value.Position.X;//ここ position が左下の端になるからそこまで埋まってるってことになるの
                    var emptyWidthSize = emptyXMax - emptyXMin;
                    var islandWidth = isFirst ? (Padding * 2f) + islandTf.Size.X + Padding : (Padding * 2f) + islandTf.Size.X + (Padding * 2f);
                    if (emptyWidthSize > islandWidth)
                    {
                        islandTf.Position.X = isFirst ? emptyXMax - islandTf.Size.X - Padding : emptyXMax - islandTf.Size.X - (Padding * 2f);
                        islandTf.Position.Y = Ceil - islandTf.Size.Y;
                        Upper.AddLast(islandTf);
                        return true;
                    }
                }

                return false;
            }

            public float GetFloorWithEmpty(float targetHeight)
            {
                if (VectorUtility.InRange(Floor, Ceil, targetHeight) is false) { throw new Exception("TargetHeight is not in range!"); }

                var xMin = 0f;
                var targetF2Height = targetHeight - Floor;

                foreach (var island in Lower)
                    if (targetF2Height < (island.Size.Y + Padding * 2f))
                    {
                        xMin = Math.Max(xMin, island.Position.X + island.Size.X);
                    }

                return xMin;
            }
            public float GetCeilWithEmpty(float targetHeight)
            {
                if (VectorUtility.InRange(Floor, Ceil, targetHeight) is false) throw new Exception("TargetHeight is not in range!");

                var xMax = Width;
                var targetC2Height = Ceil - targetHeight;

                foreach (var island in Upper)
                    if (targetC2Height < (island.Size.Y + Padding * 2f))
                    {
                        xMax = Math.Min(xMax, island.Position.X);
                    }

                return xMax;
            }
        }
    }
}
