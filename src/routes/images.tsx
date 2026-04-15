import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export const Route = createFileRoute('/images')({
  component: Images,
});

function Images() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [info, setInfo] = useState<MediaInfo | null>(null);
  const [targetFormat, setTargetFormat] = useState('png');
  const [converting, setConverting] = useState(false);

  const handlePickFile = async () => {
    const file = await open({
      multiple: false,
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] }
      ]
    });

    if (file) {
      setFilePath(file as string);
      try {
        const mediaInfo = await invoke<MediaInfo>('get_media_info', { path: file });
        setInfo(mediaInfo);
      } catch (err) {
        toast.error(`Failed to get image info: ${err}`);
      }
    }
  };

  const handleConvert = async () => {
    if (!filePath || !info) return;
    setConverting(true);
    try {
      const baseName = filePath.substring(0, filePath.lastIndexOf('.'));
      const outputExtension = targetFormat;
      const outputPath = `${baseName}_converted.${outputExtension}`;

      await invoke('convert_image', {
        inputPath: filePath,
        outputPath,
      });
      
      toast.success(`Image converted successfully to ${targetFormat.toUpperCase()}`);
    } catch (err) {
      toast.error(`Image conversion failed: ${err}`);
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="p-6 border-b">
        <h2 className="text-2xl font-bold tracking-tight">图片转换器</h2>
        <p className="text-muted-foreground">转换图片格式，支持主流格式之间的快速转换。</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">选择图片</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button onClick={handlePickFile} variant="outline" className="shrink-0">
                选择图片文件
              </Button>
              <div className="flex-1 p-2 bg-muted rounded-md border text-sm truncate font-mono">
                {filePath || '未选择任何文件'}
              </div>
            </div>

            {info && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                <InfoItem label="当前格式" value={info.format.toUpperCase()} />
                <InfoItem label="文件大小" value={`${(info.size / 1024).toFixed(2)} KB`} />
                {info.video && (
                  <>
                    <InfoItem label="分辨率" value={`${info.video.width} x ${info.video.height}`} />
                    <InfoItem label="类型" value="静态图片" />
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
                <span className="text-sm font-medium">目标格式:</span>
                <Select value={targetFormat} onValueChange={setTargetFormat}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="选择目标格式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpg">JPEG (JPG)</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                    <SelectItem value="bmp">BMP</SelectItem>
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
