import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Trash2, Play, Plus, FolderPlus, ImageIcon, Loader2, XCircle } from 'lucide-react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

interface Task {
  id: string;
  path: string;
  fileName: string;
  status: '待处理' | '正在转换...' | 'Completed' | 'Failed';
}

export const Route = createFileRoute('/images')({
  component: Images,
});

function Images() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [targetFormat, setTargetFormat] = useState('png');
  const [processing, setProcessing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    const unlistenDrop = getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type === 'drop') {
        const paths = event.payload.paths;
        await handleAddPaths(paths);
      }
    });

    return () => {
      unlistenDrop.then(fn => fn());
    };
  }, [tasks]);

  const handleAddPaths = async (paths: string[]) => {
    setIsScanning(true);
    const toastId = toast.loading('正在扫描图片文件...');
    let addedCount = 0;
    const newTasks: Task[] = [];

    try {
      for (const path of paths) {
        const files = await invoke<string[]>('scan_directory', { path, mode: 'image' });
        for (const file of files) {
          if (tasks.find(t => t.path === file)) continue;
          const fileName = file.split(/[\\/]/).pop() || file;
          newTasks.push({
            id: Math.random().toString(36).substring(7),
            path: file,
            fileName,
            status: '待处理'
          });
          addedCount++;
        }
      }
      if (newTasks.length > 0) {
        setTasks(prev => [...prev, ...newTasks]);
        toast.success(`成功添加 ${addedCount} 张图片`, { id: toastId });
      } else {
        toast.info('未发现新的可处理图片', { id: toastId });
      }
    } catch (err) {
      toast.error(`添加失败: ${err}`, { id: toastId });
    } finally {
      setIsScanning(false);
    }
  };

  const handlePickFiles = async () => {
    const files = await open({
      multiple: true,
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] }]
    });
    if (files) {
      await handleAddPaths(Array.isArray(files) ? files : [files]);
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
    const pendingTasks = tasks.filter(t => t.status !== 'Completed');
    if (pendingTasks.length === 0) {
      toast.info('所有任务已完成');
      return;
    }

    setProcessing(true);
    toast.info(`开始处理 ${pendingTasks.length} 个图片任务`);
    
    for (const task of tasks) {
      if (task.status === 'Completed') continue;
      
      try {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: '正在转换...' } : t));
        
        const baseName = task.path.substring(0, task.path.lastIndexOf('.'));
        const outputPath = `${baseName}_converted.${targetFormat}`;

        await invoke('convert_image', {
          inputPath: task.path,
          outputPath,
        });
        
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'Completed' } : t));
      } catch (err) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'Failed' } : t));
        toast.error(`任务 ${task.fileName} 失败: ${err}`);
      }
    }
    setProcessing(false);
    toast.success('图片批量转换完成');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="p-6 border-b flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">批量图片转换</h2>
          <p className="text-muted-foreground text-sm">
            {isScanning ? '正在扫描目录，请稍候...' : '拖拽文件夹或多个图片文件到此处开始。'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handlePickFiles} variant="outline" size="sm" disabled={isScanning || processing}>
            {isScanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            添加图片
          </Button>
          <Button onClick={handlePickDir} variant="outline" size="sm" disabled={isScanning || processing}>
            {isScanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FolderPlus className="w-4 h-4 mr-1" />}
            添加文件夹
          </Button>
          <Button 
            onClick={startBatch} 
            disabled={processing || tasks.length === 0 || isScanning}
            size="sm"
          >
            {processing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
            全部开始
          </Button>
          <Button onClick={clearTasks} variant="ghost" size="sm" className="text-destructive" disabled={processing || isScanning}>
             <XCircle className="w-4 h-4 mr-1" /> 清空
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col p-6 gap-6">
        <Card className="shrink-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">目标格式:</span>
              <Select value={targetFormat} onValueChange={setTargetFormat} disabled={processing}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="选择格式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpg">JPEG (JPG)</SelectItem>
                  <SelectItem value="webp">WebP</SelectItem>
                  <SelectItem value="bmp">BMP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground font-medium">
              队列中: {tasks.length} 个任务
            </div>
          </CardContent>
        </Card>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {tasks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-xl bg-muted/10">
              <ImageIcon className="w-16 h-16 mb-4 opacity-10" />
              <p className="text-lg font-medium opacity-50">暂无任务</p>
              <p className="text-sm opacity-40">点击上方按钮或拖拽文件夹开始</p>
            </div>
          ) : (
            tasks.map(task => (
              <div key={task.id} className="p-4 bg-muted/30 border rounded-lg flex justify-between items-center animate-in fade-in slide-in-from-top-1 transition-all hover:bg-muted/50">
                <div className="flex-1 min-w-0 mr-4">
                  <h3 className="text-sm font-semibold truncate flex items-center gap-2">
                    {task.fileName}
                    {task.status === 'Completed' && <span className="inline-block w-2 h-2 rounded-full bg-green-500" />}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate font-mono mt-0.5">{task.path}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                    task.status === 'Completed' ? 'bg-green-100 text-green-700' : 
                    task.status === 'Failed' ? 'bg-red-100 text-red-700' : 
                    task.status === '正在转换...' ? 'bg-primary/10 text-primary animate-pulse' : 
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {task.status}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => removeTask(task.id)}
                    disabled={processing && task.status === '正在转换...'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
