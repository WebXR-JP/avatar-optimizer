RWTexture2D<float2> TransMap;
RWTexture2D<float> ScalingMap;
RWTexture2D<float> WriteMap;

RWTexture2D<float4> TargetTex;

#include "SamplerTemplate.hlsl"

[numthreads(16, 16, 1)] void CSMain(uint3 id : SV_DispatchThreadID)
{
    uint2 i = id.xy;

    if(WriteMap[i] > 0.5)
    {
        TargetTex[i] = TTSampling(TransMap[i], ScalingMap[i]);
    }
}
