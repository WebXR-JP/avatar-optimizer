/// <summary>
/// WASM Component implementation for TexTransCore.
///
/// This module provides the WIT interface bindings for the textrans:core component,
/// exposing core texture processing capabilities as a WebAssembly component.
///
/// The component implements the textrans:core::interface interface defined in textrans.wit,
/// providing basic texture resource management and query operations.
/// </summary>

using System;
using System.Collections.Generic;
using TextransComponentWorld.wit.exports.textrans.core.v0_1_0;

/// <summary>
/// WASM component implementation of the textrans:core interface.
///
/// This class implements the exported WIT interface for WASM components,
/// providing:
/// - Library metadata (version, name)
/// - Texture resource creation and disposal
/// - Texture validation and information queries
///
/// Note: This is a Phase 2 implementation. Phase 1 focus was on WASM target setup.
/// Full texture processing functionality will be integrated after JS/WebGPU coordination.
/// </summary>
public static class CoreImpl
{
    /// <summary>
    /// Internal texture resource implementation for WIT components.
    /// Implements the resource pattern required by componentize-dotnet.
    /// </summary>
    public class TextureResource : ICore.TextureResource, ICore.ITextureResource
    {
        private uint _width;
        private uint _height;
        private byte _channel;
        private uint _memorySize;
        private bool _disposed;

        public TextureResource(uint width, uint height, byte channel, uint memorySize)
        {
            _width = width;
            _height = height;
            _channel = channel;
            _memorySize = memorySize;
            _disposed = false;
        }

        public uint Width()
        {
            if (_disposed)
                throw new ObjectDisposedException("TextureResource");
            return _width;
        }

        public uint Height()
        {
            if (_disposed)
                throw new ObjectDisposedException("TextureResource");
            return _height;
        }

        public uint MemorySize()
        {
            if (_disposed)
                throw new ObjectDisposedException("TextureResource");
            return _memorySize;
        }

        protected override void Dispose(bool disposing)
        {
            if (!_disposed)
            {
                _disposed = true;
                base.Dispose(disposing);
            }
        }
    }

    /// <summary>
    /// Internal storage for texture resources.
    /// </summary>
    private static readonly Dictionary<uint, TextureResource> TextureResources = new();
    private static uint NextTextureId = 1;

    /// <summary>
    /// Get library version string.
    ///
    /// Returns the version of TexTransCore library in semantic versioning format.
    /// </summary>
    /// <returns>Version string (e.g., "1.0.0")</returns>
    public static string GetVersion()
    {
        return "1.0.0";
    }

    /// <summary>
    /// Get library name.
    ///
    /// Returns the human-readable name of the library.
    /// </summary>
    /// <returns>Library name</returns>
    public static string GetName()
    {
        return "TexTransCore";
    }

    /// <summary>
    /// Create a render texture resource.
    ///
    /// Allocates and initializes a new texture resource with the specified dimensions
    /// and channel format. The resource handle can be used in subsequent operations.
    ///
    /// Returns a texture resource ID on success, or an error on failure.
    /// </summary>
    /// <param name="width">Texture width in pixels (must be > 0)</param>
    /// <param name="height">Texture height in pixels (must be > 0)</param>
    /// <param name="channel">
    /// Texture channel format:
    /// 0 = RGBA (4 channels, 32 bits per pixel)
    /// 1 = RGB (3 channels, 24 bits per pixel)
    /// 2 = RG (2 channels, 16 bits per pixel)
    /// 3 = R (1 channel, 8 bits per pixel)
    /// </param>
    /// <returns>
    /// Texture resource ID (u32 handle) on success,
    /// or 0 on failure (for simplicity, returning 0 indicates error).
    /// </returns>
    public static uint CreateRenderTexture(uint width, uint height, byte channel)
    {
        try
        {
            // Validate inputs
            if (width == 0 || width > 16384)
                return 0; // Error: Invalid width
            if (height == 0 || height > 16384)
                return 0; // Error: Invalid height
            if (channel > 3)
                return 0; // Error: Invalid channel

            // Calculate memory size based on channel format
            uint bytesPerPixel = channel switch
            {
                0 => 4, // RGBA
                1 => 3, // RGB
                2 => 2, // RG
                3 => 1, // R
                _ => 0  // Should not reach
            };

            uint memorySize = width * height * bytesPerPixel;

            // Check memory constraints (WASM 4GB limit)
            if (memorySize > 256 * 1024 * 1024) // 256MB limit per texture
                return 0; // Error: Texture size exceeds limit

            // Create resource entry
            uint id = NextTextureId++;
            if (id == 0) id = 1; // Skip 0 (reserved for error)

            var resource = new TextureResource(width, height, channel, memorySize);
            TextureResources[id] = resource;

            // Register with resource table for WIT component model
            TextureResource.repTable.Add(resource);

            return id;
        }
        catch
        {
            return 0; // Error: Exception occurred
        }
    }

    /// <summary>
    /// Dispose a render texture resource.
    ///
    /// Releases the memory and resources associated with the texture.
    /// The texture ID becomes invalid after disposal.
    /// </summary>
    /// <param name="id">Texture resource handle to release</param>
    public static void DisposeRenderTexture(uint id)
    {
        if (TextureResources.TryGetValue(id, out var resource))
        {
            resource.Dispose();
            TextureResources.Remove(id);
        }
    }

    /// <summary>
    /// Check if a texture resource is valid.
    ///
    /// Returns true if the texture resource exists and has not been disposed.
    /// </summary>
    /// <param name="id">Texture resource handle</param>
    /// <returns>true if valid, false otherwise</returns>
    public static bool IsTextureValid(uint id)
    {
        return TextureResources.ContainsKey(id);
    }

    /// <summary>
    /// Get texture information.
    ///
    /// Retrieves the properties of a texture resource.
    /// </summary>
    /// <param name="id">Texture resource handle</param>
    /// <returns>
    /// Tuple of (width, height, channel, memory_size),
    /// or (0, 0, 0, 0) if texture not found.
    /// </returns>
    public static (uint, uint, byte, uint) GetTextureInfo(uint id)
    {
        if (!TextureResources.TryGetValue(id, out var resource))
            return (0, 0, 0, 0);

        try
        {
            return (resource.Width(), resource.Height(), (byte)0, resource.MemorySize());
        }
        catch
        {
            return (0, 0, 0, 0);
        }
    }
}
