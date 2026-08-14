import React, { useEffect, useMemo, useState } from 'react';
import type { Agent } from '../types';
import { useStore } from '../store';
import { Modal, Spinner } from './ui';
import { IconPlay } from './Icons';
import { apiGet } from '../api';
import type { AgentInstance } from '../types';

export default function TaskDock({
  open,
  onClose,
  agent,
  instanceId,
}: {
  open: boolean;
  onClose: () => void;
  agent: Agent | null;
  instanceId?: string;
}) {
  const { sendTask, liveTasks } = useStore();
  const [prompt, setPrompt] = useState('');
  const [instances, setInstances] = useState<AgentInstance[]>([]);
  const [instance, setInstance] = useState(instanceId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [taskId, setTaskId] = useState('');
  const [loadingInstances, setLoadingInstances] = useState(false);

  useEffect(() => {
    if (!open) {
      setPrompt('');
      setTaskId('');
      setError('');
      return;
    }
    setInstance(instanceId || '');
    if (agent && (agent.type === 'openclaw' || agent.type === 'hermes' || agent.type === 'generic')) {
      setLoadingInstances(true);
      apiGet<{ instances: AgentInstance[] }>(`/api/agents/${agent.id}/agents`)
        .then((r) => {
          setInstances(r.instances);
          if (!instanceId && r.instances.length && !r.instances[0].id.startsWith('main')) {
            // keep default empty to let adapter choose
          }
        })
        .catch(() => setInstances([]))
        .finally(() => setLoadingInstances(false));
    } else {
      setInstances([]);
    }
  }, [open, agent, instanceId]);

  const live = useMemo(() => {
    if (!taskId) return null;
    const t = liveTasks[taskId];
    return t || null;
  }, [liveTasks, taskId]);

  const submit = async () => {
    if (!agent || !prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    setTaskId('');
    try {
      const id = await sendTask(agent.id, instance, prompt.trim());
      setTaskId(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Run task · ${agent?.name || ''}`} wide>
      {agent && (
        <div className="space-y-4">
          {instances.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-400">Instance / agent</label>
              <div className="flex flex-wrap gap-2">
                {instances.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => setInstance(i.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                      instance === i.id
                        ? 'border-accent bg-accent/15 text-white'
                        : 'border-ink-600 bg-ink-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {i.name}
                    {i.model ? <span className="ml-1 opacity-60">· {i.model}</span> : null}
                  </button>
                ))}
                {!instance && (
                  <button
                    onClick={() => setInstance('')}
                    className="rounded-md border border-accent bg-accent/15 px-2.5 py-1 text-xs font-medium text-white"
                  >
                    default
                  </button>
                )}
              </div>
            </div>
          )}
          {loadingInstances && <Spinner label="loading instances…" />}

          <textarea
            className="input min-h-[120px] resize-y font-mono text-sm"
            placeholder={`Describe the task for ${agent.name}…`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          {error && <p className="text-xs text-rose-400">{error}</p>}

          {live && live.lines.length > 0 && (
            <div className="log-box max-h-64 overflow-y-auto">{live.lines.join('\n')}</div>
          )}

          <div className="flex items-center justify-between">
            {taskId && live ? (
              <span className="text-xs text-slate-400">
                {live.status === 'running' ? 'running…' : live.status === 'done' ? 'completed' : 'failed'}
              </span>
            ) : (
              <span className="text-xs text-slate-600">
                Output streams live. Tasks run as your local user.
              </span>
            )}
            <div className="flex gap-2">
              <button className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
              <button className="btn btn-primary" disabled={busy || !prompt.trim()} onClick={submit}>
                <IconPlay width={14} height={14} /> {busy ? 'Sending…' : 'Run task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}