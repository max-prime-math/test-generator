import type { GraphDefaults } from '@bnk-decoder/question-model';
import { generateGraphTypst } from './graph-typst';

export async function prepareGraphs(
  $typst: any,
  source: string,
  defaults: GraphDefaults
): Promise<string> {
  let result = source;
  let graphIndex = 0;

  const graphDefaultsMatch = source.match(/\/\*\s*GRAPH-DEFAULTS:(.*?)\*\//);
  let effectiveDefaults = defaults;
  if (graphDefaultsMatch) {
    try {
      effectiveDefaults = JSON.parse(graphDefaultsMatch[1]);
      result = result.replace(/\/\*\s*GRAPH-DEFAULTS:.*?\*\//, '');
    } catch {
      // Fall back to defaults if parsing fails
    }
  }

  const graphMarkerRegex = /\/\*\s*GRAPH:(.*?)\*\//gs;
  const matches = Array.from(source.matchAll(graphMarkerRegex));

  for (const match of matches) {
    const specJson = match[1];
    let spec: any;
    try {
      spec = JSON.parse(specJson);
    } catch {
      continue;
    }

    if (!spec.fn || !spec.domain || spec.xmin === undefined) continue;

    const replacement = generateGraphTypst(spec, effectiveDefaults, graphIndex);
    result = result.replace(match[0], replacement);
    graphIndex++;
  }

  return result;
}
