// Test-only deterministic model: exercises official DSH execution, not model judgment.
export function adapterClass(LlmAdapter) {
  return class ScriptedLlm extends LlmAdapter {
    requests = [];
    failNext = false;
    actions = [];
    async *stream(options) {
      this.requests.push(options);
      if (this.failNext) { this.failNext = false; throw Error('AEGIS simulated model connection failure'); }
      const action = this.actions.shift();
      if (action && typeof action === 'object') {
        const block = { type: 'tool-call', id: 'test-' + this.requests.length, name: action.name, arguments: JSON.stringify(action.args) };
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments };
        yield { type: 'block-end', index: 0, block };
        yield { type: 'finish', reason: { kind: 'tool-calls' } };
        return;
      }
      const text = action || 'AEGIS scripted response ' + this.requests.length;
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text };
      yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  };
}
