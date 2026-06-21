const fs = require('fs');
const path = require('path');

const placeholder = `
export const defineTool = (options: any, handler: any) => ({ ...options, handler });
export const defineFlow = (options: any, handler: any) => ({ ...options, handler });
export const configureGenkit = (options: any) => console.log('Genkit init', options);
export const googleAI = () => 'googleAI';
export const startFlowsServer = () => console.log('Server started');
`;

const dir = 'C:/Users/Basrenggg/Documents/AI Projects/paax-ai/services/ai-orchestrator/src';
fs.writeFileSync(path.join(dir, 'genkit-placeholder.ts'), placeholder);

function processDir(subdir, level) {
    const fullPath = path.join(dir, subdir);
    if (!fs.existsSync(fullPath)) return;
    const files = fs.readdirSync(fullPath);
    for (const f of files) {
        if (f.endsWith('.ts') && !f.includes('placeholder')) {
            let content = fs.readFileSync(path.join(fullPath, f), 'utf-8');
            content = content.replace(/import\s+\{[^\}]+\}\s+from\s+['"]@genkit-ai\/[^'"]+['"];\n?/g, '');
            
            const importPath = level === 0 ? './genkit-placeholder' : '../genkit-placeholder';
            if (f === 'index.ts') {
                content = `import { configureGenkit, googleAI, startFlowsServer } from '${importPath}';\n` + content;
            } else if (content.includes('defineTool')) {
                content = `import { defineTool } from '${importPath}';\n` + content;
            } else if (content.includes('defineFlow')) {
                content = `import { defineFlow } from '${importPath}';\n` + content;
            }
            
            content = content.replace(/\(input\)\s*=>/g, '(input: any) =>');
            
            fs.writeFileSync(path.join(fullPath, f), content);
        }
    }
}

processDir('', 0);
processDir('tools', 1);
processDir('flows', 1);
