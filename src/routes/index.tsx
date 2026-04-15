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

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [preset, setPreset] = useState('720p');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const unlisten = listen<ProgressPayload>('conversion-progress', (event) => {
      setProgress(event.payload.progress);
      setStatus(event.payload.status);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handlePickFile = async () => {
    const file = await open({
      multiple: false,
      filters: [
        { name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm'] }
      ]
    });

    if (file) {
      setFilePath(file as string);
      setProgress(0);
      setStatus('');
      try {
        const mediaInfo = await invoke<MediaInfo>('get_media_info', { path: file });
        setInfo(mediaInfo);
      } catch (err) {
        toast.error(`获取媒体信息失败: ${err}`);
      }
    }
  };

  const handleConvert = async () => {
    if (!filePath || !info) return;
    setConverting(true);
    setProgress(0);
    setStatus('正在初始化...');
    try {
      const outputPath = `${filePath.substring(0, filePath.lastIndexOf('.'))}_converted.mp4`;
      
      await invoke('convert_video', {
        id: 'task-1',
        inputPath: filePath,
        outputPath,
        preset,
      });
    } catch (err) {
      toast.error(`转换失败: ${err}`);
    } finally {
      setConverting(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="p-6 border-b">
        <h2 className="text-2xl font-bold tracking-tight">视频转换器</h2>
        <p className="text-muted-foreground">转换视频格式和分辨率，支持多种预设。</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">选择视频</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button onClick={handlePickFile} variant="outline" className="shrink-0">
                选择视频文件
              </Button>
              <div className="flex-1 p-2 bg-muted rounded-md border text-sm truncate font-mono">
                {filePath || '未选择任何文件'}
              </div>
            </div>

            {info && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
                <InfoItem label="格式" value={info.format} />
                <InfoItem label="大小" value={`${(info.size / 1024 / 1024).toFixed(2)} MB`} />
                <InfoItem label="时长" value={formatDuration(info.duration)} />
                {info.video && (
                  <>
                    <InfoItem label="分辨率" value={`${info.video.width} x ${info.video.height}`} />
                    <InfoItem label="编码" value={info.video.codec} />
                    <InfoItem label="帧率" value={info.video.fps} />
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {info && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">转换设置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">目标预设:</span>
                <Select value={preset} onValueChange={setPreset}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="选择预设" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="720p">720p (HD)</SelectItem>
                    <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                    <SelectItem value="2k">2K (Quad HD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <Button 
                  className="w-full h-12 text-lg font-semibold shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99]" 
                  onClick={handleConvert} 
                  disabled={converting || !filePath}
                >
                  {converting ? '正在转换...' : '开始转换'}
                </Button>

                {(converting || progress > 0) && (
                  <div className="space-y-3 p-4 bg-muted/50 rounded-xl border animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <span className="text-sm font-medium text-foreground">{status}</span>
                        <p className="text-xs text-muted-foreground">请勿关闭应用程序</p>
                      </div>
                      <span className="text-2xl font-bold text-primary">{progress.toFixed(1)}%</span>
                    </div>
                    <Progress value={progress} className="h-3 rounded-full" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col p-3 bg-muted/30 rounded-lg border border-dashed">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm font-bold truncate">{value}</span>
    </div>
  );
}
