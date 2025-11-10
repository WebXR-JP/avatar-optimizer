/// <summary>
/// Entry point for TexTransCore WASM library.
///
/// This file enables WASM AppBundle generation in browser-wasm builds.
/// The Main method is required to trigger the automatic generation of the
/// browser WASM bundle, similar to WasmTest.
/// </summary>

public static class TexTransCoreProgram
{
    /// <summary>
    /// Main entry point for WASM library.
    ///
    /// This serves as the entry point for the WASM application bundle.
    /// No functionality is required here as this is a library, but the presence
    /// of Main enables browser-wasm AppBundle generation.
    /// </summary>
    public static void Main(string[] args)
    {
        // Entry point for WASM library - no implementation needed
    }
}
