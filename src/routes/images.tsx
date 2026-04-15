import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/images')({
  component: Images,
});

function Images() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
      <h1 className="text-2xl font-semibold mb-2">Image Processing</h1>
      <p>This feature is coming soon.</p>
    </div>
  );
}
