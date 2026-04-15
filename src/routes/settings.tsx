import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings')({
  component: Settings,
});

function Settings() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
      <h1 className="text-2xl font-semibold mb-2">Settings</h1>
      <p>Configure your preferences here.</p>
    </div>
  );
}
