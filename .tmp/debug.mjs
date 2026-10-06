import { analyzeRepo } from '../server/analyze.ts';
import { lsTree } from '../server/git.ts';
const idx = await analyzeRepo('.tmp/rat-fixture');
console.log('commits:', idx.commits.length);
console.log('paths:', idx.paths.length, idx.paths.slice(0, 12));
console.log('first commit tree:', idx.commits[0].tree, 'changes:', JSON.stringify(idx.commits[0].changes));
console.log('lsTree raw head:', (await lsTree('.tmp/rat-fixture', idx.headHash)).slice(0, 12));
console.log('headTree:', idx.headTree.length);
