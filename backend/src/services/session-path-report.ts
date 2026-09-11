import {
  analyzeSessionPathTraversal,
  type SessionPathTouch,
  type SessionPathTraversalAnalysis,
} from './session-path-traversal.js';

export type SessionRepositoryTraversalReport = {
  available: boolean;
  limitation: string | null;
  totalFileHits: number;
  uniqueFiles: number;
  totalDirectoryVisits: number;
  directionCounts: { down: number; up: number; cross: number; same: number; revisit: number };
  directories: Array<{ id: string; path: string; parentId: string | null; depth: number; firstVisitOrder: number; visitCount: number }>;
  transitions: Array<{
    id: string;
    order: number;
    fromPath: string | null;
    toPath: string;
    direction: 'entry' | 'down' | 'up' | 'cross' | 'same' | 'revisit';
    hitCount: number;
    heuristic: { phase: string | null; reason: string | null; basis: string[]; confidence: 'low' | 'medium' | 'high' } | null;
  }>;
  directoriesTruncated: boolean;
  transitionsTruncated: boolean;
};

function phaseReason(phase: SessionPathTraversalAnalysis['transitions'][number]['phase']) {
  if (phase === 'pre-change-observation') return 'read or search path observed before the first change';
  if (phase === 'change-activity') return 'repository change path observed';
  if (phase === 'check-activity') return 'verification command path observed';
  if (phase === 'post-check-observation') return 'read or search path observed after verification';
  return 'read or search path observed after a change';
}

export function buildSessionRepositoryTraversalReport(touches: SessionPathTouch[]): SessionRepositoryTraversalReport {
  const analysis = analyzeSessionPathTraversal(touches, { maximumTouches: 1_000, maximumNodes: 500, maximumEdges: 500, maximumTransitions: 250 });
  const directories = analysis.nodes.filter(node => node.type !== 'file').map(node => ({
    id: node.id,
    path: node.type === 'repository' ? '' : node.path,
    parentId: node.parentId,
    depth: node.depth,
    firstVisitOrder: (node.firstSequence ?? 0) + 1,
    visitCount: node.visitCount,
  }));
  const firstFile = analysis.nodes.filter(node => node.type === 'file' && node.firstSequence !== null)
    .sort((left, right) => (left.firstSequence ?? 0) - (right.firstSequence ?? 0))[0];
  const entryPhase = firstFile?.firstSequence === null || firstFile?.firstSequence === undefined ? null
    : analysis.phases.find(phase => firstFile.firstSequence! >= phase.startSequence && firstFile.firstSequence! <= phase.endSequence)?.label ?? null;
  const transitions: SessionRepositoryTraversalReport['transitions'] = firstFile ? [{
    id: `entry:${firstFile.id}`,
    order: 1,
    fromPath: null,
    toPath: firstFile.path,
    direction: 'entry',
    hitCount: 1,
    heuristic: entryPhase ? {
      phase: entryPhase.replaceAll('-', ' '),
      reason: phaseReason(entryPhase),
      basis: ['first observable repository-relative path touch'],
      confidence: 'medium',
    } : null,
  }] : [];
  transitions.push(...analysis.transitions.map((transition, index) => {
    const revisit = transition.fromPath === transition.toPath;
    const direction: SessionRepositoryTraversalReport['transitions'][number]['direction'] = revisit ? 'revisit' : transition.direction;
    return {
      id: `${transition.sequence}:${transition.fromNodeId}:${transition.toNodeId}`,
      order: index + 2,
      fromPath: transition.fromPath,
      toPath: transition.toPath,
      direction,
      hitCount: 1,
      heuristic: {
        phase: transition.phase.replaceAll('-', ' '),
        reason: phaseReason(transition.phase),
        basis: [
          `observable ${transition.phase.replaceAll('-', ' ')}`,
          `${transition.upLevels} levels up`,
          `${transition.downLevels} levels down`,
          ...(transition.promptKey ? ['normalized prompt boundary available'] : []),
        ],
        confidence: 'medium' as const,
      },
    };
  }));
  return {
    available: analysis.coverage.acceptedTouches > 0,
    limitation: analysis.coverage.acceptedTouches > 0 ? `${analysis.coverage.limitations.join(' ')} Coverage is limited to explicit file operands of supported simple shell commands and patch headers. Script wrappers, compound commands, directory targets, and dynamic paths are omitted. At most 50 unique files per call, 2,000 touches per worker, and the first 1,000 touches per saved review are retained; totals describe retained evidence only.` : 'No compatible repository-relative path touches were observed.',
    totalFileHits: analysis.coverage.analyzedTouches,
    uniqueFiles: analysis.summary.uniqueFiles,
    totalDirectoryVisits: directories.reduce((sum, directory) => sum + directory.visitCount, 0),
    directionCounts: {
      down: analysis.summary.directionCounts.down,
      up: analysis.summary.directionCounts.up,
      cross: analysis.summary.directionCounts.cross,
      same: analysis.summary.directionCounts.same,
      revisit: analysis.summary.totalRevisits,
    },
    directories,
    transitions,
    directoriesTruncated: analysis.coverage.omittedNodes > 0,
    transitionsTruncated: analysis.coverage.omittedTransitions > 0,
  };
}
