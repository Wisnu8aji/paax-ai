const fs = require('fs');
const path = require('path');
const ts = require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const roots = [path.join(root,'apps/web/src'), path.join(root,'services/ai-orchestrator/src')];
const files=[];
function walk(dir){for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);const s=fs.statSync(p);if(s.isDirectory()) walk(p); else if(/\.tsx?$/.test(name)) files.push(p);}}
for(const dir of roots) walk(dir);
const failures=[];
for(const file of files){const source=fs.readFileSync(file,'utf8');const result=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve}});for(const d of result.diagnostics||[]){if(d.category===ts.DiagnosticCategory.Error){failures.push({file:path.relative(root,file),code:d.code,message:ts.flattenDiagnosticMessageText(d.messageText,' ')});}}}
const report={schema_version:'paax.phase30.typescript-syntax.v1',status:failures.length?'FAIL':'PASS',files_checked:files.length,passed:files.length-new Set(failures.map(x=>x.file)).size,failed_files:new Set(failures.map(x=>x.file)).size,diagnostics:failures};
console.log(JSON.stringify(report,null,2));process.exit(failures.length?1:0);
