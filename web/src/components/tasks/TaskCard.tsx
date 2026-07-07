import { useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pause,
  Play,
  Trash2,
  Zap,
} from 'lucide-react';
import { ScheduledTask } from '../../stores/tasks';
import { TaskDetail } from './TaskDetail';
import { showToast } from '../../utils/toast';
import {
  formatContextMode,
  formatInterval,
  formatTaskStatus,
} from '../../utils/task-utils';

interface TaskCardProps {
  task: ScheduledTask;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onRunNow?: (id: string) => void;
  isRunning?: boolean;
}

export function TaskCard({
  task,
  onPause,
  onResume,
  onDelete,
  onRunNow,
  isRunning = false,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const navigate = useNavigate();

  const getStatusColor = () => {
    if (isRunning) {
      return 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300';
    }
    switch (task.status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400';
      case 'parsing':
        return 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400';
      case 'paused':
        return 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400';
      case 'completed':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const handleTogglePause = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isRunning) return;
    if (task.status === 'active') {
      onPause(task.id);
    } else {
      onResume(task.id);
    }
  };

  const handleRunNow = async (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!onRunNow || runningNow || isRunning) return;
    setRunningNow(true);
    try {
      await onRunNow(task.id);
      showToast('任务已触发', '后台执行中，稍后刷新查看结果');
    } catch (err) {
      showToast('触发失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setRunningNow(false);
    }
  };

  const handleDelete = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (isRunning) return;
    onDelete(task.id);
  };

  const toggleExpanded = () => setExpanded((v) => !v);

  const handleSummaryKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded();
    }
  };

  return (
    <article className="rounded-lg border border-border bg-card transition-colors duration-200 hover:border-primary/60">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={toggleExpanded}
          onKeyDown={handleSummaryKeyDown}
          aria-expanded={expanded}
          className="min-w-0 flex-1 cursor-pointer text-left"
        >
          <div className="min-w-0">
            {/* Title — derived from prompt first line, same as workspace name */}
            <p className="text-foreground font-semibold text-sm mb-1">
              {(task.prompt || '').split('\n')[0].trim().slice(0, 30).trim() ||
                task.id.slice(0, 8)}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {task.execution_type === 'script' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300">
                  脚本
                </span>
              )}
              {task.execution_mode && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    task.execution_mode === 'host'
                      ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300'
                      : 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-300'
                  }`}
                >
                  {task.execution_mode === 'host' ? '宿主机' : 'Docker'}
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {formatContextMode(task.context_mode)}
              </span>
              <span className="text-xs text-muted-foreground">
                {task.schedule_type === 'cron' && task.schedule_value}
                {task.schedule_type === 'interval' &&
                  `每 ${formatInterval(task.schedule_value)}`}
                {task.schedule_type === 'once' && '单次执行'}
              </span>
            </div>

            {/* Status Badge */}
            <div>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor()}`}
              >
                {formatTaskStatus(task.status, isRunning)}
              </span>
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/chat/${task.group_folder}`);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-50 hover:text-primary"
            title="打开所属工作区"
            aria-label="打开所属工作区"
          >
            <ExternalLink className="h-5 w-5" />
          </button>

          {onRunNow &&
            (task.status === 'active' || task.status === 'paused') && (
              <button
                type="button"
                onClick={handleRunNow}
                disabled={runningNow || isRunning}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-amber-950/40 dark:hover:text-amber-400"
                title={task.status === 'paused' ? '立即执行一次' : '立即运行'}
                aria-label={
                  task.status === 'paused'
                    ? '暂停状态立即执行一次'
                    : '立即运行任务'
                }
              >
                <Zap
                  className={`h-5 w-5 ${runningNow || isRunning ? 'animate-pulse text-amber-500' : ''}`}
                />
              </button>
            )}

          {(task.status === 'active' || task.status === 'paused') && (
            <button
              type="button"
              onClick={handleTogglePause}
              disabled={isRunning}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              title={task.status === 'active' ? '暂停' : '恢复'}
              aria-label={task.status === 'active' ? '暂停任务' : '恢复任务'}
            >
              {task.status === 'active' ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={isRunning}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            title={isRunning ? '执行中不可删除' : '删除'}
            aria-label="删除任务"
          >
            <Trash2 className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={toggleExpanded}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
            title={expanded ? '收起详情' : '展开详情'}
            aria-label={expanded ? '收起任务详情' : '展开任务详情'}
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-border">
          <TaskDetail task={task} />
        </div>
      )}
    </article>
  );
}
