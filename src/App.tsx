import { ErrorBoundary } from './components/ErrorBoundary';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { WorkspaceProvider } from './context/WorkspaceContext';

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceProvider>
        <WorkspaceLayout />
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}
