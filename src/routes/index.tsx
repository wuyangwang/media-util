import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Trash2, Play, Plus, FolderPlus, FileVideo } from 'lucide-react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

interface MediaInfo {
  format: string;
  size: number;
  duration: number;
  video?: {
    width: number;
    height: number;
    codec: string;
    fps: string;
    bitrate?: string;
  };
}

interface ProgressPayload {
  id: string;
  progress: number;
  status: string;
}

interface Task {
  id: string;
  path: string;
  fileName: string;
  progress: number;
  status: string;
  info?: MediaInfo;
}

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [preset, setPreset] = useState('720p');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const unlisten = listen<ProgressPayload>('conversion-progress', (event) => {
      setTasks(prev => prev.map(t => 
        t.id === event.payload.id 
          ? { ...t, progress: event.payload.progress, status: event.payload.status }
          : t
      ));
    });

    // Handle drag and drop
    const unlistenDrop = getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type === 'drop') {
        const paths = event.payload.paths;
        await handleAddPaths(paths);
      }
    });

    return () => {
      unlisten.then(fn => fn());
      unlistenDrop.then(fn => fn());
    };
  }, []);

  const handleAddPaths = async (paths: string[]) => {
    const newTasks: Task[] = [];
    for (const path of paths) {
      // Check if it's a directory (simple heuristic or backend check)
      // For now, let's let backend handle it
      try {
        const files = await invoke<string[]>('scan_directory', { path, mode: 'video' });
        for (const file of files) {
          if (tasks.find(t => t.path === file)) continue;
          const fileName = file.split(/[\\/]/).pop() || file;
          newTasks.push({
            id: Math.random().toString(36).substring(7),
            path: file,
            fileName,
            progress: 0,
            status: '待处理'
          });
        }
      } catch (err) {
        toast.error(`添加路径失败: ${err}`);
      }
    }
    setTasks(prev => [...prev, ...newTasks]);
  };

  const handlePickFiles = async () => {
    const files = await open({
      multiple: true,
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }]
    });
    if (files && Array.isArray(files)) {
      await handleAddPaths(files);
    } else if (files) {
      await handleAddPaths([files as string]);
    }
  };

  const handlePickDir = async () => {
    const dir = await open({ directory: true });
    if (dir) {
      await handleAddPaths([dir as string]);
    }
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const clearTasks = () => {
    setTasks([]);
  };

  const startBatch = async () => {
    if (tasks.length === 0 || processing) return;
    setProcessing(true);
    
    // Simple sequential processing
    for (const task of tasks) {
      if (task.status === 'Completed') continue;
      
      try {
        const outputPath = `${task.path.substring(0, task.path.lastIndexOf('.'))}_converted.mp4`;
        await invoke('convert_video', {
          id: task.id,
          inputPath: task.path,
          outputPath,
          preset,
        });
        
        // Wait for task to complete by polling or waiting for event (current logic relies on events)
        // In a more robust system, we would await a specific task completion promise
      } catch (err) {
        toast.error(`任务 ${task.fileName} 失败: ${err}`);
      }
    }
    setProcessing(false);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="p-6 border-b flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">批量视频转换</h2>
          <p className="text-muted-foreground text-sm">拖拽文件夹或多个视频文件到此处开始。</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handlePickFiles} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-1" /> 添加文件
          </Button>
          <Button onClick={handlePickDir} variant="outline" size="sm">
            <FolderPlus className="w-4 h-4 mr-1" /> 添加文件夹
          </Button>
          <Button 
            onClick={startBatch} 
            disabled={processing || tasks.length === 0}
            size="sm"
          >
            <Play className="w-4 h-4 mr-1" /> 全部开始
          </Button>
          <Button onClick={clearTasks} variant="ghost" size="sm" className="text-destructive">
             清空
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col p-6 gap-6">
        {/* Controls */}
        <Card className="shrink-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">转换预设:</span>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="选择预设" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p (HD)</SelectItem>
                  <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                  <SelectItem value="2k">2K (Quad HD)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              队列中: {tasks.length} 个任务
            </div>
          </CardContent>
        </Card>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl">
              <FileVideo className="w-12 h-12 mb-4 opacity-20" />
              <p>暂无任务</p>
              <p className="text-xs">支持多选文件或整个文件夹拖拽</p>
            </div>
          ) : (
            tasks.map(task => (
              <div key={task.id} className="p-4 bg-muted/30 border rounded-lg space-y-3 animate-in fade-in slide-in-from-top-1">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">{task.fileName}</h3>
                    <p className="text-xs text-muted-foreground truncate font-mono">{task.path}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-primary whitespace-nowrap">
                      {task.status}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeTask(task.id)}
                      disabled={processing && task.progress > 0 && task.progress < 100}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                {(task.progress > 0 || task.status !== '待处理') && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{task.status}</span>
                      <span>{task.progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={task.progress} className="h-1.5" />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
