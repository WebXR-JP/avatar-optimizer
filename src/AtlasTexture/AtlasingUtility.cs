#nullable enable

using System;
using System.Runtime.InteropServices;
using net.rs64.TexTransCore;
using net.rs64.TexTransCore.UVIsland;

namespace net.rs64.TexTransCore.AtlasTexture
{

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    struct InputRect
    {
        public float SourcePositionX;
        public float SourcePositionY;
        public float SourceSizeX;
        public float SourceSizeY;

        public float SourceRotation;
        public float AlimentPadding11;
        public float AlimentPadding12;
        public float AlimentPadding13;


        public float TargetPositionX;
        public float TargetPositionY;

        public float TargetSizeX;
        public float TargetSizeY;

        public float TargetRotation;
        public float AlimentPadding21;
        public float AlimentPadding22;
        public float AlimentPadding23;
    }
    public static class AtlasingUtility
    {

        public static void TransMoveRectangle<TTCE>(
          TTCE engine
            , ITTRenderTexture targetRT
            , ITTRenderTexture sourceTexture
            , IslandTransform[] drawTargetSourceVirtualIslands
            , IslandTransform[] drawTargetMovedVirtualIslands
            , float islandPadding
        ) where TTCE : ITexTransCreateTexture, ITexTransGetComputeHandler, ITexTransDriveStorageBufferHolder, ITexTransComputeKeyQuery
        {
            TTLog.Assert(drawTargetSourceVirtualIslands.Length == drawTargetMovedVirtualIslands.Length,"VirtualIslands.Length is not equal");
            TTLog.Assert(drawTargetSourceVirtualIslands.Length is not 0, "Target Rect is zero");

            var atlasHeightScale = targetRT.Hight / (float)targetRT.Width;
            var inputRecs = new InputRect[drawTargetSourceVirtualIslands.Length];
            for (var i = 0; inputRecs.Length > i; i += 1)
            {
                var sourceRect = drawTargetSourceVirtualIslands[i];
                var targetRect = drawTargetMovedVirtualIslands[i];

                inputRecs[i] = new InputRect
                {
                    SourcePositionX = sourceRect.Position.X,
                    SourcePositionY = sourceRect.Position.Y,
                    SourceSizeX = sourceRect.Size.X,
                    SourceSizeY = sourceRect.Size.Y,
                    SourceRotation = sourceRect.Rotation,

                    TargetPositionX = targetRect.Position.X,
                    TargetPositionY = targetRect.Position.Y,
                    TargetSizeX = targetRect.Size.X,
                    TargetSizeY = targetRect.Size.Y,
                    TargetRotation = targetRect.Rotation,
                };
            }
            Span<byte> mappingConstantBuffer = stackalloc byte[32];
            BitConverter.TryWriteBytes(mappingConstantBuffer.Slice(0, 4), (uint)targetRT.Width);
            BitConverter.TryWriteBytes(mappingConstantBuffer.Slice(4, 4), (uint)targetRT.Hight);
            BitConverter.TryWriteBytes(mappingConstantBuffer.Slice(8, 4), (uint)sourceTexture.Width);
            BitConverter.TryWriteBytes(mappingConstantBuffer.Slice(12, 4), (uint)sourceTexture.Hight);

            BitConverter.TryWriteBytes(mappingConstantBuffer.Slice(16, 4), islandPadding);
            BitConverter.TryWriteBytes(mappingConstantBuffer.Slice(20, 4), atlasHeightScale);
            BitConverter.TryWriteBytes(mappingConstantBuffer.Slice(24, 4), 0.0f);
            BitConverter.TryWriteBytes(mappingConstantBuffer.Slice(28, 4), 0.0f);


            using var inputRectBuffer = engine.UploadStorageBuffer<InputRect>(inputRecs);
            using var transMap = engine.CreateRenderTexture(targetRT.Width, targetRT.Hight, TexTransCoreTextureChannel.RG);
            using var scalingMap = engine.CreateRenderTexture(targetRT.Width, targetRT.Hight, TexTransCoreTextureChannel.R);
            using var isWriteMap = engine.CreateRenderTexture(targetRT.Width, targetRT.Hight, TexTransCoreTextureChannel.R);

            using (var mappingHandler = engine.GetComputeHandler(engine.GetExKeyQuery<IAtlasComputeKey>().RectangleTransMapping))
            {
                var gvBufID = mappingHandler.NameToID("gv");
                var transMapID = mappingHandler.NameToID("TransMap");
                var scalingMapID = mappingHandler.NameToID("ScalingMap");
                var writeMapID = mappingHandler.NameToID("WriteMap");
                var mappingRectBufID = mappingHandler.NameToID("MappingRect");

                mappingHandler.SetStorageBuffer(mappingRectBufID, inputRectBuffer);
                mappingHandler.UploadConstantsBuffer<byte>(gvBufID, mappingConstantBuffer);

                mappingHandler.SetTexture(transMapID, transMap);
                mappingHandler.SetTexture(scalingMapID, scalingMap);
                mappingHandler.SetTexture(writeMapID, isWriteMap);

                mappingHandler.Dispatch((uint)inputRecs.Length, 1, 1);
            }

            Span<uint> readTextureParm = stackalloc uint[4];
            readTextureParm[0] = (uint)sourceTexture.Width;
            readTextureParm[1] = (uint)sourceTexture.Hight;
            readTextureParm[2] = readTextureParm[3] = 0;

            using (var samplerHandler = engine.GetComputeHandler(engine.GetExKeyQuery<IAtlasSamplerComputeKey>().AtlasSamplerKey[engine.StandardComputeKey.DefaultSampler]))
            {
                var readTextureParmBufID = samplerHandler.NameToID("ReadTextureParm");
                var readTexID = samplerHandler.NameToID("ReadTex");

                var transMapID = samplerHandler.NameToID("TransMap");
                var scalingMapID = samplerHandler.NameToID("ScalingMap");
                var isWriteMapID = samplerHandler.NameToID("WriteMap");
                var targetTexID = samplerHandler.NameToID("TargetTex");

                samplerHandler.UploadConstantsBuffer<uint>(readTextureParmBufID, readTextureParm);
                samplerHandler.SetTexture(readTexID, sourceTexture);

                samplerHandler.SetTexture(transMapID, transMap);
                samplerHandler.SetTexture(scalingMapID, scalingMap);
                samplerHandler.SetTexture(isWriteMapID, isWriteMap);
                samplerHandler.SetTexture(targetTexID, targetRT);

                samplerHandler.DispatchWithTextureSize(targetRT);
            }
        }
    }
}
