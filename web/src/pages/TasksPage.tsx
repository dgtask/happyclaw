import { useEffect, useState } from 'react';
import { useTasksStore } from '../stores/tasks';
import { useAuthStore } from '../stores/auth';
import { useGroupsStore } from '../stores/groups';
import { TaskCard } from '../components/tasks/TaskCard';
import { CreateTaskForm } from '../components/tasks/CreateTaskForm';
import { Plus, RefreshCw, Clock, X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { SkeletonCardList } from '@/components/common/Skeletons';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';

export function TasksPage() {
  const {
    tasks,
    loading,
    error,
    runningTaskIds,
    loadTasks,
    createTask,
    updateTaskStatus,
    deleteTask,
    runTaskNow,
  } = useTasksStore();
  const { user } = useAuthStore();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Poll while any task is parsing/running so UI updates when done
  const hasParsing = tasks.some((t) => t.status === 'parsing');
  const hasRunning = runningTaskIds.size > 0;
  useEffect(() => {
    if (!hasParsing && !hasRunning) return;
    const interval = setInterval(loadTasks, 3000);
    return () => clearInterval(interval);
  }, [hasParsing, hasRunning, loadTasks]);

  const handleCreateTask = async (data: {
    prompt: string;
    scheduleType: 'cron' | 'interval' | 'once';
    scheduleValue: string;
    executionType: 'agent' | 'script';
    executionMode?: 'host' | 'container';
    scriptCommand: string;
    notifyChannels: string[] | null;
    chatJid?: string;
    contextMode?: 'group' | 'isolated';
  }) => {
    await createTask(
      data.prompt,
      data.scheduleType,
      data.scheduleValue,
      data.executionType,
      data.executionMode,
      data.scriptCommand,
      data.notifyChannels,
      data.chatJid,
      data.contextMode,
    );
    // Only close the form when the store reports no error — failures surface
    // as a toast inside CreateTaskForm and the form stays open for retry.
    if (!useTasksStore.getState().error) {
      setShowCreateForm(false);
    }
  };

  const handlePause = async (id: string) => {
    if (confirm('确定要暂停此任务吗？')) {
      await updateTaskStatus(id, 'paused');
    }
  };

  const handleResume = async (id: string) => {
    if (confirm('确定要恢复此任务吗？')) {
      await updateTaskStatus(id, 'active');
    }
  };

  const handleDelete = async (id: string) => {
    if (
      confirm(
        '确定要删除此任务吗？这会删除任务配置和执行记录，不会删除所属工作区。',
      )
    ) {
      await deleteTask(id);
      useGroupsStore.getState().loadGroups();
    }
  };

  const enabledTasks = tasks.filter((t) => t.status === 'active');
  const pausedTasks = tasks.filter((t) => t.status === 'paused');
  const otherTasks = tasks.filter(
    (t) => t.status !== 'active' && t.status !== 'paused',
  );

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        <PageHeader
          title="定时任务管理"
          subtitle={`共 ${tasks.length} 个任务 · ${enabledTasks.length} 已启用 · ${runningTaskIds.size} 执行中 · ${pausedTasks.length} 已暂停`}
          className="mb-6"
          actions={
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Button variant="outline" onClick={loadTasks} disabled={loading}>
                <RefreshCw
                  size={18}
                  className={loading ? 'animate-spin' : ''}
                />
                刷新
              </Button>
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus size={18} />
                创建任务
              </Button>
            </div>
          }
        />

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error-bg border border-error/20 flex items-center justify-between">
            <span className="text-sm text-error">{error}</span>
            <button
              onClick={() => useTasksStore.setState({ error: null })}
              className="p-1 text-error hover:text-error rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {loading && tasks.length === 0 ? (
          <SkeletonCardList count={4} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="还没有创建任何定时任务"
            description="定时任务会在所属工作区内自动执行，默认使用独立任务会话，不影响主会话上下文。"
            action={
              <Button onClick={() => setShowCreateForm(true)}>
                <Plus size={18} />
                创建第一个任务
              </Button>
            }
          />
        ) : (
          <div className="space-y-6">
            {enabledTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  已启用
                </h2>
                <div className="space-y-3">
                  {enabledTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isRunning={runningTaskIds.has(task.id)}
                      onPause={handlePause}
                      onResume={handleResume}
                      onDelete={handleDelete}
                      onRunNow={runTaskNow}
                    />
                  ))}
                </div>
              </div>
            )}

            {pausedTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  已暂停
                </h2>
                <div className="space-y-3">
                  {pausedTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isRunning={runningTaskIds.has(task.id)}
                      onPause={handlePause}
                      onResume={handleResume}
                      onDelete={handleDelete}
                      onRunNow={runTaskNow}
                    />
                  ))}
                </div>
              </div>
            )}

            {otherTasks.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  其他
                </h2>
                <div className="space-y-3">
                  {otherTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isRunning={runningTaskIds.has(task.id)}
                      onPause={handlePause}
                      onResume={handleResume}
                      onDelete={handleDelete}
                      onRunNow={runTaskNow}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showCreateForm && (
        <CreateTaskForm
          onSubmit={handleCreateTask}
          onClose={() => {
            setShowCreateForm(false);
            loadTasks();
          }}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
