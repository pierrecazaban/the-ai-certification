import type { GlossaryEntry, ModuleVideo } from '../types';

// Extras of the modules in English (24/11), see fr-extras.ts: two YouTube videos per module, in English and different
// from the French ones (lib/learning/index.ts checks it), each one checked (it exists, duration, chapters), and the
// glossary used by the booklet and the course assistant. Videos are links, never an embedded player.

export const extras: Record<string, { videos: ModuleVideo[]; glossary: GlossaryEntry[] }> = {
  'v2-m1': {
    videos: [
      { id: 'LPZh9BOjkQs', title: 'Large Language Models explained briefly', channel: '3Blue1Brown', minutes: 8,
        why: 'Next-word prediction, training and weights, in eight minutes of clear animations.' },
      { id: 'wjZofJX0v4M', title: 'Transformers, the tech behind LLMs', channel: '3Blue1Brown', minutes: 27,
        why: 'Tokens, vectors, attention and temperature, step by step, when you want the full picture.' },
    ],
    glossary: [
      { term: 'Token', def: 'A piece of text (a word, part of a word, punctuation) the model works with. The unit of billing and of the context limit.' },
      { term: 'Vector (embedding)', def: 'A list of numbers that represents a token, a sentence or a document. Close meanings give close vectors.' },
      { term: 'Cosine similarity', def: 'A measure of how close two vectors are: near 1, the meanings are close; near 0, they are unrelated.' },
      { term: 'Weights (parameters)', def: 'The billions of numbers tuned during training. They hold everything the model “knows”.' },
      { term: 'Pre-training', def: 'First phase: the model learns to guess the next token on huge amounts of text.' },
      { term: 'Fine-tuning', def: 'Adjusting the model on chosen examples, such as questions and their good answers.' },
      { term: 'RLHF', def: 'Adjusting from human preferences: people compare several answers and pick the best one.' },
      { term: 'Temperature', def: 'How much chance goes into picking the next token. Low: stable answers. High: varied answers, with more risk.' },
      { term: 'Hallucination', def: 'A plausible but false answer, produced when the information is missing: the model aims for likely, not verified.' },
      { term: 'Context window', def: 'The maximum number of tokens handled at once: instructions, history, pasted documents and the answer being written.' },
      { term: 'Attention', def: 'The mechanism that weighs how much each token of the context matters to produce the next one. The core of Transformers.' },
      { term: 'Knowledge cutoff', def: 'The date where the training data stops. Without web search, the model does not know what happened after it.' },
    ],
  },
  'v2-m2': {
    videos: [
      { id: 'ysPbXH0LpIE', title: 'Prompting 101', channel: 'Anthropic', minutes: 25,
        why: 'A full prompt built live on a real case: task context, background, examples, output format.' },
      { id: 'zYGDpG-pTho', title: 'RAG vs Fine-Tuning vs Prompt Engineering: Optimizing AI Models', channel: 'IBM Technology', minutes: 13,
        why: 'The three ways to get better answers, and when to choose each one, as in lesson 2.' },
    ],
    glossary: [
      { term: 'System prompt', def: 'The standing instructions given to the model: role and goal, context, method, rules, output format.' },
      { term: 'Few-shot', def: 'Giving two or three examples of input and expected output in the prompt: the model reproduces the structure.' },
      { term: 'Structured output', def: 'An answer in a fixed format that software can reuse, most often JSON with defined fields.' },
      { term: 'JSON', def: 'A data format made of named fields (“company”, “score”…), understood by spreadsheets, CRMs and automation tools.' },
      { term: 'JSON mode', def: 'An option of many tools that enforces the format or a schema: it removes most malformed answers.' },
      { term: 'UNKNOWN', def: 'The fallback value to ask for when information is missing, so the model does not make it up.' },
      { term: 'RAG', def: 'Retrieval-augmented generation: the useful passages of your documents are retrieved and the model answers from them.' },
      { term: 'Chunk', def: 'A piece of a document, a few hundred tokens long, cut for retrieval.' },
      { term: 'Vector database', def: 'A database that stores the vectors of the chunks and finds the ones closest to a question.' },
      { term: 'Fine-tuning', def: 'Retraining the model on your examples to change a style or a behaviour. Not to add facts that change often.' },
    ],
  },
  'v2-m3': {
    videos: [
      { id: 'FwOTs4UxQS4', title: 'AI Agents, Clearly Explained', channel: 'Jeff Su', minutes: 10,
        why: 'From chatbot to workflow to agent, with real examples: the three levels of lesson 1.' },
      { id: 'oigckzWPY60', title: 'Create Your First Scenario in Make', channel: 'Make', minutes: 7,
        why: 'Make’s own walkthrough: a trigger, an AI step and Google Sheets. Watch it before the exercise.' },
    ],
    glossary: [
      { term: 'Chatbot', def: 'Answers messages. It only produces text.' },
      { term: 'Workflow', def: 'A chain of steps fixed in advance: you decide the order, the model runs one step.' },
      { term: 'Agent', def: 'Gets a goal and tools, chooses the steps itself, looks at the result and repeats until it is done.' },
      { term: 'Tool calling', def: 'The model asks, in a structured form, to run a tool; the application runs it and sends the result back.' },
      { term: 'MCP', def: 'Model Context Protocol: an open standard to plug the same tools into any compatible assistant.' },
      { term: 'Scenario', def: 'In Make, an automation built by linking modules, without writing code.' },
      { term: 'Trigger', def: 'What starts the scenario: a new spreadsheet row, an email, a form, a fixed time.' },
      { term: 'Module', def: 'One step of the scenario: calling an AI model, writing to Google Sheets, sending a message.' },
      { term: 'Mapping', def: 'Passing data from one step to the next: the “company” field of the JSON becomes a spreadsheet column.' },
      { term: 'Filter and router', def: 'A filter lets data through only if a condition is true; a router sends it to different branches.' },
      { term: 'Operation', def: 'The unit used each time a module runs in Make. Watch it, like the model’s tokens.' },
      { term: 'Prompt injection', def: 'Trapped text, in an email or a web page, that tries to give instructions to the model reading it.' },
      { term: 'Least privilege', def: 'Giving the agent only the tools and rights its task strictly needs.' },
      { term: 'Data minimisation', def: 'A GDPR principle: send the model only the data the task needs.' },
    ],
  },
  'v2-m4': {
    videos: [
      { id: 'XguXU3NjnpE', title: 'Getting Started with AI Automation: Your easy start with Make AI Tools', channel: 'Make', minutes: 7,
        why: 'The AI step of your project without an API key: Make’s built-in AI modules.' },
      { id: 'rAEqP9VEhe8', title: 'Generative AI’s Greatest Flaw', channel: 'Computerphile', minutes: 12,
        why: 'Indirect prompt injection explained: what your trapped test case has to resist.' },
    ],
    glossary: [
      { term: 'Track', def: 'The project closest to your future job: business, finance, engineering or marketing.' },
      { term: 'AI step in JSON', def: 'The step where the model produces fixed fields that the next steps of the workflow reuse.' },
      { term: 'Human approval', def: 'A step where a person approves before any external action: sending, publishing, paying.' },
      { term: 'Test cases', def: 'Three runs to do: a normal case, a case with missing information, a trapped case.' },
      { term: 'Edge case', def: 'An unusual situation the workflow must handle: missing information, ambiguous content, an injection attempt.' },
      { term: 'Rubric', def: 'The five criteria of a good project: it works end to end, its output is usable, edge cases are handled, risks are controlled, the business value is clear.' },
      { term: 'Cost for 100 runs', def: 'Operations of the automation tool and tokens of the model, multiplied by the number of runs.' },
      { term: 'Business value', def: 'What the workflow really brings: time saved, a decision made easier.' },
    ],
  },
};
