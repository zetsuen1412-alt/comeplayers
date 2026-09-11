import path from "node:path";
import process from "node:process";
import ts from "typescript";

const configFile = path.resolve(process.argv[2] || "tsconfig.json");
const loaded = ts.readConfigFile(configFile, ts.sys.readFile);

if (loaded.error) {
  console.error(ts.formatDiagnosticsWithColorAndContext([loaded.error], formatHost()));
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(
  loaded.config,
  ts.sys,
  path.dirname(configFile),
  { noEmit: true, incremental: false },
  configFile
);

if (parsed.errors.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, formatHost()));
  process.exit(1);
}

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
  projectReferences: parsed.projectReferences,
});
const diagnostics = ts.getPreEmitDiagnostics(program);

if (diagnostics.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost()));
  process.exit(1);
}

console.log(`TypeScript OK: ${parsed.fileNames.length} files checked (${path.basename(configFile)}).`);
process.exit(0);

function formatHost() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => ts.sys.newLine,
  };
}
