export type SessionPathTouchKind = 'read' | 'search' | 'change' | 'check';

export type SessionPathTouch = {
  path: string;
  kind: SessionPathTouchKind;
  occurredAt: string;
  promptKey?: string;
};

export type SessionPathPhaseLabel =
  | 'pre-change-observation'
  | 'change-activity'
  | 'post-change-observation'
  | 'check-activity'
  | 'post-check-observation';

export type SessionPathDirection = 'up' | 'down' | 'same' | 'cross';

export type SessionPathNode = {
  id: string;
  path: string;
  type: 'repository' | 'directory' | 'file';
  parentId: string | null;
  depth: number;
  visitCount: number;
  revisitCount: number;
  observedKinds: SessionPathTouchKind[];
  firstSequence: number | null;
  lastSequence: number | null;
};

export type SessionPathEdge = {
  fromNodeId: string;
  toNodeId: string;
  direction: SessionPathDirection;
  traversalCount: number;
  firstSequence: number;
  lastSequence: number;
};

export type SessionPathTransition = {
  sequence: number;
  fromNodeId: string;
  toNodeId: string;
  fromPath: string;
  toPath: string;
  occurredAt: string;
  promptKey: string | null;
  phase: SessionPathPhaseLabel;
  direction: SessionPathDirection;
  commonDirectory: string;
  upLevels: number;
  downLevels: number;
  directoryDepthDelta: number;
};

export type SessionPathPhase = {
  label: SessionPathPhaseLabel;
  startSequence: number;
  endSequence: number;
  touchCount: number;
  observedKinds: Record<SessionPathTouchKind, number>;
};

export type SessionPathTraversalAnalysis = {
  nodes: SessionPathNode[];
  edges: SessionPathEdge[];
  transitions: SessionPathTransition[];
  phases: SessionPathPhase[];
  summary: {
    uniqueDirectories: number;
    uniqueFiles: number;
    totalRevisits: number;
    directionCounts: Record<SessionPathDirection, number>;
  };
  coverage: {
    receivedTouches: number;
    acceptedTouches: number;
    analyzedTouches: number;
    ignoredUnsafePaths: number;
    invalidTimestamps: number;
    truncatedTouches: number;
    omittedNodes: number;
    omittedEdges: number;
    omittedTransitions: number;
    complete: boolean;
    limitations: string[];
  };
};

const DEFAULT_MAXIMUM_TOUCHES = 1_000;
const DEFAULT_MAXIMUM_NODES = 1_000;
const DEFAULT_MAXIMUM_EDGES = 1_000;
const DEFAULT_MAXIMUM_TRANSITIONS = 1_000;
const HARD_MAXIMUM = 10_000;

type NormalizedTouch = Omit<SessionPathTouch, 'path'> & {
  path: string;
  sequence: number;
  phase: SessionPathPhaseLabel;
};

function boundedOption(value: number | undefined, fallback: number, minimum = 0): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(HARD_MAXIMUM, Math.floor(value)));
}

export function normalizeSessionRepositoryPath(value: string): string | null {
  if (typeof value !== 'string' || value.includes('\0')) return null;
  const portable = value.replaceAll('\\', '/');
  if (!portable || portable.startsWith('/') || portable.startsWith('//') || /^[A-Za-z]:/.test(portable)) {
    return null;
  }
  const segments = portable.split('/').filter((segment) => segment && segment !== '.');
  if (segments.length === 0 || segments.some((segment) => segment === '..')) return null;
  return segments.join('/');
}

function phaseForTouch(kind: SessionPathTouchKind, sawChange: boolean, sawCheckAfterChange: boolean): SessionPathPhaseLabel {
  if (kind === 'change') return 'change-activity';
  if (kind === 'check') return 'check-activity';
  if (!sawChange) return 'pre-change-observation';
  return sawCheckAfterChange ? 'post-check-observation' : 'post-change-observation';
}

function emptyKindCounts(): Record<SessionPathTouchKind, number> {
  return { read: 0, search: 0, change: 0, check: 0 };
}

function directorySegments(path: string): string[] {
  return path.split('/').slice(0, -1);
}

function describeMovement(fromPath: string, toPath: string) {
  const from = directorySegments(fromPath);
  const to = directorySegments(toPath);
  let commonLength = 0;
  while (commonLength < from.length && commonLength < to.length && from[commonLength] === to[commonLength]) {
    commonLength += 1;
  }
  const upLevels = from.length - commonLength;
  const downLevels = to.length - commonLength;
  const direction: SessionPathDirection = upLevels === 0 && downLevels === 0
    ? 'same'
    : upLevels === 0
      ? 'down'
      : downLevels === 0
        ? 'up'
        : 'cross';
  return {
    direction,
    commonDirectory: commonLength === 0 ? '.' : from.slice(0, commonLength).join('/'),
    upLevels,
    downLevels,
    directoryDepthDelta: to.length - from.length,
  };
}

function nodeId(type: SessionPathNode['type'], path: string): string {
  return `${type}:${path}`;
}

/**
 * Builds bounded, content-free repository traversal evidence from an already
 * normalized session source. Labels describe observable event order only; they
 * do not claim intent, causation, quality, or time spent understanding a file.
 */
export function analyzeSessionPathTraversal(
  touches: SessionPathTouch[],
  options: {
    maximumTouches?: number;
    maximumNodes?: number;
    maximumEdges?: number;
    maximumTransitions?: number;
  } = {},
): SessionPathTraversalAnalysis {
  const maximumTouches = boundedOption(options.maximumTouches, DEFAULT_MAXIMUM_TOUCHES);
  const maximumNodes = boundedOption(options.maximumNodes, DEFAULT_MAXIMUM_NODES, 1);
  const maximumEdges = boundedOption(options.maximumEdges, DEFAULT_MAXIMUM_EDGES);
  const maximumTransitions = boundedOption(options.maximumTransitions, DEFAULT_MAXIMUM_TRANSITIONS);
  const accepted: Array<Omit<NormalizedTouch, 'phase'>> = [];
  let ignoredUnsafePaths = 0;
  let invalidTimestamps = 0;

  touches.forEach((touch, sequence) => {
    const path = normalizeSessionRepositoryPath(touch.path);
    if (!path) {
      ignoredUnsafePaths += 1;
      return;
    }
    if (!Number.isFinite(Date.parse(touch.occurredAt))) invalidTimestamps += 1;
    accepted.push({ ...touch, path, sequence });
  });

  let sawChange = false;
  let sawCheckAfterChange = false;
  const analyzed: NormalizedTouch[] = accepted.slice(0, maximumTouches).map((touch) => {
    const phase = phaseForTouch(touch.kind, sawChange, sawCheckAfterChange);
    if (touch.kind === 'change') {
      sawChange = true;
      sawCheckAfterChange = false;
    } else if (touch.kind === 'check' && sawChange) {
      sawCheckAfterChange = true;
    }
    return { ...touch, phase };
  });

  const nodes: SessionPathNode[] = [{
    id: nodeId('repository', '.'), path: '.', type: 'repository', parentId: null, depth: 0,
    visitCount: 0, revisitCount: 0, observedKinds: [], firstSequence: null, lastSequence: null,
  }];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  let omittedNodes = 0;

  const addNode = (node: SessionPathNode) => {
    const existing = nodesById.get(node.id);
    if (existing) return existing;
    if (nodes.length >= maximumNodes) {
      omittedNodes += 1;
      return null;
    }
    nodes.push(node);
    nodesById.set(node.id, node);
    return node;
  };

  const recordNodeVisit = (node: SessionPathNode, touch: NormalizedTouch) => {
    node.visitCount += 1;
    node.revisitCount = Math.max(0, node.visitCount - 1);
    if (!node.observedKinds.includes(touch.kind)) node.observedKinds.push(touch.kind);
    node.firstSequence ??= touch.sequence;
    node.lastSequence = touch.sequence;
  };

  analyzed.forEach((touch) => {
    const segments = touch.path.split('/');
    let parentId = nodeId('repository', '.');
    recordNodeVisit(nodes[0], touch);
    for (let index = 0; index < segments.length - 1; index += 1) {
      const path = segments.slice(0, index + 1).join('/');
      const directory = addNode({
        id: nodeId('directory', path), path, type: 'directory', parentId, depth: index + 1,
        visitCount: 0, revisitCount: 0, observedKinds: [], firstSequence: null, lastSequence: null,
      });
      if (!directory) return;
      recordNodeVisit(directory, touch);
      parentId = directory.id;
    }
    const file = addNode({
      id: nodeId('file', touch.path), path: touch.path, type: 'file', parentId, depth: segments.length,
      visitCount: 0, revisitCount: 0, observedKinds: [], firstSequence: null, lastSequence: null,
    });
    if (!file) return;
    recordNodeVisit(file, touch);
  });

  const transitions: SessionPathTransition[] = [];
  const edges: SessionPathEdge[] = [];
  const edgesByKey = new Map<string, SessionPathEdge>();
  const directionCounts: Record<SessionPathDirection, number> = { up: 0, down: 0, same: 0, cross: 0 };
  let omittedEdges = 0;
  let omittedTransitions = 0;

  for (let index = 1; index < analyzed.length; index += 1) {
    const previous = analyzed[index - 1];
    const current = analyzed[index];
    const movement = describeMovement(previous.path, current.path);
    directionCounts[movement.direction] += 1;
    const fromNodeId = nodeId('file', previous.path);
    const toNodeId = nodeId('file', current.path);
    const transition: SessionPathTransition = {
      sequence: current.sequence,
      fromNodeId,
      toNodeId,
      fromPath: previous.path,
      toPath: current.path,
      occurredAt: current.occurredAt,
      promptKey: current.promptKey ?? null,
      phase: current.phase,
      ...movement,
    };
    if (transitions.length < maximumTransitions) transitions.push(transition);
    else omittedTransitions += 1;

    if (!nodesById.has(fromNodeId) || !nodesById.has(toNodeId)) {
      omittedEdges += 1;
      continue;
    }
    const key = `${fromNodeId}\0${toNodeId}\0${movement.direction}`;
    const edge = edgesByKey.get(key);
    if (edge) {
      edge.traversalCount += 1;
      edge.lastSequence = current.sequence;
    } else if (edges.length < maximumEdges) {
      const created: SessionPathEdge = {
        fromNodeId,
        toNodeId,
        direction: movement.direction,
        traversalCount: 1,
        firstSequence: current.sequence,
        lastSequence: current.sequence,
      };
      edges.push(created);
      edgesByKey.set(key, created);
    } else {
      omittedEdges += 1;
    }
  }

  const phases: SessionPathPhase[] = [];
  analyzed.forEach((touch) => {
    const previous = phases.at(-1);
    if (previous?.label === touch.phase) {
      previous.endSequence = touch.sequence;
      previous.touchCount += 1;
      previous.observedKinds[touch.kind] += 1;
      return;
    }
    const observedKinds = emptyKindCounts();
    observedKinds[touch.kind] = 1;
    phases.push({
      label: touch.phase,
      startSequence: touch.sequence,
      endSequence: touch.sequence,
      touchCount: 1,
      observedKinds,
    });
  });

  const uniqueFiles = new Set(analyzed.map((touch) => touch.path));
  const uniqueDirectories = new Set(analyzed.flatMap((touch) => {
    const segments = directorySegments(touch.path);
    return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
  }));
  const totalRevisits = analyzed.length - uniqueFiles.size;
  const truncatedTouches = accepted.length - analyzed.length;
  const limitations = [
    'Path touches show observed navigation, not why a path was chosen or whether its contents influenced the agent.',
    'Elapsed attention and semantic understanding cannot be derived from discrete path touches.',
  ];
  if (ignoredUnsafePaths > 0) limitations.push('Unsafe absolute or parent-traversal paths were excluded.');
  if (invalidTimestamps > 0) limitations.push('Some accepted touches had invalid timestamps; input order remains authoritative.');
  if (truncatedTouches > 0) limitations.push('The accepted touch stream exceeded the deterministic analysis limit.');
  if (omittedNodes > 0) limitations.push('The repository tree exceeded the node limit.');
  if (omittedEdges > 0) limitations.push('The aggregate traversal graph exceeded its edge or node coverage limit.');
  if (omittedTransitions > 0) limitations.push('The ordered traversal list exceeded the transition limit.');

  return {
    nodes,
    edges,
    transitions,
    phases,
    summary: {
      uniqueDirectories: uniqueDirectories.size,
      uniqueFiles: uniqueFiles.size,
      totalRevisits,
      directionCounts,
    },
    coverage: {
      receivedTouches: touches.length,
      acceptedTouches: accepted.length,
      analyzedTouches: analyzed.length,
      ignoredUnsafePaths,
      invalidTimestamps,
      truncatedTouches,
      omittedNodes,
      omittedEdges,
      omittedTransitions,
      complete: ignoredUnsafePaths === 0 && invalidTimestamps === 0 && truncatedTouches === 0
        && omittedNodes === 0 && omittedEdges === 0 && omittedTransitions === 0,
      limitations,
    },
  };
}
