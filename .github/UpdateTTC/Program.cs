
Console.Write("Write version start ");
var versionStr = args[0];
if (versionStr.StartsWith("v")) { versionStr = versionStr[1..]; }
Console.WriteLine(versionStr);


Directory.SetCurrentDirectory("../../"); // move to repository root
var targetPath = @"package.json";
var packageJson = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(targetPath));
if (packageJson is null) { throw new NullReferenceException(); }
packageJson["version"] = versionStr;

var outOpt = new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.General);
outOpt.WriteIndented = true;
File.WriteAllText(targetPath, packageJson.ToJsonString(outOpt) + "\n");

Console.WriteLine("Write version exit!");
