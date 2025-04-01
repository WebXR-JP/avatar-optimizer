#nullable enable
using System;
using System.Collections.Generic;
using System.Numerics;

namespace net.rs64.TexTransCore.UVIsland
{
    public static class IslandUtility
    {
        /// <summary>
        /// Union-FindアルゴリズムのためのNode Structureです。細かいアロケーションの負荷を避けるために、配列で管理する想定で、
        /// ポインターではなくインデックスで親ノードを指定します。
        ///
        /// グループの代表でない限り、parentIndex以外の値は無視されます（古いデータが入る場合があります）
        /// </summary>
        private struct VertNode
        {
            public int parentIndex;

            public (Vector2, Vector2) boundingBox;

            public int depth;
            public int triCount;

            public Island? island;

            public VertNode(int i, Vector2 uv)
            {
                parentIndex = i;
                boundingBox = (uv, uv);
                depth = 0;
                island = null;
                triCount = 0;
            }

            /// <summary>
            /// 指定したインデックスのノードのグループの代表ノードを調べる
            /// </summary>
            /// <param name="arr"></param>
            /// <param name="index"></param>
            /// <returns></returns>
            public static int Find(VertNode[] arr, int index)
            {
                if (arr[index].parentIndex == index) return index;

                return arr[index].parentIndex = Find(arr, arr[index].parentIndex);
            }

            /// <summary>
            /// 指定したふたつのノードを結合する
            /// </summary>
            /// <param name="arr"></param>
            /// <param name="a"></param>
            /// <param name="b"></param>
            public static void Merge(VertNode[] arr, int a, int b)
            {
                a = Find(arr, a);
                b = Find(arr, b);

                if (a == b) return;

                if (arr[a].depth < arr[b].depth)
                {
                    (a, b) = (b, a);
                }

                if (arr[a].depth == arr[b].depth) arr[a].depth++;
                arr[b].parentIndex = a;

                arr[a].boundingBox = (Vector2.Min(arr[a].boundingBox.Item1, arr[b].boundingBox.Item1),
                    Vector2.Max(arr[a].boundingBox.Item2, arr[b].boundingBox.Item2));
                arr[a].triCount += arr[b].triCount;
            }

            /// <summary>
            /// このグループに該当するIslandに三角面を追加します。Islandが存在しない場合は作成しislandListに追加します。
            /// </summary>
            /// <param name="idx"></param>
            /// <param name="islandList"></param>
            public void AddTriangle(TriangleIndex idx, List<Island> islandList)
            {
                if (island == null)
                {
                    islandList.Add(island = new Island());
                    island.Triangles.Capacity = triCount;

                    var min = boundingBox.Item1;
                    var max = boundingBox.Item2;

                    island.Transform.Size = new Vector2(max.X - min.X, max.Y - min.Y);
                    island.Transform.Position = min;
                }
                island.Triangles.Add(idx);
            }
        }
        // public static List<Island> UVtoIsland(MeshData meshData, int subMeshIndex)
        // {
        //     return UVtoIsland(meshData.TriangleIndex[subMeshIndex].AsList(), meshData.VertexUV.AsList());
        // }

        public static List<Island> UVtoIsland(ReadOnlySpan<TriangleIndex> triIndexes, ReadOnlySpan<Vector2> vertexUV)
        {
            // Profiler.BeginSample("UVtoIsland");
            var islands = UVToIslandImpl(triIndexes, vertexUV);
            // Profiler.EndSample();

            return islands;
        }

        private static List<Island> UVToIslandImpl(ReadOnlySpan<TriangleIndex> triIndexes, ReadOnlySpan<Vector2> vertexUV)
        {
            int uniqueUv = 0;
            var vertCount = vertexUV.Length;
            List<Vector2> indexToUv = new List<Vector2>(vertCount);
            Dictionary<Vector2, int> uvToIndex = new Dictionary<Vector2, int>(vertCount);
            List<int> inputVertToUniqueIndex = new List<int>(vertCount);

            // 同一の位置にある頂点をまず調べて、共通のインデックスを割り当てます
            // Profiler.BeginSample("Preprocess vertices");
            foreach (var uv in vertexUV)
            {
                if (!uvToIndex.TryGetValue(uv, out var uvVert))
                {
                    uvVert = uvToIndex[uv] = uniqueUv++;
                    indexToUv.Add(uv);
                }

                inputVertToUniqueIndex.Add(uvVert);
            }
            // Profiler.EndSample();

            VertNode[] nodes = new VertNode[uniqueUv];

            // Union-Find用のデータストラクチャーを初期化
            // Profiler.BeginSample("Init vertNodes");
            for (int i = 0; i < uniqueUv; i++)
            {
                nodes[i] = new VertNode(i, indexToUv[i]);
            }
            // Profiler.EndSample();

            // Profiler.BeginSample("Merge vertices");
            foreach (var tri in triIndexes)
            {
                int idx_a = inputVertToUniqueIndex[tri.zero];
                int idx_b = inputVertToUniqueIndex[tri.one];
                int idx_c = inputVertToUniqueIndex[tri.two];

                // 三角面に該当するノードを併合
                VertNode.Merge(nodes, idx_a, idx_b);
                VertNode.Merge(nodes, idx_b, idx_c);

                // 際アロケーションを避けるために三角面を数える
                nodes[VertNode.Find(nodes, idx_a)].triCount++;
            }
            // Profiler.EndSample();

            var islands = new List<Island>();

            // この時点で代表が決まっているので、三角を追加していきます。
            // Profiler.BeginSample("Add triangles to islands");
            foreach (var tri in triIndexes)
            {
                int idx = inputVertToUniqueIndex[tri.zero];

                nodes[VertNode.Find(nodes, idx)].AddTriangle(tri, islands);
            }
            // Profiler.EndSample();

            return islands;
        }

    }
}
