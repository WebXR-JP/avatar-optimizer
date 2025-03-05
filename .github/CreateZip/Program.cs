using System.IO.Compression;

Console.WriteLine("CreateZip!");

//move to root
Directory.SetCurrentDirectory("../../");
Console.WriteLine($"CurrentDirectory:{Directory.GetCurrentDirectory()}");

var zipName = "tex-trans-core.zip";
if (File.Exists(zipName)) { File.Delete(zipName); }

{
    using var fs = File.Open(zipName, FileMode.CreateNew);
    using var zipArchiver = new ZipArchive(fs, ZipArchiveMode.Create);

    var includeFiles = Directory.GetFiles("./", "*", SearchOption.AllDirectories)
    .Where(p => p.StartsWith("./.github") is false)
    .Where(p => p.StartsWith("./.git") is false)
    .Where(p => p.StartsWith("./csproj~") is false)
    .Where(p => p.StartsWith("./.gitginore") is false)
    .Where(p => p.StartsWith("./TexTransCore.sln") is false)
    .Where(p => p.StartsWith("./" + zipName) is false)
    ;
    foreach (var path in includeFiles)
    {
        Console.WriteLine($"include:{path}");
        zipArchiver.CreateEntryFromFile(path, path[2..], System.IO.Compression.CompressionLevel.SmallestSize);
    }
}
