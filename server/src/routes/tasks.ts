import { Router } from 'express';
import { listTasks, getTask, runAgentTask } from '../tasks';
import { getRegistered } from '../registry';
import { addActivity } from '../db';
import { hub } from '../ws';

export const router = Router();

router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  res.json({ tasks: listTasks(limit) });
});

router.get('/:id', (req, res) => {
  const task = getTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json({ task });
});

router.post('/:id/rerun', async (req, res) => {
  const task = getTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  const agent = getRegistered(task.agent_id);
  if (!agent) {
    res.status(404).json({ error: 'Agent for task no longer registered' });
    return;
  }
  const { prompt, timeout } = (req.body || {}) as { prompt?: string; timeout?: number };
  const rerun = await runAgentTask(task.agent_id, task.instance || undefined, prompt || task.prompt, timeout);
  addActivity('task_rerun', 'Reran task ' + task.prompt.slice(0, 80), task.agent_id, {
    fromTask: task.id,
    newTask: rerun.id,
  });
  hub.broadcast('tasks:changed', { taskId: rerun.id });
  res.json({ taskId: rerun.id, ok: true });
});