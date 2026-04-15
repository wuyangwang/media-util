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
  format: String;
  size: number;
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
        { name: 'Media', extensions: ['mp4', 'mkv', 'avi', 'png', 'jpg', 'jpeg', 'webp'] }
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
        toast.error(`Failed to get media info: ${err}`);
      }
    }
  };

  const handleConvert = async () => {
    if (!filePath || !info) return;
    setConverting(true);
    setProgress(0);
    setStatus('Initializing...');
    try {
      const outputPath = `${filePath.substring(0, filePath.lastIndexOf('.'))}_converted.mp4`;
      
      if (info.video && info.video.codec !== 'image') {
        await invoke('convert_video', {
          id: 'task-1',
          inputPath: filePath,
          outputPath,
          preset,
        });
      } else {
        const imageOutput = `${filePath.substring(0, filePath.lastIndexOf('.'))}_converted.png`;
        await invoke('convert_image', {
          inputPath: filePath,
          outputPath: imageOutput,
        });
        toast.success('Image conversion finished!');
      }
    } catch (err) {
      toast.error(`Conversion failed: ${err}`);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select Media File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handlePickFile}>Pick File</Button>
            <span className="text-sm text-muted-foreground truncate flex-1">
              {filePath || 'No file selected'}
            </span>
          </div>

          {info && (
            <div className="grid grid-cols-2 gap-4 border p-4 rounded-md bg-muted/50 text-sm">
              <div><strong>Format:</strong> {info.format}</div>
              <div><strong>Size:</strong> {(info.size / 1024 / 1024).toFixed(2)} MB</div>
              {info.video && (
                <>
                  <div><strong>Resolution:</strong> {info.video.width} x {info.video.height}</div>
                  <div><strong>Codec:</strong> {info.video.codec}</div>
                  <div><strong>FPS:</strong> {info.video.fps}</div>
                  {info.video.bitrate && (
                    <div><strong>Bitrate:</strong> {(parseInt(info.video.bitrate) / 1000).toFixed(0)} kbps</div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {info && (
        <Card>
          <CardHeader>
            <CardTitle>Conversion Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Target Preset:</span>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Preset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p (HD)</SelectItem>
                  <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                  <SelectItem value="2k">2K (Quad HD)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Button 
                className="w-full" 
                onClick={handleConvert} 
                disabled={converting}
              >
                {converting ? 'Converting...' : 'Start Conversion'}
              </Button>
              {(converting || progress > 0) && (
                <div className="space-y-2 pt-4">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{status}</span>
                    <span>{progress.toFixed(1)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
