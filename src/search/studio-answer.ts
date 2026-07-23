interface StudioAgentAnswer {
  answer: string;
  sourceCount: number;
}

interface StudioAnswerDocument {
  title: string;
  excerpt?: string;
  body?: string;
}

/** Source-backed agent output wins; otherwise summarize the documents that search actually returned. */
export function buildStudioAnswer(
  agent: StudioAgentAnswer | null,
  documents: StudioAnswerDocument[],
): string | null {
  if (agent && agent.sourceCount > 0) return agent.answer;
  if (documents.length === 0) return null;

  return documents
    .slice(0, 3)
    .map((document) => `**${document.title}**\n${document.excerpt ?? document.body ?? ''}`)
    .join('\n\n');
}
